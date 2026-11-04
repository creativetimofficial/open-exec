import { describe, expect, it } from "vitest"

import { assertPublicHost, assertPublicUrlShape, isPrivateAddress, safeFetch, UnsafeUrlError } from "../safe-fetch"

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "%s is private",
    (a) => expect(isPrivateAddress(a)).toBe(true)
  )
  it.each(["93.184.215.14", "8.8.8.8", "2606:4700::6810:84e5"])("%s is public", (a) => expect(isPrivateAddress(a)).toBe(false))
})

describe("assertPublicUrlShape", () => {
  it.each([
    "file:///etc/passwd",
    "http://user:pass@example.com/",
    "http://localhost:3000/",
    "http://metadata.google.internal/",
    "http://169.254.169.254/latest/meta-data/",
    "http://example.com:8080/",
    "http://[::1]/",
    "not a url",
  ])("refuses %s", (url) => expect(() => assertPublicUrlShape(url)).toThrow(UnsafeUrlError))

  it("accepts a normal https page", () => {
    expect(assertPublicUrlShape("https://en.wikipedia.org/wiki/SSRF").hostname).toBe("en.wikipedia.org")
  })
})

describe("assertPublicHost", () => {
  it("refuses a public-looking name that resolves to a private address", async () => {
    await expect(assertPublicHost(new URL("https://evil.example/"), async () => ["10.0.0.5"])).rejects.toThrow(UnsafeUrlError)
  })
  it("accepts a name that resolves to public addresses only", async () => {
    await expect(assertPublicHost(new URL("https://ok.example/"), async () => ["93.184.215.14"])).resolves.toBeUndefined()
  })
})

describe("safeFetch", () => {
  const resolve = async (host: string) => (host === "internal.example" ? ["192.168.0.10"] : ["93.184.215.14"])

  it("checks every redirect hop", async () => {
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: "https://internal.example/admin" } })) as unknown as typeof fetch
    await expect(safeFetch("https://public.example/", { signal: AbortSignal.timeout(5000), resolve, fetchImpl })).rejects.toThrow(UnsafeUrlError)
  })

  it("returns html, and refuses other content types", async () => {
    const html = (async () => new Response("<html><body>Hi</body></html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch
    const page = await safeFetch("https://public.example/", { signal: AbortSignal.timeout(5000), resolve, fetchImpl: html })
    expect(page.body).toContain("Hi")
    const pdf = (async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch
    await expect(safeFetch("https://public.example/x.pdf", { signal: AbortSignal.timeout(5000), resolve, fetchImpl: pdf })).rejects.toThrow(/Only HTML/)
  })
})
