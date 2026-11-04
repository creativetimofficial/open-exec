import { completeConnect } from "@/lib/google/oauth"
import { execSettings } from "@/lib/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/google/callback?code&state: Google's redirect after consent. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const home = execSettings().appUrl
  const fail = (message: string) => Response.redirect(`${home}/?google_error=${encodeURIComponent(message)}`, 302)

  const denied = params.get("error")
  if (denied) return fail(denied === "access_denied" ? "Google access was not granted." : `Google returned: ${denied}`)
  const code = params.get("code")
  const state = params.get("state")
  if (!code || !state) return fail("Google's reply was missing its code or state.")
  try {
    await completeConnect(code, state)
    return Response.redirect(`${home}/?google=connected`, 302)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}
