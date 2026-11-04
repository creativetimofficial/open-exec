import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { z } from "zod"

import type { AppInfo } from "../agent"
import { SearchError, type SearchProvider, type SearchResult } from "./types"

/**
 * Parallel's Search MCP server. It answers without a key on a free,
 * rate-limited tier, which is what lets a fresh clone search before anyone
 * signs up for anything; a PARALLEL_API_KEY lifts the limits.
 *
 * Tool name and arguments (`web_search` with objective / search_queries /
 * session_id) and the result shape follow what CopilotKit's OpenDots ships
 * against this endpoint (src/server/parallel.ts there).
 */

export const PARALLEL_MCP_URL = "https://search.parallel.ai/mcp"

const resultItem = z.object({
  url: z.string(),
  title: z.string().nullable().optional(),
  excerpts: z.array(z.string()).default([]),
  publish_date: z.string().nullable().optional(),
})

const payload = z.object({
  results: z.array(z.unknown()),
  errors: z.array(z.unknown()).optional(),
  warnings: z.array(z.unknown()).nullable().optional(),
})

/** An MCP tools/call result → Parallel's payload, from structured content or the text part. */
export function parseParallelResult(result: unknown): { results: SearchResult[]; warnings: string[] } {
  const envelope = z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    })
    .parse(result)
  if (envelope.isError) {
    const text = envelope.content?.find((c) => c.type === "text")?.text ?? ""
    throw new SearchError(
      `Parallel could not complete the search${text ? `: ${text.slice(0, 200)}` : ""}. The free tier is rate-limited; set PARALLEL_API_KEY or retry shortly.`,
      /rate|limit|quota/i.test(text) ? "quota" : "upstream"
    )
  }
  let data = envelope.structuredContent
  if (!data) {
    const text = envelope.content?.find((c) => c.type === "text")?.text
    try {
      data = JSON.parse(text ?? "")
    } catch {
      throw new SearchError("Parallel returned a response that is not JSON.", "invalid_response")
    }
  }
  const parsed = payload.safeParse(data)
  if (!parsed.success) throw new SearchError("Parallel returned an unexpected response shape.", "invalid_response")

  const warnings: string[] = []
  if (parsed.data.errors?.length) warnings.push(`Parallel reported ${parsed.data.errors.length} extraction error(s); coverage may be incomplete.`)
  if (parsed.data.warnings?.length) warnings.push("Parallel returned warnings; some sources may be incomplete.")

  const results: SearchResult[] = []
  for (const item of parsed.data.results) {
    const r = resultItem.safeParse(item)
    if (!r.success) continue
    const snippet = r.data.excerpts.join("\n").trim()
    if (!snippet) continue
    results.push({
      title: r.data.title ?? "",
      url: r.data.url,
      snippet,
      provider: "parallel",
      ...(r.data.publish_date ? { publishedAt: r.data.publish_date } : {}),
    })
  }
  return { results, warnings }
}

export function parallelProvider(apiKey: string | undefined, app: AppInfo): SearchProvider {
  return {
    id: "parallel",
    label: apiKey ? "Parallel" : "Parallel (free tier)",
    verification: "implemented-untested",
    unavailableReason: () => null,
    async search({ query, maxResults, signal }) {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      // Identifies the app for Parallel's free-tier accounting; no user data.
      const headers: Record<string, string> = { "User-Agent": `${app.id}/${app.version}` }
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      const client = new Client({ name: app.id, version: app.version })
      const transport = new StreamableHTTPClientTransport(new URL(PARALLEL_MCP_URL), {
        requestInit: { headers },
        fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.any([bounded, ...(init?.signal ? [init.signal] : [])]) }),
      })
      try {
        await client.connect(transport)
        const result = await client.callTool(
          { name: "web_search", arguments: { objective: query, search_queries: [query], session_id: crypto.randomUUID() } },
          undefined,
          { signal: bounded }
        )
        const { results, warnings } = parseParallelResult(result)
        return { results: results.slice(0, maxResults), warnings }
      } catch (err) {
        if (err instanceof SearchError) throw err
        if (bounded.aborted) throw new SearchError("Parallel search timed out.", "timeout")
        throw new SearchError(`Parallel search failed: ${err instanceof Error ? err.message : String(err)}`, "upstream")
      } finally {
        await client.close().catch(() => {})
      }
    },
  }
}
