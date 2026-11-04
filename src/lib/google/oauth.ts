import { createHash, randomBytes } from "node:crypto"

import { getDb, now, registerSchema } from "@agent-starters/kit/db"

import { seal, unseal } from "@/lib/sealed"
import { execSettings, googleSetupProblem, type ExecSettings } from "@/lib/settings"

/**
 * Google OAuth for one account per deployment (this starter has one user).
 * Authorization code flow with PKCE and a server-side state row, offline
 * access for a refresh token, and tokens stored sealed with TOKEN_KEY. The
 * scopes requested are the ones the assistant's tool policies need.
 *
 * Each deployment uses its own OAuth client (GOOGLE_CLIENT_ID/SECRET), so
 * mail and calendar data go from Google to this server and nowhere else.
 */

registerSchema(`
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS google_account (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  email TEXT NOT NULL,
  scopes TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT NOT NULL,
  access_expires_at TEXT NOT NULL,
  connected_at TEXT NOT NULL
);
`)

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const REVOKE_URL = "https://oauth2.googleapis.com/revoke"
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
const STATE_TTL_MS = 10 * 60_000

/** Identity scopes, always requested so the Setup panel can show which account is connected. */
export const IDENTITY_SCOPES = ["openid", "email"]

export class GoogleNotConnected extends Error {
  constructor(message = "Google is not connected. Connect it under Setup.") {
    super(message)
  }
}

interface AccountRow {
  email: string
  scopes: string
  refresh_token: string
  access_token: string
  access_expires_at: string
  connected_at: string
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  error?: string
  error_description?: string
}

function requireSetup(s: ExecSettings): { clientId: string; clientSecret: string; redirectUri: string; key: Buffer } {
  const problem = googleSetupProblem(s)
  if (problem || !s.google.clientId || !s.google.clientSecret || !s.tokenKey) throw new Error(problem ?? "Google is not configured.")
  return { clientId: s.google.clientId, clientSecret: s.google.clientSecret, redirectUri: s.google.redirectUri, key: s.tokenKey }
}

/** The Google consent URL for these scopes, with a fresh state and PKCE verifier stored server-side. */
export function authorizationUrl(scopes: string[], s: ExecSettings = execSettings()): string {
  const { clientId, redirectUri } = requireSetup(s)
  const db = getDb()
  db.prepare("DELETE FROM google_oauth_states WHERE created_at < ?").run(new Date(Date.now() - STATE_TTL_MS).toISOString())
  const state = randomBytes(32).toString("base64url")
  const verifier = randomBytes(48).toString("base64url")
  const all = [...new Set([...IDENTITY_SCOPES, ...scopes])]
  db.prepare("INSERT INTO google_oauth_states (state, verifier, scopes, created_at) VALUES (?, ?, ?, ?)").run(state, verifier, all.join(" "), now())
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: all.join(" "),
    access_type: "offline",
    // Always show consent, so Google returns a refresh token on every connect.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString()
  return url.toString()
}

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch): Promise<TokenResponse> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !json.access_token) {
    const err = new Error(`Google token request failed: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`)
    ;(err as Error & { code?: string }).code = json.error
    throw err
  }
  return json
}

/** Finish the callback: the state must be one this server issued in the last ten minutes, used once. */
export async function completeConnect(code: string, state: string, fetchImpl: typeof fetch = fetch, s: ExecSettings = execSettings()): Promise<{ email: string; scopes: string[] }> {
  const { clientId, clientSecret, redirectUri, key } = requireSetup(s)
  const db = getDb()
  const row = db.prepare("SELECT verifier, created_at FROM google_oauth_states WHERE state = ?").get(state) as unknown as
    | { verifier: string; created_at: string }
    | undefined
  db.prepare("DELETE FROM google_oauth_states WHERE state = ?").run(state)
  if (!row || Date.now() - new Date(row.created_at).getTime() > STATE_TTL_MS) throw new Error("This sign-in link expired or was already used. Start again from Setup.")

  const tokens = await tokenRequest(
    { grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code_verifier: row.verifier },
    fetchImpl
  )
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Remove this app's access at myaccount.google.com/permissions and connect again.")

  const info = await fetchImpl(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  const { email } = (await info.json().catch(() => ({}))) as { email?: string }
  if (!info.ok || !email) throw new Error("Could not read the Google account's email address.")

  const scopes = (tokens.scope ?? "").split(" ").filter(Boolean)
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()
  db.prepare(
    `INSERT INTO google_account (id, email, scopes, refresh_token, access_token, access_expires_at, connected_at)
     VALUES ('primary', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, scopes = excluded.scopes, refresh_token = excluded.refresh_token,
       access_token = excluded.access_token, access_expires_at = excluded.access_expires_at, connected_at = excluded.connected_at`
  ).run(email, scopes.join(" "), seal(tokens.refresh_token, key), seal(tokens.access_token!, key), expiresAt, now())
  return { email, scopes }
}

function accountRow(): AccountRow | undefined {
  return getDb().prepare("SELECT * FROM google_account WHERE id = 'primary'").get() as unknown as AccountRow | undefined
}

/** The connected account, without tokens. */
export function googleAccount(): { email: string; scopes: string[]; connectedAt: string } | null {
  const row = accountRow()
  return row ? { email: row.email, scopes: row.scopes.split(" ").filter(Boolean), connectedAt: row.connected_at } : null
}

/** A valid access token, refreshed when it is within a minute of expiring. */
export async function accessToken(fetchImpl: typeof fetch = fetch, s: ExecSettings = execSettings()): Promise<string> {
  const row = accountRow()
  if (!row) throw new GoogleNotConnected()
  const { clientId, clientSecret, key } = requireSetup(s)
  const open = (sealed: string) => {
    try {
      return unseal(sealed, key)
    } catch {
      // Kept, not deleted: restoring the old TOKEN_KEY makes them usable again.
      throw new GoogleNotConnected("The stored Google tokens cannot be decrypted with this TOKEN_KEY. Restore the previous key, or connect Google again.")
    }
  }
  if (new Date(row.access_expires_at).getTime() - 60_000 > Date.now()) return open(row.access_token)
  const refreshToken = open(row.refresh_token)

  try {
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }, fetchImpl)
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()
    getDb().prepare("UPDATE google_account SET access_token = ?, access_expires_at = ? WHERE id = 'primary'").run(seal(tokens.access_token!, key), expiresAt)
    return tokens.access_token!
  } catch (err) {
    if ((err as { code?: string }).code === "invalid_grant") {
      // Revoked at Google, or expired: the stored tokens are useless now.
      getDb().prepare("DELETE FROM google_account WHERE id = 'primary'").run()
      throw new GoogleNotConnected("Google access was revoked or expired. Connect it again under Setup.")
    }
    throw err
  }
}

/** Revoke the refresh token at Google (best effort) and forget the account. */
export async function disconnect(fetchImpl: typeof fetch = fetch, s: ExecSettings = execSettings()): Promise<void> {
  const row = accountRow()
  if (!row) return
  if (s.tokenKey) {
    await fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: unseal(row.refresh_token, s.tokenKey) }).toString(),
    }).catch(() => null)
  }
  getDb().prepare("DELETE FROM google_account WHERE id = 'primary'").run()
}
