import type { AgentProfile } from "../agent"
import type { AgentEvent } from "../events"
import type { SourceLedger } from "../tools/types"

/**
 * Runs in progress in this server process. Kept on globalThis because Next.js
 * may load a module more than once across route bundles, and the MCP route
 * (Hermes calling our tools) must find the run the chat route started.
 */

export interface ActiveRun {
  runId: string
  threadId: string
  agent: AgentProfile
  runtime: "lite" | "hermes" | "demo"
  controller: AbortController
  emit: (event: AgentEvent) => void
  sources: SourceLedger
  toolCalls: { count: number }
  startedAt: number
}

const g = globalThis as typeof globalThis & { __agentKitRuns?: Map<string, ActiveRun> }
const runs = (g.__agentKitRuns ??= new Map<string, ActiveRun>())

export function registerRun(run: ActiveRun) {
  runs.set(run.runId, run)
}

export function unregisterRun(runId: string) {
  runs.delete(runId)
}

export function getActiveRun(runId: string): ActiveRun | undefined {
  return runs.get(runId)
}

/** Any run in progress, newest first. */
export function activeRuns(): ActiveRun[] {
  return [...runs.values()].sort((a, b) => b.startedAt - a.startedAt)
}

/**
 * The Hermes run a tool call belongs to. Hermes calls our MCP server with a
 * fixed configuration, so a call cannot name its run; a deployment runs one
 * Hermes turn at a time (startTurn refuses a second) and attributes calls to
 * it, which is also how the call gets that run's agent and its policies.
 */
export function activeHermesRun(): ActiveRun | undefined {
  return activeRuns().find((r) => r.runtime === "hermes")
}
