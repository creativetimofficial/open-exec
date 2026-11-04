import type { z } from "zod"

import type { AgentProfile } from "../agent"
import type { AgentEvent, Source } from "../events"

/**
 * A tool is an executable operation behind the broker. Skills (instructions)
 * are not tools and grant nothing; only an agent profile's policies do.
 */

export interface ToolContext {
  /** The agent whose policies and limits apply to this call. */
  agent: AgentProfile
  runId: string | null
  threadId: string | null
  /** Who asked: the lite loop, Hermes over MCP, or the scripted demo. */
  initiator: "lite" | "hermes" | "demo"
  signal: AbortSignal
  emit: (event: AgentEvent) => void
  /** Numbers sources for this run, so [n] means the same page everywhere. */
  sources: SourceLedger
  /** Tool calls made so far in this run; the broker enforces the limit. */
  toolCalls: { count: number }
}

export interface ToolResult {
  /** What the model reads. */
  content: string
  /** One line for the activity log. */
  summary: string
}

export interface ToolDefinition<I = unknown> {
  /** Stable capability id, used in policies and the audit log: "search.web". */
  id: string
  /** The function name a model calls: "search_web". */
  name: string
  description: string
  input: z.ZodType<I>
  /** True when running it changes something outside this conversation. */
  sideEffect: boolean
  execute(input: I, ctx: ToolContext): Promise<ToolResult>
}

export class SourceLedger {
  private byUrl = new Map<string, Source>()

  add(source: Omit<Source, "n">): Source {
    const existing = this.byUrl.get(source.url)
    if (existing) {
      // A page read after a search keeps its number and gains its text.
      if (source.snippet.length > existing.snippet.length) existing.snippet = source.snippet
      return existing
    }
    const entry = { ...source, n: this.byUrl.size + 1 }
    this.byUrl.set(source.url, entry)
    return entry
  }

  list(): Source[] {
    return [...this.byUrl.values()].map((s) => ({ ...s, snippet: s.snippet.slice(0, 400) }))
  }

  get size() {
    return this.byUrl.size
  }
}
