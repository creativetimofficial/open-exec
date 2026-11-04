import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { loadSettings } from "../../config"
import { createThread, getThread } from "../../db"
import type { AgentEvent } from "../../events"
import { app, broker, freshDb, researcher } from "../../__tests__/test-db"
import { SourceLedger } from "../../tools/types"
import { approvalBody, runHermes, translate } from "../hermes"
import type { TurnInput } from "../types"
import { sseResponse } from "./sse"

beforeEach(freshDb)
afterEach(() => vi.unstubAllGlobals())

const settings = loadSettings({ HERMES_URL: "http://hermes:8642", HERMES_API_KEY: "hk", OPENAI_API_KEY: "sk-cf-x" })

const turn = (threadId: string, overrides: Partial<TurnInput> = {}): TurnInput => ({
  runId: "ours-1",
  threadId,
  agent: researcher,
  broker,
  app,
  history: [],
  message: "What is MCP?",
  settings,
  signal: new AbortController().signal,
  emit: () => {},
  sources: new SourceLedger(),
  toolCalls: { count: 0 },
  ...overrides,
})
// Hermes frames carry the event name inside the JSON, with an id line and keep-alive comments.
const frame = (seq: number, body: Record<string, unknown>) => `id: ${seq}\ndata: ${JSON.stringify({ run_id: "run_1", seq, timestamp: 0, ...body })}\n\n`

describe("translate", () => {
  it("maps deltas and Hermes' own tools, and leaves our MCP tools to the broker", () => {
    expect(translate({ event: "message.delta", delta: "Hi" })).toEqual({ type: "message_delta", text: "Hi" })
    expect(translate({ event: "tool.started", tool: "mcp__app__search_web" })).toBeNull()
    expect(translate({ event: "tool.started", tool: "memory", tool_call_id: "t1", preview: "{}" })).toMatchObject({ type: "tool_requested", tool: "hermes:memory", callId: "t1" })
    expect(translate({ event: "tool.completed", tool: "memory", tool_call_id: "t1", preview: "BLOCKED: denied" })).toMatchObject({ ok: false })
    expect(translate({ event: "reasoning.available", text: "secret" })).toBeNull()
  })
})

describe("approvalBody", () => {
  it("sends exactly the canonical keys when Hermes is in canonical mode", () => {
    expect(approvalBody({ event: "approval.request", prompt_id: "p1", execution_generation: 3 }, true)).toEqual({ request_id: "p1", execution_generation: 3, choice: "once" })
  })
  it("falls back to the legacy body", () => {
    expect(approvalBody({ event: "approval.request", request_id: "r1" }, false)).toEqual({ choice: "deny", request_id: "r1" })
  })
})

describe("runHermes", () => {
  it("starts a run, streams it, and keeps the session Hermes minted", async () => {
    const thread = createThread("q", "researcher")
    const calls: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined })
      if (url === "http://hermes:8642/v1/runs") return Response.json({ run_id: "run_1", status: "started" }, { status: 202 })
      if (url.startsWith("http://hermes:8642/v1/runs/run_1/events")) {
        return sseResponse([
          ": open\n\n",
          frame(1, { event: "message.delta", delta: "MCP is " }),
          frame(2, { event: "tool.started", tool: "mcp__app__search_web" }),
          frame(3, { event: "message.delta", delta: "a protocol [1]." }),
          frame(4, { event: "run.completed", completed: true, output: "MCP is a protocol [1].", usage: { input_tokens: 50, output_tokens: 12 } }),
        ])
      }
      if (url === "http://hermes:8642/v1/runs/run_1") return Response.json({ run_id: "run_1", status: "completed", session_id: "api_1_abc" })
      return new Response("unexpected", { status: 500 })
    })

    const events: AgentEvent[] = []
    const outcome = await runHermes(turn(thread.id, { emit: (e) => events.push(e) }))

    expect(calls[0]).toMatchObject({ method: "POST", headers: { Authorization: "Bearer hk", "Idempotency-Key": "ours-1" } })
    expect(calls[0].body).toMatchObject({ input: "What is MCP?", model: "companyfabric/auto" })
    expect((calls[0].body as { instructions: string }).instructions).toMatch(/^Research things\.[\s\S]*search_web/)
    expect(calls[0].body).not.toHaveProperty("session_id")
    expect(outcome).toEqual({ text: "MCP is a protocol [1].", usage: { inputTokens: 50, outputTokens: 12 } })
    expect(events.filter((e) => e.type === "message_delta")).toHaveLength(2)
    expect(events.some((e) => e.type === "tool_requested")).toBe(false)
    expect(getThread(thread.id)?.hermes_session_id).toBe("api_1_abc")
  })

  it("fails with Hermes' error when the run fails", async () => {
    const thread = createThread("q", "researcher")
    vi.stubGlobal("fetch", async (url: string) => {
      if (url === "http://hermes:8642/v1/runs") return Response.json({ run_id: "run_1" }, { status: 202 })
      return sseResponse([frame(1, { event: "run.failed", completed: false, error: "provider returned 402" })])
    })
    await expect(runHermes(turn(thread.id, { runId: "ours-2" }))).rejects.toThrow("provider returned 402")
  })
})
