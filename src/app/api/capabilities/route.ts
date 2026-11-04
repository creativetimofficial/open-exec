import { capabilities } from "@/lib/capabilities"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/capabilities: runtime, model route, search providers and the lite-vs-Hermes matrix. No secrets. */
export async function GET() {
  return Response.json(capabilities())
}
