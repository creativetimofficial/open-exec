import type { AgentEvent, Source } from "@agent-starters/kit/events"

import type { ToolState } from "../elements/tool"

/**
 * The conversation as the UI shows it: one turn per run, each with the
 * prompt that started it (or a hand-off), the streamed answer, its sources
 * and every tool call inline. Built from the kit's event stream by a pure
 * reducer, so every starter renders runs the same way.
 */

export interface ToolCall {
  callId: string
  tool: string
  input?: unknown
  state: ToolState
  summary?: string
  approvalId?: string
}

export interface Turn {
  key: string
  runId: string | null
  agentId?: string
  agentName?: string
  /** What the user asked; null when the turn is a hand-off from another agent. */
  prompt: string | null
  text: string
  sources: Source[]
  tools: ToolCall[]
  status: "running" | "done" | "failed"
  error?: string
  demo?: boolean
}

export interface ChatState {
  turns: Turn[]
  activeRunId: string | null
  threadId: string | null
}

export const emptyChat: ChatState = { turns: [], activeRunId: null, threadId: null }

let seq = 0
const key = () => `t${++seq}`

/** A turn for a message the user just sent, before the server names its run. */
export function pendingTurn(prompt: string, agent?: { id: string; name: string }): Turn {
  return { key: key(), runId: null, agentId: agent?.id, agentName: agent?.name, prompt, text: "", sources: [], tools: [], status: "running" }
}

function patchActive(state: ChatState, patch: (t: Turn) => Turn): ChatState {
  return { ...state, turns: state.turns.map((t) => (t.runId !== null && t.runId === state.activeRunId ? patch(t) : t)) }
}

function patchTool(state: ChatState, callId: string, patch: (c: ToolCall | undefined) => ToolCall): ChatState {
  return patchActive(state, (t) => {
    const found = t.tools.some((c) => c.callId === callId)
    return { ...t, tools: found ? t.tools.map((c) => (c.callId === callId ? patch(c) : c)) : [...t.tools, patch(undefined)] }
  })
}

export function reduceChat(state: ChatState, event: AgentEvent): ChatState {
  switch (event.type) {
    case "run_started": {
      const who = { runId: event.runId, agentId: event.agentId, agentName: event.agentName, demo: event.demo }
      const pending = state.turns.findIndex((t) => t.runId === null && t.status === "running")
      const turns =
        pending >= 0
          ? state.turns.map((t, i) => (i === pending ? { ...t, ...who } : t))
          : [...state.turns, { key: key(), ...who, prompt: null, text: "", sources: [], tools: [], status: "running" as const }]
      return { turns, activeRunId: event.runId, threadId: state.threadId ?? event.threadId }
    }
    case "message_delta":
      return patchActive(state, (t) => ({ ...t, text: t.text + event.text }))
    case "sources":
      return patchActive(state, (t) => ({ ...t, sources: event.sources }))
    case "tool_requested":
      return patchTool(state, event.callId, (c) => ({ ...c, callId: event.callId, tool: event.tool, input: event.input, state: "running" }))
    case "approval_required":
      return patchTool(state, event.callId, (c) => ({ ...c, callId: event.callId, tool: event.tool, input: event.input, state: "waiting", approvalId: event.approvalId }))
    case "approval_resolved":
      return patchActive(state, (t) => ({ ...t, tools: t.tools.map((c) => (c.approvalId === event.approvalId ? { ...c, approvalId: undefined, state: event.decision === "approved" ? "running" : c.state } : c)) }))
    case "tool_result":
      return patchTool(state, event.callId, (c) => ({ ...c, callId: event.callId, tool: event.tool, state: event.ok ? "ok" : "failed", summary: event.summary, approvalId: undefined }))
    case "run_completed":
      return patchActive(state, (t) => ({ ...t, text: event.text, status: "done" }))
    case "run_failed":
      return patchActive(state, (t) => ({ ...t, status: "failed", error: event.error }))
    case "usage":
      return state
  }
}

/** A saved thread's messages as turns (text and sources; tool calls are in the audit log). */
export function turnsFromMessages(messages: { role: "user" | "assistant"; content: string; sources: Source[] }[], agent?: { id: string; name: string }): Turn[] {
  const turns: Turn[] = []
  for (const m of messages) {
    if (m.role === "user") turns.push({ ...pendingTurn(m.content, agent), status: "done" })
    else {
      const last = turns[turns.length - 1]
      if (last && !last.text) Object.assign(last, { text: m.content, sources: m.sources })
      else turns.push({ ...pendingTurn("", agent), prompt: null, text: m.content, sources: m.sources, status: "done" })
    }
  }
  return turns
}
