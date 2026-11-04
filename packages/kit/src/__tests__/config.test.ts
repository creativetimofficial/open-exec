import { describe, expect, it } from "vitest"

import { isDemo, loadSettings } from "../config"

describe("loadSettings", () => {
  it("defaults to CompanyFabric, companyfabric/auto, Parallel search and the lite runtime", () => {
    const s = loadSettings({})
    expect(s.model).toMatchObject({ baseUrl: "https://api.companyfabric.com/v1", model: "companyfabric/auto", isCompanyFabric: true })
    expect(s.search.provider).toBe("parallel")
    expect(s.runtime).toBe("lite")
  })

  it("picks Hermes when HERMES_URL is set, and lets RUNTIME override", () => {
    expect(loadSettings({ HERMES_URL: "http://hermes:8642" }).runtime).toBe("hermes")
    expect(loadSettings({ HERMES_URL: "http://hermes:8642", RUNTIME: "lite" }).runtime).toBe("lite")
  })

  it("treats blank values as unset", () => {
    const s = loadSettings({ OPENAI_API_KEY: "", SEARCH_PROVIDER: "", RUNTIME: "" })
    expect(s.model.apiKey).toBeUndefined()
    expect(s.search.provider).toBe("parallel")
  })

  it("strips trailing slashes and recognizes other endpoints", () => {
    const s = loadSettings({ OPENAI_BASE_URL: "https://api.openai.com/v1/" })
    expect(s.model.baseUrl).toBe("https://api.openai.com/v1")
    expect(s.model.isCompanyFabric).toBe(false)
  })

  it("is a demo only on the lite runtime with no model key", () => {
    expect(isDemo(loadSettings({}))).toBe(true)
    expect(isDemo(loadSettings({ OPENAI_API_KEY: "sk-cf-x" }))).toBe(false)
    expect(isDemo(loadSettings({ HERMES_URL: "http://hermes:8642" }))).toBe(false)
  })
})
