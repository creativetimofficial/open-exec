import { startTurn } from "@agent-starters/kit/turn"
import { z } from "zod"

import { app, assistantProfile, broker } from "@/lib/agent"
import { runDemo } from "@/lib/demo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A turn with an approval can wait minutes for the person.
export const maxDuration = 800

const body = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(8000),
})

/** POST /api/runs { message, threadId? }: run one turn and stream its events (SSE). */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Send { message, threadId? }." }, { status: 400 })
  return startTurn({ first: { agent: assistantProfile(), threadId: parsed.data.threadId, message: parsed.data.message }, broker, app, demo: runDemo })
}
