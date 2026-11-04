import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import { z } from "zod"

import type { AppInfo } from "../agent"
import { activeSearchProvider } from "../search"
import { cleanResults } from "../search/types"
import { safeFetch } from "./safe-fetch"
import type { ToolDefinition } from "./types"

const MAX_PAGE_CHARS = 12_000

/** Readable text of an HTML page, without scripts, navigation or markup. */
export function extractReadable(html: string, url: string): { title: string; text: string } {
  const { document } = parseHTML(html)
  const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse()
  const text = (article?.textContent ?? document.body?.textContent ?? "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  return { title: (article?.title || document.title || new URL(url).hostname).trim(), text }
}

/** search.web and page.read, the two tools every research-capable agent shares. */
export function webTools(app: AppInfo): ToolDefinition<unknown>[] {
  const searchWeb: ToolDefinition<{ query: string; max_results?: number }> = {
    id: "search.web",
    name: "search_web",
    description:
      "Search the web. Returns numbered sources ([n] title, url, excerpt). Cite them by number. Run several focused queries rather than one broad one.",
    input: z.object({
      query: z.string().min(2).max(400).describe("A focused search query."),
      max_results: z.number().int().min(1).max(10).optional().describe("How many results, 1 to 10. Default 6."),
    }),
    sideEffect: false,
    async execute({ query, max_results }, ctx) {
      const provider = activeSearchProvider(app)
      const response = await provider.search({ query, maxResults: max_results ?? 6, signal: ctx.signal })
      const { results, dropped } = cleanResults(response.results, max_results ?? 6)
      const numbered = results.map((r) => ctx.sources.add({ title: r.title, url: r.url, snippet: r.snippet, provider: r.provider, publishedAt: r.publishedAt }))
      const warnings = [...response.warnings, ...(dropped ? [`${dropped} result(s) with unusable URLs were dropped.`] : [])]
      const content = numbered.length
        ? numbered
            .map((s) => `[${s.n}] ${s.title}\n${s.url}${s.publishedAt ? ` (${s.publishedAt})` : ""}\n${s.snippet.slice(0, 800)}`)
            .join("\n\n")
        : "No results. Try a different query."
      return {
        content: warnings.length ? `${content}\n\nNote: ${warnings.join(" ")}` : content,
        summary: `${provider.label}: ${numbered.length} result(s) for "${query.slice(0, 80)}"`,
      }
    },
  }

  const pageRead: ToolDefinition<{ url: string }> = {
    id: "page.read",
    name: "page_read",
    description:
      "Read a public web page and return its main text. Use it on the most relevant search results before answering. Only http(s) public pages; private and internal addresses are refused.",
    input: z.object({ url: z.string().url().describe("The page URL, usually one returned by search_web.") }),
    sideEffect: false,
    async execute({ url }, ctx) {
      const page = await safeFetch(url, { signal: ctx.signal, userAgent: `${app.id}/${app.version}` })
      const { title, text } = page.contentType.includes("html") ? extractReadable(page.body, page.url) : { title: page.url, text: page.body }
      const source = ctx.sources.add({ title, url: page.url, snippet: text.slice(0, 1500), provider: "page" })
      const clipped = text.length > MAX_PAGE_CHARS ? `${text.slice(0, MAX_PAGE_CHARS)}\n\n[truncated]` : text
      return {
        content: `[${source.n}] ${title}\n${page.url}\n\n${clipped || "(no readable text)"}`,
        summary: `Read ${new URL(page.url).hostname} (${text.length.toLocaleString("en-US")} chars)`,
      }
    },
  }

  return [searchWeb, pageRead] as ToolDefinition<unknown>[]
}
