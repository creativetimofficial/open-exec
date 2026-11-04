import { pendingApprovalsRoute } from "@agent-starters/kit/routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  return pendingApprovalsRoute()
}
