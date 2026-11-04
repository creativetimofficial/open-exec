import { z } from "zod"

import type { AgentProfile, ToolPolicy } from "../agent"
import { auditRequested, auditUpdate, createApproval, decideApproval, getApproval } from "../db"
import type { ToolContext, ToolDefinition } from "./types"

/**
 * The only way a tool runs, for every runtime: the lite loop calls it
 * in-process, Hermes reaches it through the app's MCP endpoint. In order:
 *
 *   1. resolve the tool and the calling agent's policy for it (missing = deny)
 *   2. write the audit row, BEFORE anything happens
 *   3. deny, or count the call against the run's limit
 *   4. validate the input
 *   5. wait for a person's approval when the policy says so
 *   6. run it and record the outcome
 *
 * Tool output is data the model reads, never instructions this layer acts on.
 */

export function policyFor(agent: AgentProfile, tool: ToolDefinition<unknown>): ToolPolicy {
  return agent.tools[tool.id] ?? "deny"
}

/** JSON Schema for a tool's input, for function calling and MCP tools/list. */
export function inputJsonSchema(tool: ToolDefinition<unknown>): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(tool.input) as Record<string, unknown>
  return schema
}

export interface BrokerResult {
  ok: boolean
  content: string
}

export type Decision = "approved" | "denied" | "expired"
export type Waiter = (approvalId: string, timeoutSeconds: number, signal: AbortSignal) => Promise<Decision>

/** Polls the approvals table, so a decision made by any request (or process) is seen. */
export const waitForDecision: Waiter = async (approvalId, timeoutSeconds, signal) => {
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    if (signal.aborted) {
      decideApproval(approvalId, "denied")
      return "denied"
    }
    const row = getApproval(approvalId)
    if (row && row.status !== "pending") return row.status === "approved" ? "approved" : row.status === "expired" ? "expired" : "denied"
    await new Promise((r) => setTimeout(r, 400))
  }
  // First decision wins: if a person decided in the last instant, keep theirs.
  if (decideApproval(approvalId, "expired")) return "expired"
  return getApproval(approvalId)?.status === "approved" ? "approved" : "denied"
}

export interface Broker {
  tools: ToolDefinition<unknown>[]
  toolByName(name: string): ToolDefinition<unknown> | undefined
  /** The tools an agent may be offered: everything its profile does not deny. */
  offeredTools(agent: AgentProfile): ToolDefinition<unknown>[]
  runTool(name: string, rawInput: unknown, callId: string, ctx: ToolContext, wait?: Waiter): Promise<BrokerResult>
}

export function createBroker(tools: ToolDefinition<unknown>[]): Broker {
  const byName = new Map(tools.map((t) => [t.name, t]))

  async function runTool(name: string, rawInput: unknown, callId: string, ctx: ToolContext, wait: Waiter = waitForDecision): Promise<BrokerResult> {
    const tool = byName.get(name)
    const toolId = tool?.id ?? name
    const policy: ToolPolicy = tool ? policyFor(ctx.agent, tool) : "deny"
    const auditId = auditRequested({
      runId: ctx.runId,
      agentId: ctx.agent.id,
      callId,
      tool: toolId,
      initiator: ctx.initiator,
      input: rawInput,
      policy,
    })
    ctx.emit({ type: "tool_requested", callId, tool: toolId, input: rawInput })

    const refuse = (error: string, status: "denied" | "failed" = "denied"): BrokerResult => {
      auditUpdate(auditId, status, { error })
      ctx.emit({ type: "tool_result", callId, tool: toolId, ok: false, summary: error, error })
      return { ok: false, content: `Tool not run: ${error}` }
    }

    if (!tool) return refuse(`Unknown tool "${name}".`)
    if (policy === "deny") return refuse(`${ctx.agent.name} is not allowed to use ${tool.id}.`)

    ctx.toolCalls.count++
    if (ctx.toolCalls.count > ctx.agent.limits.maxToolCallsPerRun) {
      return refuse(`This run reached its limit of ${ctx.agent.limits.maxToolCallsPerRun} tool calls. Answer with what you have.`)
    }

    const parsed = tool.input.safeParse(rawInput)
    if (!parsed.success) {
      return refuse(`Invalid input for ${tool.name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`, "failed")
    }

    if (policy === "approve") {
      const approval = createApproval({
        runId: ctx.runId,
        agentId: ctx.agent.id,
        callId,
        tool: tool.id,
        input: parsed.data,
        timeoutSeconds: ctx.agent.limits.approvalTimeoutSeconds,
      })
      ctx.emit({ type: "approval_required", approvalId: approval.id, callId, tool: tool.id, input: parsed.data, expiresAt: approval.expires_at })
      const decision = await wait(approval.id, ctx.agent.limits.approvalTimeoutSeconds, ctx.signal)
      ctx.emit({ type: "approval_resolved", approvalId: approval.id, decision })
      if (decision !== "approved") {
        return refuse(decision === "expired" ? "No one approved this in time." : "The user declined this action.")
      }
    }

    auditUpdate(auditId, "running")
    try {
      const result = await tool.execute(parsed.data, ctx)
      auditUpdate(auditId, "succeeded", { summary: result.summary })
      ctx.emit({ type: "tool_result", callId, tool: tool.id, ok: true, summary: result.summary })
      if (ctx.sources.size > 0) ctx.emit({ type: "sources", sources: ctx.sources.list() })
      return { ok: true, content: result.content }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      auditUpdate(auditId, "failed", { error: message })
      ctx.emit({ type: "tool_result", callId, tool: tool.id, ok: false, summary: message, error: message })
      return { ok: false, content: `Tool failed: ${message}` }
    }
  }

  return {
    tools,
    toolByName: (name) => byName.get(name),
    offeredTools: (agent) => tools.filter((t) => policyFor(agent, t) !== "deny"),
    runTool,
  }
}
