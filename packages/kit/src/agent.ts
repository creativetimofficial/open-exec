/**
 * An agent profile: who it is, what it may use and on what terms, and its
 * limits. A starter has one (Open Research) or several (Open Coworkers).
 * Policies are enforced by the broker on the server; the prompt only
 * describes them.
 */

export type ToolPolicy = "allow" | "approve" | "deny"

export interface AgentLimits {
  /** Tool calls one run may make before it is stopped. */
  maxToolCallsPerRun: number
  /** Model steps one run may take in the lite runtime. */
  maxStepsPerRun: number
  /** Seconds an approval waits for a decision before it counts as denied. */
  approvalTimeoutSeconds: number
}

export interface AgentProfile {
  id: string
  name: string
  instructions: string
  /** Tool id → policy. A tool missing here is denied. */
  tools: Record<string, ToolPolicy>
  limits: AgentLimits
}

export const DEFAULT_LIMITS: AgentLimits = {
  maxToolCallsPerRun: 25,
  maxStepsPerRun: 12,
  approvalTimeoutSeconds: 300,
}

/** The app running the agents, named to providers that attribute usage. */
export interface AppInfo {
  id: string
  version: string
}
