import type { AgentEvent } from "@agent-starters/kit/events"
import { describe, expect, it } from "vitest"

import { emptyChat, pendingTurn, reduceChat, turnsFromMessages, type ChatState } from "./turns"

const run = (state: ChatState, events: AgentEvent[]) => events.reduce(reduceChat, state)
const started = (runId: string, agentName = "Ria"): AgentEvent => ({ type: "run_started", runId, threadId: "th-1", runtime: "lite", demo: false, agentId: agentName.toLowerCase(), agentName })

describe("reduceChat", () => {
  it("fills the pending turn, then tracks tools and approvals inline", () => {
    const state = run({ ...emptyChat, turns: [pendingTurn("Research MCP")] }, [
      started("r1"),
      { type: "tool_requested", callId: "c1", tool: "search.web", input: { query: "mcp" } },
      { type: "tool_result", callId: "c1", tool: "search.web", ok: true, summary: "5 results" },
      { type: "tool_requested", callId: "c2", tool: "doc.write", input: { title: "Notes" } },
      { type: "approval_required", approvalId: "a1", callId: "c2", tool: "doc.write", input: { title: "Notes" }, expiresAt: "2026-10-29T10:00:00Z" },
      { type: "message_delta", text: "Hello " },
      { type: "message_delta", text: "world" },
    ])
    expect(state.threadId).toBe("th-1")
    const [turn] = state.turns
    expect(turn).toMatchObject({ runId: "r1", agentName: "Ria", prompt: "Research MCP", text: "Hello world", status: "running" })
    expect(turn.tools).toEqual([
      { callId: "c1", tool: "search.web", input: { query: "mcp" }, state: "ok", summary: "5 results", approvalId: undefined },
      { callId: "c2", tool: "doc.write", input: { title: "Notes" }, state: "waiting", approvalId: "a1" },
    ])

    const done = run(state, [
      { type: "approval_resolved", approvalId: "a1", decision: "approved" },
      { type: "tool_result", callId: "c2", tool: "doc.write", ok: true, summary: "Saved" },
      { type: "run_completed", text: "Hello world." },
    ])
    expect(done.turns[0]).toMatchObject({ text: "Hello world.", status: "done" })
    expect(done.turns[0].tools[1]).toMatchObject({ state: "ok", approvalId: undefined })
  })

  it("opens a hand-off turn for a chained run, keeping the first thread", () => {
    const state = run({ ...emptyChat, turns: [pendingTurn("Write it up")] }, [
      started("r1"),
      { type: "run_completed", text: "Handed to Wes." },
      { ...started("r2", "Wes"), threadId: "th-2" } as AgentEvent,
      { type: "run_failed", error: "Model unavailable" },
    ])
    expect(state.threadId).toBe("th-1")
    expect(state.turns).toHaveLength(2)
    expect(state.turns[1]).toMatchObject({ runId: "r2", agentName: "Wes", prompt: null, status: "failed", error: "Model unavailable" })
  })

  it("rebuilds turns from saved messages", () => {
    const turns = turnsFromMessages([
      { role: "user", content: "Q1", sources: [] },
      { role: "assistant", content: "A1", sources: [] },
      { role: "assistant", content: "A2 (hand-off)", sources: [] },
    ])
    expect(turns.map((t) => [t.prompt, t.text])).toEqual([
      ["Q1", "A1"],
      [null, "A2 (hand-off)"],
    ])
  })
})
