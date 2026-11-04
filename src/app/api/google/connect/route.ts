import { assistant } from "@/lib/agent"
import { authorizationUrl } from "@/lib/google/oauth"
import { execSettings } from "@/lib/settings"
import { requiredScopes } from "@/lib/tools"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/google/connect: start Google consent for the scopes the assistant's policies need. */
export function GET() {
  try {
    return Response.redirect(authorizationUrl(requiredScopes(assistant.tools)), 302)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.redirect(`${execSettings().appUrl}/?google_error=${encodeURIComponent(message)}`, 302)
  }
}
