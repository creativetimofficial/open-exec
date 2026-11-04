import { decideApprovalRoute } from "@agent-starters/kit/routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return decideApprovalRoute(request, (await params).id)
}
