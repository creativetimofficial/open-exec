/**
 * The search.web contract. Every provider adapter returns this shape, so the
 * agent, the citations and the UI never depend on which provider answered.
 */

export interface SearchResult {
  title: string
  url: string
  snippet: string
  publishedAt?: string
  provider: string
}

export interface SearchResponse {
  results: SearchResult[]
  costUsd?: number
  warnings: string[]
}

/**
 * How far a provider has been proven, shown next to it in the UI:
 *   verified-live         a live call passed the contract test in CI
 *   implemented-untested  written against the provider's documented API, not yet run live
 *   unavailable           not usable in this deployment (missing key, or not released)
 */
export type Verification = "verified-live" | "implemented-untested" | "unavailable"

export interface SearchProvider {
  id: "parallel" | "exa" | "companyfabric"
  label: string
  /** Why it cannot be used here, or null when it can. */
  unavailableReason(): string | null
  verification: Verification
  search(request: { query: string; maxResults: number; signal: AbortSignal }): Promise<SearchResponse>
}

export class SearchError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "quota" | "upstream" | "invalid_response" | "timeout"
  ) {
    super(message)
  }
}

/** Keep only http(s) URLs without credentials, once each. */
export function cleanResults(results: SearchResult[], max: number): { results: SearchResult[]; dropped: number } {
  const seen = new Set<string>()
  const out: SearchResult[] = []
  let dropped = 0
  for (const r of results) {
    let url: URL
    try {
      url = new URL(r.url)
    } catch {
      dropped++
      continue
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      dropped++
      continue
    }
    if (seen.has(url.href)) continue
    seen.add(url.href)
    out.push({ ...r, url: url.href, title: r.title.trim() || url.hostname, snippet: r.snippet.trim().slice(0, 1500) })
    if (out.length >= max) break
  }
  return { results: out, dropped }
}
