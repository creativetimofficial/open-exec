import { z } from "zod"

import { SearchError, type SearchProvider, type SearchResult } from "./types"

/**
 * Exa's search API (POST https://api.exa.ai/search, `x-api-key`), asking for
 * page text with each result so the agent can cite without a second fetch.
 * Exa reports what the call cost in costDollars.total.
 */

export const EXA_SEARCH_URL = "https://api.exa.ai/search"

const response = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullable().optional(),
      publishedDate: z.string().nullable().optional(),
      text: z.string().nullable().optional(),
      highlights: z.array(z.string()).nullable().optional(),
      summary: z.string().nullable().optional(),
    })
  ),
  costDollars: z.object({ total: z.number().optional() }).partial().nullable().optional(),
})

export function parseExaResponse(json: unknown): { results: SearchResult[]; costUsd?: number } {
  const parsed = response.safeParse(json)
  if (!parsed.success) throw new SearchError("Exa returned an unexpected response shape.", "invalid_response")
  const results = parsed.data.results.map((r) => ({
    title: r.title ?? "",
    url: r.url,
    snippet: (r.highlights?.join(" … ") || r.summary || r.text || "").trim(),
    provider: "exa",
    ...(r.publishedDate ? { publishedAt: r.publishedDate } : {}),
  }))
  return { results, costUsd: parsed.data.costDollars?.total }
}

export function exaProvider(apiKey: string | undefined): SearchProvider {
  return {
    id: "exa",
    label: "Exa",
    verification: apiKey ? "implemented-untested" : "unavailable",
    unavailableReason: () => (apiKey ? null : "Set EXA_API_KEY to use Exa (https://dashboard.exa.ai)."),
    async search({ query, maxResults, signal }) {
      if (!apiKey) throw new SearchError("EXA_API_KEY is not set.", "auth")
      let res: Response
      try {
        res = await fetch(EXA_SEARCH_URL, {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ query, numResults: maxResults, type: "auto", contents: { text: { maxCharacters: 1500 } } }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        })
      } catch (err) {
        throw new SearchError(`Exa search failed: ${err instanceof Error ? err.message : String(err)}`, "timeout")
      }
      if (res.status === 401 || res.status === 403) throw new SearchError("Exa rejected the API key.", "auth")
      if (res.status === 402 || res.status === 429) throw new SearchError("Exa quota or rate limit reached.", "quota")
      if (!res.ok) throw new SearchError(`Exa search failed with HTTP ${res.status}.`, "upstream")
      const { results, costUsd } = parseExaResponse(await res.json())
      return { results, costUsd, warnings: [] }
    },
  }
}
