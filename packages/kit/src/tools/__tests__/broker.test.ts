import { beforeEach, describe, expect, it } from "vitest"

import { listAudit } from "../../db"
import type { AgentEvent } from "../../events"
import { broker, freshDb, researcher, saved, writer } from "../../__tests__/test-db"
import { inputJsonSchema } from "../broker"
import { SourceLedger, type ToolContext } from "../types"

beforeEach(() => {
  freshDb()
  saved.length = 0
})

function ctx(events: AgentEvent[], overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agent: researcher,
    runId: "run-1",
    threadId: null,
    initiator: "lite",
    signal: new AbortController().signal,
    emit: (e) => events.push(e),
    sources: new SourceLedger(),
    toolCalls: { count: 0 },
    ...overrides,
  }
}

const note = { title: "MCP overview", body: "MCP is a protocol for tools." }

describe("runTool", () => {
  it("refuses an unknown tool, and records the refusal", async () => {
    const events: AgentEvent[] = []
    const result = await broker.runTool("shell_exec", { cmd: "ls" }, "c1", ctx(events))
    expect(result.ok).toBe(false)
    expect(listAudit()[0]).toMatchObject({ tool: "shell_exec", agent_id: "researcher", policy: "deny", status: "denied" })
    expect(events.map((e) => e.type)).toEqual(["tool_requested", "tool_result"])
  })

  it("applies the calling agent's policy: a tool one agent may use is denied to another", async () => {
    const result = await broker.runTool("search_web", { query: "mcp" }, "c1", ctx([], { agent: writer }))
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/Writer is not allowed to use search\.web/)
    expect(listAudit()[0]).toMatchObject({ agent_id: "writer", policy: "deny", status: "denied" })
  })

  it("writes the audit row before waiting for approval, and runs the tool once approved", async () => {
    const events: AgentEvent[] = []
    let auditAtApproval: string | undefined
    const result = await broker.runTool("note_save", note, "c2", ctx(events), async () => {
      auditAtApproval = listAudit()[0]?.status
      return "approved"
    })
    expect(auditAtApproval).toBe("requested")
    expect(result.ok).toBe(true)
    expect(saved).toEqual([{ title: "MCP overview" }])
    expect(listAudit()[0]).toMatchObject({ tool: "note.save", policy: "approve", status: "succeeded" })
    expect(events.map((e) => e.type)).toEqual(["tool_requested", "approval_required", "approval_resolved", "tool_result"])
  })

  it("runs an allowed side effect without asking", async () => {
    const result = await broker.runTool("note_save", note, "c3", ctx([], { agent: writer }), async () => {
      throw new Error("must not ask")
    })
    expect(result.ok).toBe(true)
    expect(listAudit()[0]).toMatchObject({ agent_id: "writer", policy: "allow", status: "succeeded" })
  })

  it("does not run a declined or expired action", async () => {
    for (const decision of ["denied", "expired"] as const) {
      const result = await broker.runTool("note_save", note, `c-${decision}`, ctx([]), async () => decision)
      expect(result.ok).toBe(false)
    }
    expect(saved).toEqual([])
    expect(listAudit().every((a) => a.status === "denied")).toBe(true)
  })

  it("rejects invalid input without asking or running", async () => {
    const result = await broker.runTool("note_save", { title: "x" }, "c4", ctx([]), async () => "approved")
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/Invalid input/)
    expect(saved).toEqual([])
  })

  it("stops a run at its tool-call limit", async () => {
    const result = await broker.runTool("note_save", note, "c5", ctx([], { toolCalls: { count: 25 } }), async () => "approved")
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/limit/)
  })
})

describe("offered tools", () => {
  it("offers each agent only what its profile does not deny, with object JSON schemas", () => {
    expect(broker.offeredTools(researcher).map((t) => t.name).sort()).toEqual(["note_save", "page_read", "search_web"])
    expect(broker.offeredTools(writer).map((t) => t.name)).toEqual(["note_save"])
    for (const t of broker.tools) {
      const schema = inputJsonSchema(t)
      expect(schema.type).toBe("object")
      expect(schema).not.toHaveProperty("$schema")
    }
  })
})
