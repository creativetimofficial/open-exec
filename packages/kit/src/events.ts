/**
 * The one event stream the UI reads, whichever runtime ran the turn. The lite
 * loop emits these directly; the Hermes adapter translates Hermes' run events
 * into them. Hidden reasoning is never an event.
 */

export interface Source {
  /** 1-based, the number the answer cites as [n]. */
  n: number
  title: string
  url: string
  snippet: string
  provider: string
  publishedAt?: string
}

export type AgentEvent =
  | {
      type: "run_started"
      runId: string
      threadId: string
      runtime: "lite" | "hermes"
      demo: boolean
      agentId: string
      agentName: string
    }
  | { type: "message_delta"; text: string }
  | { type: "tool_requested"; callId: string; tool: string; input: unknown }
  | {
      type: "approval_required"
      approvalId: string
      callId: string
      tool: string
      input: unknown
      expiresAt: string
    }
  | { type: "approval_resolved"; approvalId: string; decision: "approved" | "denied" | "expired" }
  | { type: "tool_result"; callId: string; tool: string; ok: boolean; summary: string; error?: string }
  | { type: "sources"; sources: Source[] }
  | { type: "usage"; inputTokens: number; outputTokens: number; costUsd?: number }
  | { type: "run_completed"; text: string }
  | { type: "run_failed"; error: string }

const encoder = new TextEncoder()

export function encodeEvent(event: AgentEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

/** Parse the `data:` payloads out of an SSE text buffer; returns events and the unconsumed tail. */
export function parseSse(buffer: string): { events: string[]; rest: string } {
  const events: string[] = []
  const blocks = buffer.split(/\r?\n\r?\n/)
  const rest = blocks.pop() ?? ""
  for (const block of blocks) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n")
    if (data) events.push(data)
  }
  return { events, rest }
}

/** Same as parseSse, but keeps each block's `event:` name, which Hermes uses. */
export function parseNamedSse(buffer: string): { events: { event: string | null; data: string }[]; rest: string } {
  const events: { event: string | null; data: string }[] = []
  const blocks = buffer.split(/\r?\n\r?\n/)
  const rest = blocks.pop() ?? ""
  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim() ?? null
    const data = lines
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n")
    if (data) events.push({ event, data })
  }
  return { events, rest }
}
