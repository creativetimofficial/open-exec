import { beforeEach, describe, expect, it } from "vitest"

import { handleRpc, type McpServer } from "../mcp"
import { app, broker, freshDb, researcher, writer } from "./test-db"

beforeEach(freshDb)

const server: McpServer = { broker, app, agents: () => [researcher, writer], defaultAgent: () => writer }

describe("MCP server", () => {
  it("negotiates a protocol version", async () => {
    const res = await handleRpc(server, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })
    expect(res?.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "kit-test-tools" } })
    const other = await handleRpc(server, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })
    expect((other?.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18")
  })

  it("answers nothing to a notification", async () => {
    expect(await handleRpc(server, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull()
  })

  it("lists every tool some agent may use, with schemas and read-only hints", async () => {
    const res = await handleRpc(server, { jsonrpc: "2.0", id: 3, method: "tools/list" })
    const tools = (res?.result as { tools: { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }[] }).tools
    expect(tools.map((t) => t.name).sort()).toEqual(["note_save", "page_read", "search_web"])
    expect(tools.find((t) => t.name === "search_web")?.annotations.readOnlyHint).toBe(true)
    expect(tools.find((t) => t.name === "note_save")?.annotations.readOnlyHint).toBe(false)
    expect(tools.every((t) => t.inputSchema.type === "object")).toBe(true)
  })

  it("brokers calls as the default agent outside a run, refusing what it may not use", async () => {
    const res = await handleRpc(server, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_web", arguments: { query: "mcp" } } })
    expect(res?.result).toMatchObject({ isError: true })
    expect(JSON.stringify(res?.result)).toMatch(/Writer is not allowed/)
  })

  it("rejects unknown methods", async () => {
    expect((await handleRpc(server, { jsonrpc: "2.0", id: 5, method: "resources/list" }))?.error?.code).toBe(-32601)
  })
})
