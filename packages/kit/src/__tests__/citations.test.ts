import { describe, expect, it } from "vitest"

import { linkCitations } from "../citations"

const sources = [1, 2].map((n) => ({ n, title: `S${n}`, url: `https://example.com/${n}`, snippet: "", provider: "test" }))

describe("linkCitations", () => {
  it("links markers that refer to retrieved sources", () => {
    expect(linkCitations("A [1] and B [2].", sources)).toBe("A [[1]](#source-1) and B [[2]](#source-2).")
  })

  it("leaves markers with no such source, and existing markdown links, alone", () => {
    expect(linkCitations("Made up [7].", sources)).toBe("Made up [7].")
    expect(linkCitations("[1](https://x.dev)", sources)).toBe("[1](https://x.dev)")
  })
})
