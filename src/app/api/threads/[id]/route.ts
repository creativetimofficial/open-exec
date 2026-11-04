import { deleteThreadRoute, threadRoute } from "@agent-starters/kit/routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return threadRoute((await params).id)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteThreadRoute((await params).id)
}
