import { listActions } from "@/lib/tools"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/actions: drafts and events the assistant created, newest first. */
export function GET() {
  return Response.json({ actions: listActions() })
}
