import { beforeEach, describe, expect, it } from "vitest"

import { addMessage, createApproval, createThread, decideApproval, getApproval, listMessages, listPendingApprovals, listThreads, registerSchema, getDb } from "../db"
import { freshDb } from "./test-db"

beforeEach(freshDb)

describe("threads and messages", () => {
  it("stores messages in order with their sources, and lists threads per agent", () => {
    const t = createThread("What is MCP?", "researcher")
    createThread("Draft", "writer")
    addMessage(t.id, "user", "What is MCP?")
    addMessage(t.id, "assistant", "A protocol [1].", [{ n: 1, title: "MCP", url: "https://modelcontextprotocol.io/", snippet: "", provider: "test" }])
    const messages = listMessages(t.id)
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(messages[1].sources[0].url).toBe("https://modelcontextprotocol.io/")
    expect(listThreads("researcher").map((r) => r.id)).toEqual([t.id])
    expect(listThreads()).toHaveLength(2)
  })
})

describe("approvals", () => {
  it("keeps the first decision", () => {
    const a = createApproval({ runId: null, agentId: "researcher", callId: "c1", tool: "note.save", input: {}, timeoutSeconds: 60 })
    expect(listPendingApprovals().map((r) => r.id)).toEqual([a.id])
    expect(decideApproval(a.id, "approved")).toBe(true)
    expect(decideApproval(a.id, "denied")).toBe(false)
    expect(getApproval(a.id)?.status).toBe("approved")
    expect(listPendingApprovals()).toEqual([])
  })

  it("does not list an approval past its deadline", () => {
    createApproval({ runId: null, agentId: "researcher", callId: "c2", tool: "note.save", input: {}, timeoutSeconds: -1 })
    expect(listPendingApprovals()).toEqual([])
  })
})

describe("registerSchema", () => {
  it("adds a starter's tables to the open database", () => {
    registerSchema("CREATE TABLE IF NOT EXISTS kit_test_extra (id TEXT PRIMARY KEY)")
    getDb().prepare("INSERT INTO kit_test_extra (id) VALUES (?)").run("x")
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM kit_test_extra").get()).toEqual({ n: 1 })
  })
})
