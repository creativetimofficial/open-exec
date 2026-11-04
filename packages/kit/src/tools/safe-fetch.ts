import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

/**
 * Fetch a public web page for the agent, and nothing else.
 *
 * The agent chooses the URL, and a page it read can tell it to choose a
 * different one, so every URL is treated as hostile: http(s) only, no
 * credentials, standard ports, and the host must resolve to public addresses
 * (no loopback, private ranges, link-local or cloud metadata). Redirects are
 * followed by hand so each hop is checked again. Bodies are capped.
 *
 * Known gap: the address is checked before the request, so a host that
 * re-resolves to a private address between the check and the connect (DNS
 * rebinding) is not caught. Run the app where the network itself blocks
 * internal ranges if that matters to you.
 */

export class UnsafeUrlError extends Error {}

const MAX_BYTES = 2_000_000
const MAX_REDIRECTS = 5

export function isPrivateAddress(address: string): boolean {
  const v = isIP(address)
  if (v === 4) {
    const [a, b] = address.split(".").map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (v === 6) {
    const lower = address.toLowerCase()
    if (lower === "::" || lower === "::1") return true
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower)
  }
  return true
}

export function assertPublicUrlShape(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${raw}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http and https URLs can be read.")
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials are not read.")
  if (url.port && url.port !== "80" && url.port !== "443") throw new UnsafeUrlError("Only standard web ports (80, 443) are read.")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("Local and internal hosts are not read.")
  }
  if (isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("Private and internal addresses are not read.")
  return url
}

type Resolver = (host: string) => Promise<string[]>

const dnsResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address)

export async function assertPublicHost(url: URL, resolve: Resolver = dnsResolver) {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => [])
  if (addresses.length === 0) throw new UnsafeUrlError(`Could not resolve ${host}.`)
  if (addresses.some(isPrivateAddress)) throw new UnsafeUrlError(`${host} resolves to a private or internal address.`)
}

export interface FetchedPage {
  url: string
  contentType: string
  body: string
}

export async function safeFetch(
  raw: string,
  opts: { signal: AbortSignal; resolve?: Resolver; fetchImpl?: typeof fetch; userAgent?: string } = { signal: AbortSignal.timeout(15_000) }
): Promise<FetchedPage> {
  const doFetch = opts.fetchImpl ?? fetch
  let url = assertPublicUrlShape(raw)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url, opts.resolve)
    const res = await doFetch(url, {
      redirect: "manual",
      signal: AbortSignal.any([opts.signal, AbortSignal.timeout(15_000)]),
      headers: { "User-Agent": opts.userAgent ?? "agent-starter/0.1", Accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = assertPublicUrlShape(new URL(res.headers.get("location")!, url).href)
      continue
    }
    if (!res.ok) throw new Error(`The page answered HTTP ${res.status}.`)
    const contentType = res.headers.get("content-type") ?? ""
    if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) {
      throw new Error(`Only HTML and plain-text pages are read (this one is ${contentType || "unknown"}).`)
    }
    return { url: url.href, contentType, body: await readCapped(res) }
  }
  throw new Error("Too many redirects.")
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return ""
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}
