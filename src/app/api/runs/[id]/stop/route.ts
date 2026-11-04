import { stopRunRoute } from "@agent-starters/kit/routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return stopRunRoute((await params).id)
}
