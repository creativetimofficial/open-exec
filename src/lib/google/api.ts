import { accessToken } from "@/lib/google/oauth"

/** One authorised call to a Google REST API, with Google's error message surfaced. */
export async function googleJson<T>(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const token = await accessToken(fetchImpl)
  const res = await fetchImpl(url, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers, Authorization: `Bearer ${token}` },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  })
  if (res.ok) return (await res.json()) as T
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } }
  const message = body.error?.message ?? `HTTP ${res.status}`
  if (res.status === 403 && /insufficient|scope/i.test(`${body.error?.status} ${message}`)) {
    throw new Error(`Google refused: this connection lacks the permission for that. Reconnect Google under Setup. (${message})`)
  }
  throw new Error(`Google API error: ${message}`)
}
