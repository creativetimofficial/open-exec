import type { AgentProfile, AppInfo } from "../agent"
import type { Settings } from "../config"
import type { AgentEvent } from "../events"
import type { Broker } from "../tools/broker"
import type { SourceLedger } from "../tools/types"

export interface TurnInput {
  runId: string
  threadId: string
  agent: AgentProfile
  broker: Broker
  app: AppInfo
  /** Earlier turns of this thread, text only. */
  history: { role: "user" | "assistant"; content: string }[]
  message: string
  settings: Settings
  signal: AbortSignal
  emit: (event: AgentEvent) => void
  sources: SourceLedger
  /** Tool calls made so far in this run, shared with calls that arrive over MCP. */
  toolCalls: { count: number }
}

export interface TurnOutcome {
  text: string
  usage: { inputTokens: number; outputTokens: number; costUsd?: number }
}

/**
 * A runtime runs one user turn to completion, emitting events as it goes,
 * and resolves with the final answer. Tools always go through the broker.
 */
export type Runtime = (turn: TurnInput) => Promise<TurnOutcome>

/** A push-to-pull event channel: runtimes push, the HTTP response pulls. */
export function createChannel<T>() {
  const queue: T[] = []
  let notify: (() => void) | null = null
  let closed = false
  return {
    push(item: T) {
      if (closed) return
      queue.push(item)
      notify?.()
    },
    close() {
      closed = true
      notify?.()
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!
          continue
        }
        if (closed) return
        await new Promise<void>((resolve) => (notify = () => resolve()))
        notify = null
      }
    },
  }
}
