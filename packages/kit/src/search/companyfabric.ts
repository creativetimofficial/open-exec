import { z } from "zod"

import { SearchError, type SearchProvider } from "./types"

/**
 * CompanyFabric search: one key for the model and for search, billed on the
 * same balance. The endpoint (POST /v1/search with companyfabric/search or
 * companyfabric/auto-search) is being built on the CompanyFabric router and is
 * NOT live yet, so this provider stays unavailable unless
 * COMPANYFABRIC_SEARCH_ENABLED=true. The request and response follow the
 * contract agreed for that endpoint; it is verified against the live router
 * before the flag is flipped by default.
 */

const response = z.object({
  results: z.array(
    z.object({
      title: z.string().nullable().optional(),
      url: z.string(),
      snippet: z.string().nullable().optional(),
      published_at: z.string().nullable().optional(),
      source_provider: z.string().nullable().optional(),
    })
  ),
  usage: z.object({ cost_usd: z.number().optional() }).partial().optional(),
})

export function parseCompanyFabricResponse(json: unknown) {
  const parsed = response.safeParse(json)
  if (!parsed.success) throw new SearchError("CompanyFabric search returned an unexpected response shape.", "invalid_response")
  return {
    results: parsed.data.results.map((r) => ({
      title: r.title ?? "",
      url: r.url,
      snippet: r.snippet ?? "",
      provider: r.source_provider ? `companyfabric:${r.source_provider}` : "companyfabric",
      ...(r.published_at ? { publishedAt: r.published_at } : {}),
    })),
    costUsd: parsed.data.usage?.cost_usd,
  }
}

export function companyFabricProvider(opts: { enabled: boolean; baseUrl: string; apiKey: string | undefined; isCompanyFabric: boolean }): SearchProvider {
  const reason = !opts.enabled
    ? "CompanyFabric search is not released yet."
    : !opts.isCompanyFabric || !opts.apiKey
      ? "CompanyFabric search needs OPENAI_BASE_URL pointing at CompanyFabric and an sk-cf- key in OPENAI_API_KEY."
      : null
  return {
    id: "companyfabric",
    label: "CompanyFabric auto-search",
    verification: reason ? "unavailable" : "implemented-untested",
    unavailableReason: () => reason,
    async search({ query, maxResults, signal }) {
      if (reason) throw new SearchError(reason, "auth")
      let res: Response
      try {
        res = await fetch(`${opts.baseUrl}/search`, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "companyfabric/auto-search", query, max_results: maxResults }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        })
      } catch (err) {
        throw new SearchError(`CompanyFabric search failed: ${err instanceof Error ? err.message : String(err)}`, "timeout")
      }
      if (res.status === 401) throw new SearchError("CompanyFabric rejected the API key.", "auth")
      if (res.status === 402) throw new SearchError("CompanyFabric balance is empty; top up at https://companyfabric.com/dashboard/billing.", "quota")
      if (!res.ok) throw new SearchError(`CompanyFabric search failed with HTTP ${res.status}.`, "upstream")
      const { results, costUsd } = parseCompanyFabricResponse(await res.json())
      return { results, costUsd, warnings: [] }
    },
  }
}
