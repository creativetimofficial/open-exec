import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { listMessages, listThreads } from "../db"
import { parseSse, type AgentEvent } from "../events"
import type { Runtime } from "../runtime/types"
import { startTurn } from "../turn"
import { app, broker, freshDb, researcher, writer } from "./test-db"

// No model key and no Hermes: startTurn uses the demo runtime given to it.
beforeAll(() => {
  for (const k of ["OPENAI_API_KEY", "RUNTIME", "HERMES_URL", "HERMES_API_KEY"]) delete process.env[k]
})
beforeEach(freshDb)

const echo: Runtime = async (turn) => {
  turn.emit({ type: "message_delta", text: `${turn.agent.name}: ${turn.message}` })
  return { text: `${turn.agent.name} answered`, usage: { inputTokens: 0, outputTokens: 0 } }
}

async function readEvents(res: Response): Promise<AgentEvent[]> {
  const { events } = parseSse(await res.text())
  return events.map((e) => JSON.parse(e) as AgentEvent)
}

describe("startTurn", () => {
  it("runs a turn, saves both sides of it, and streams its events", async () => {
    const res = startTurn({ first: { agent: researcher, message: "What is MCP?" }, broker, app, demo: echo })
    const events = await readEvents(res)
    expect(events.map((e) => e.type)).toEqual(["run_started", "message_delta", "run_completed"])
    expect(events[0]).toMatchObject({ demo: true, agentId: "researcher", agentName: "Researcher" })
    const [thread] = listThreads("researcher")
    expect(listMessages(thread.id).map((m) => [m.role, m.content])).toEqual([
      ["user", "What is MCP?"],
      ["assistant", "Researcher answered"],
    ])
  })

  it("chains a hand-off onto the same stream, in the next agent's own thread", async () => {
    const res = startTurn({
      first: { agent: researcher, message: "Find sources" },
      broker,
      app,
      demo: echo,
      next: (done) => (done.agent.id === "researcher" ? { agent: writer, message: `Draft from: ${done.text}` } : null),
    })
    const started = (await readEvents(res)).filter((e) => e.type === "run_started")
    expect(started.map((e) => (e as { agentId: string }).agentId)).toEqual(["researcher", "writer"])
    expect(listMessages(listThreads("writer")[0].id)[0].content).toBe("Draft from: Researcher answered")
  })

  it("stops the chain when a turn fails", async () => {
    const failing: Runtime = async () => {
      throw new Error("boom")
    }
    const res = startTurn({ first: { agent: researcher, message: "x" }, broker, app, demo: failing, next: () => ({ agent: writer, message: "never" }) })
    const events = await readEvents(res)
    expect(events.map((e) => e.type)).toEqual(["run_started", "run_failed"])
    expect(listThreads("writer")).toEqual([])
  })
})
