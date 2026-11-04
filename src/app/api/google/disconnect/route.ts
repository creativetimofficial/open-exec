import { disconnect } from "@/lib/google/oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/google/disconnect: revoke at Google and delete the stored tokens. Same-origin only. */
export async function POST(request: Request) {
  // A form on another site could POST here; a browser always sends Origin on a cross-site POST.
  const origin = request.headers.get("origin")
  const host = origin && URL.canParse(origin) ? new URL(origin).host : null
  if (!host || host !== request.headers.get("host")) return Response.json({ error: "Cross-origin request refused." }, { status: 403 })
  await disconnect()
  return Response.json({ ok: true })
}
