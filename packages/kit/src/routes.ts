import { z } from "zod"

import { decideApproval, deleteThread, getApproval, getThread, listAudit, listMessages, listPendingApprovals, listThreads } from "./db"
import { getActiveRun } from "./runtime/active"

/**
 * The route handlers every starter shares. A starter's route file wraps one
 * of these and declares its own segment config (runtime, dynamic), which
 * Next.js reads from the route file itself.
 */

const decisionBody = z.object({ decision: z.enum(["approved", "denied"]) })

/** POST /api/approvals/{id} { decision }: the first decision wins; later ones change nothing. */
export async function decideApprovalRoute(request: Request, id: string): Promise<Response> {
  const parsed = decisionBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Send { decision: 'approved' | 'denied' }." }, { status: 400 })
  const approval = getApproval(id)
  if (!approval) return Response.json({ error: "No such approval." }, { status: 404 })
  if (new Date(approval.expires_at).getTime() < Date.now()) decideApproval(id, "expired")
  const applied = decideApproval(id, parsed.data.decision)
  return Response.json({ ok: applied, status: getApproval(id)?.status })
}

/** GET /api/approvals: approvals waiting for a decision, from any run. */
export function pendingApprovalsRoute(): Response {
  return Response.json({ approvals: listPendingApprovals().map((a) => ({ ...a, input: JSON.parse(a.input_json) })) })
}

/** GET /api/threads[?agent=id] */
export function threadsRoute(request: Request): Response {
  const agent = new URL(request.url).searchParams.get("agent") ?? undefined
  return Response.json({ threads: listThreads(agent) })
}

export function threadRoute(id: string): Response {
  const thread = getThread(id)
  if (!thread) return Response.json({ error: "Thread not found." }, { status: 404 })
  return Response.json({ thread, messages: listMessages(thread.id) })
}

export function deleteThreadRoute(id: string): Response {
  deleteThread(id)
  return Response.json({ ok: true })
}

/** GET /api/audit: every tool call, newest first, as the broker recorded it. */
export function auditRoute(): Response {
  return Response.json({ audit: listAudit() })
}

/** POST /api/runs/{id}/stop: cancel a run in progress. A pending approval counts as denied. */
export function stopRunRoute(id: string): Response {
  const run = getActiveRun(id)
  if (!run) return Response.json({ error: "No such run in progress." }, { status: 404 })
  run.controller.abort()
  return Response.json({ ok: true })
}
