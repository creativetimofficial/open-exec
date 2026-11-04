import { afterEach, describe, expect, it, vi } from "vitest"

import { companyFabricProvider, parseCompanyFabricResponse } from "../companyfabric"
import { exaProvider, parseExaResponse } from "../exa"
import { parseParallelResult } from "../parallel"
import { cleanResults, SearchError } from "../types"

afterEach(() => vi.unstubAllGlobals())

const parallelPayload = {
  results: [
    { url: "https://a.example/1", title: "One", excerpts: ["First excerpt", "more"], publish_date: "2026-09-01" },
    { url: "https://a.example/2", title: null, excerpts: [] },
    { nope: true },
  ],
}

describe("parseParallelResult", () => {
  it("reads structured content and keeps only results with text", () => {
    const { results } = parseParallelResult({ structuredContent: parallelPayload })
    expect(results).toEqual([{ title: "One", url: "https://a.example/1", snippet: "First excerpt\nmore", provider: "parallel", publishedAt: "2026-09-01" }])
  })

  it("falls back to the JSON text part", () => {
    const { results } = parseParallelResult({ content: [{ type: "text", text: JSON.stringify(parallelPayload) }] })
    expect(results).toHaveLength(1)
  })

  it("turns an MCP error into a SearchError", () => {
    expect(() => parseParallelResult({ isError: true, content: [{ type: "text", text: "rate limit exceeded" }] })).toThrow(SearchError)
  })
})

describe("Exa", () => {
  it("normalizes results and cost", () => {
    const parsed = parseExaResponse({
      results: [{ url: "https://b.example", title: "B", publishedDate: "2026-10-01T00:00:00Z", text: "Body text" }],
      costDollars: { total: 0.005 },
    })
    expect(parsed).toEqual({
      results: [{ title: "B", url: "https://b.example", snippet: "Body text", provider: "exa", publishedAt: "2026-10-01T00:00:00Z" }],
      costUsd: 0.005,
    })
  })

  it("is unavailable without a key, and maps HTTP errors", async () => {
    expect(exaProvider(undefined).unavailableReason()).toMatch(/EXA_API_KEY/)
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }))
    await expect(exaProvider("k").search({ query: "q", maxResults: 3, signal: AbortSignal.timeout(1000) })).rejects.toMatchObject({ kind: "auth" })
  })

  it("sends the key and the query", async () => {
    const calls: RequestInit[] = []
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push(init)
      return Response.json({ results: [] })
    })
    await exaProvider("exa-key").search({ query: "agents", maxResults: 4, signal: AbortSignal.timeout(1000) })
    expect((calls[0].headers as Record<string, string>)["x-api-key"]).toBe("exa-key")
    expect(JSON.parse(calls[0].body as string)).toMatchObject({ query: "agents", numResults: 4 })
  })
})

describe("CompanyFabric search", () => {
  it("is unavailable until released, and needs a CompanyFabric key", () => {
    const base = { baseUrl: "https://api.companyfabric.com/v1", apiKey: "sk-cf-x", isCompanyFabric: true }
    expect(companyFabricProvider({ ...base, enabled: false }).unavailableReason()).toMatch(/not released/)
    expect(companyFabricProvider({ ...base, enabled: true, apiKey: undefined }).unavailableReason()).toMatch(/sk-cf-/)
    expect(companyFabricProvider({ ...base, enabled: true }).unavailableReason()).toBeNull()
  })

  it("normalizes the agreed response shape", () => {
    expect(
      parseCompanyFabricResponse({ results: [{ title: "C", url: "https://c.example", snippet: "s", source_provider: "exa" }], usage: { cost_usd: 0.002 } })
    ).toEqual({ results: [{ title: "C", url: "https://c.example", snippet: "s", provider: "companyfabric:exa" }], costUsd: 0.002 })
  })
})

describe("cleanResults", () => {
  it("drops unusable URLs and duplicates, and caps the count", () => {
    const r = (url: string) => ({ title: "", url, snippet: "x", provider: "t" })
    const { results, dropped } = cleanResults([r("javascript:alert(1)"), r("https://u:p@x.example"), r("https://ok.example/a"), r("https://ok.example/a"), r("https://ok.example/b")], 1)
    expect(results.map((x) => x.url)).toEqual(["https://ok.example/a"])
    expect(results[0].title).toBe("ok.example")
    expect(dropped).toBe(2)
  })
})
