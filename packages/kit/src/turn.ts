import type { AgentProfile, AppInfo } from "./agent"
import { isDemo, settings } from "./config"
import { addMessage, createThread, finishRun, getThread, listMessages, startRun } from "./db"
import { encodeEvent, type AgentEvent, type Source } from "./events"
import { activeHermesRun, registerRun, unregisterRun } from "./runtime/active"
import { runHermes } from "./runtime/hermes"
import { runLite } from "./runtime/lite"
import { createChannel, type Runtime } from "./runtime/types"
import type { Broker } from "./tools/broker"
import { SourceLedger } from "./tools/types"

/**
 * Run a user turn and stream its events (SSE). The run lives on the server,
 * not in the request: a closed tab does not cancel it, and its answer is
 * saved to the thread when it finishes. stopRun() cancels it.
 *
 * A starter can chain turns: after each one, `next` may return another turn
 * (a coworker handing off to another). Chained turns stream on the same
 * response, each opening with its own run_started.
 */

export interface TurnRequest {
  agent: AgentProfile
  threadId?: string
  message: string
}

export interface CompletedTurn {
  runId: string
  threadId: string
  agent: AgentProfile
  text: string
  sources: Source[]
}

export interface StartTurnOptions {
  first: TurnRequest
  broker: Broker
  app: AppInfo
  /** The scripted runtime used when there is no model key. */
  demo: Runtime
  /** A turn to run after this one, or null. Called after each completed turn. */
  next?: (done: CompletedTurn) => TurnRequest | null | Promise<TurnRequest | null>
  /** Most chained turns one request may run. */
  maxChain?: number
}

export function startTurn(opts: StartTurnOptions): Response {
  const s = settings()
  const demo = isDemo(s)
  const runtimeName = demo ? "demo" : s.runtime
  if (runtimeName === "hermes" && activeHermesRun()) {
    return Response.json({ error: "A Hermes run is already in progress. Wait for it or stop it first." }, { status: 409 })
  }
  const firstThread = opts.first.threadId ? getThread(opts.first.threadId) : createThread(opts.first.message, opts.first.agent.id)
  if (!firstThread) return Response.json({ error: "Thread not found." }, { status: 404 })

  const channel = createChannel<AgentEvent>()
  const emit = (event: AgentEvent) => channel.push(event)
  const impl: Runtime = demo ? opts.demo : s.runtime === "hermes" ? runHermes : runLite

  const runOne = async (request: TurnRequest, threadId: string): Promise<CompletedTurn | null> => {
    const history = listMessages(threadId)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }))
    addMessage(threadId, "user", request.message)
    const runId = startRun(threadId, request.agent.id, runtimeName)
    const controller = new AbortController()
    const sources = new SourceLedger()
    const toolCalls = { count: 0 }
    registerRun({ runId, threadId, agent: request.agent, runtime: runtimeName, controller, emit, sources, toolCalls, startedAt: Date.now() })
    emit({ type: "run_started", runId, threadId, runtime: s.runtime, demo, agentId: request.agent.id, agentName: request.agent.name })
    try {
      const outcome = await impl({
        runId,
        threadId,
        agent: request.agent,
        broker: opts.broker,
        app: opts.app,
        history,
        message: request.message,
        settings: s,
        signal: controller.signal,
        emit,
        sources,
        toolCalls,
      })
      addMessage(threadId, "assistant", outcome.text, sources.list())
      finishRun(runId, "completed", outcome.usage)
      emit({ type: "run_completed", text: outcome.text })
      return { runId, threadId, agent: request.agent, text: outcome.text, sources: sources.list() }
    } catch (err) {
      const error = controller.signal.aborted ? "Stopped." : err instanceof Error ? err.message : String(err)
      finishRun(runId, controller.signal.aborted ? "cancelled" : "failed", { inputTokens: 0, outputTokens: 0 }, error)
      emit({ type: "run_failed", error })
      return null
    } finally {
      unregisterRun(runId)
    }
  }

  void (async () => {
    try {
      let request: TurnRequest | null = opts.first
      let threadId = firstThread.id
      for (let i = 0; request && i <= (opts.maxChain ?? 4); i++) {
        const done = await runOne(request, threadId)
        if (!done || !opts.next) break
        request = await opts.next(done)
        if (request) {
          const thread = request.threadId ? getThread(request.threadId) : createThread(request.message, request.agent.id)
          if (!thread) break
          threadId = thread.id
        }
      }
    } finally {
      channel.close()
    }
  })()

  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      for await (const event of channel) {
        try {
          c.enqueue(encodeEvent(event))
        } catch {
          return // the client went away; the run carries on
        }
      }
      c.close()
    },
  })
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Thread-Id": firstThread.id },
  })
}
