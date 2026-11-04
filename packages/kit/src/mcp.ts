import { timingSafeEqual } from "node:crypto"

import type { AgentProfile, AppInfo } from "./agent"
import { settings } from "./config"
import { activeHermesRun } from "./runtime/active"
import { inputJsonSchema, type Broker } from "./tools/broker"
import { SourceLedger } from "./tools/types"

/**
 * A minimal, stateless MCP server (JSON-RPC 2.0 over Streamable HTTP, JSON
 * responses only) that exposes the app's tools to Hermes. Every call goes
 * through the broker as the agent of the Hermes run in progress, so Hermes
 * gets exactly the policies, approvals and audit the lite runtime gets.
 */

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"]

export interface RpcRequest {
  jsonrpc: "2.0"
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } }

const ok = (id: RpcRequest["id"], result: unknown): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, result })
const fail = (id: RpcRequest["id"], code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } })

export interface McpServer {
  broker: Broker
  app: AppInfo
  /** Every agent of the app: tools/list offers what any of them may use. */
  agents: () => AgentProfile[]
  /** Who a call outside a chat turn acts as (Hermes on a schedule, say). */
  defaultAgent: () => AgentProfile
}

export async function handleRpc(server: McpServer, message: RpcRequest): Promise<RpcResponse | null> {
  // Notifications (no id) get no response.
  if (message.id === undefined) return null
  switch (message.method) {
    case "initialize": {
      const requested = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : ""
      return ok(message.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: `${server.app.id}-tools`, version: server.app.version },
      })
    }
    case "ping":
      return ok(message.id, {})
    case "tools/list": {
      // Hermes lists tools once, not per agent; the broker still refuses a
      // tool the calling agent's profile denies.
      const agents = server.agents()
      const offered = server.broker.tools.filter((t) => agents.some((a) => server.broker.offeredTools(a).includes(t)))
      return ok(message.id, {
        tools: offered.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: inputJsonSchema(t),
          annotations: { readOnlyHint: !t.sideEffect },
        })),
      })
    }
    case "tools/call": {
      const name = typeof message.params?.name === "string" ? message.params.name : ""
      const args = message.params?.arguments ?? {}
      const run = activeHermesRun()
      // A call outside a chat turn is still brokered and audited; its
      // approvals wait in the approvals list.
      const result = await server.broker.runTool(name, args, `mcp_${crypto.randomUUID().slice(0, 8)}`, {
        agent: run?.agent ?? server.defaultAgent(),
        runId: run?.runId ?? null,
        threadId: run?.threadId ?? null,
        initiator: "hermes",
        signal: run?.controller.signal ?? AbortSignal.timeout(10 * 60_000),
        emit: run?.emit ?? (() => {}),
        sources: run?.sources ?? new SourceLedger(),
        toolCalls: run?.toolCalls ?? { count: 0 },
      })
      return ok(message.id, { content: [{ type: "text", text: result.content }], isError: !result.ok })
    }
    default:
      return fail(message.id, -32601, `Method not found: ${message.method}`)
  }
}

function authorized(request: Request): boolean {
  const token = settings().toolToken
  if (!token) return false
  const sent = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  const a = Buffer.from(sent)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The POST handler for an app's /api/mcp route. Bearer TOOL_TOKEN required. */
export async function mcpPost(server: McpServer, request: Request): Promise<Response> {
  if (!settings().toolToken) return Response.json({ error: "Set TOOL_TOKEN to enable the MCP endpoint." }, { status: 503 })
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 })

  const body = (await request.json().catch(() => null)) as RpcRequest | RpcRequest[] | null
  if (!body) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 })

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handleRpc(server, m)))).filter((r) => r !== null)
    return responses.length ? Response.json(responses) : new Response(null, { status: 202 })
  }
  const response = await handleRpc(server, body)
  return response ? Response.json(response) : new Response(null, { status: 202 })
}
