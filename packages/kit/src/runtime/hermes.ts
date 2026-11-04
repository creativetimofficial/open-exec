import { createApproval, getThread, setHermesSession } from "../db"
import { parseSse, type AgentEvent } from "../events"
import { waitForDecision } from "../tools/broker"
import type { Runtime, TurnInput, TurnOutcome } from "./types"

/**
 * The Hermes runtime: the turn runs inside a Hermes Agent container
 * (NousResearch/hermes-agent, pinned in docker-compose.yml) through its Runs
 * API, written against v0.22.5:
 *
 *   POST /v1/runs                     start the turn (202 { run_id })
 *   GET  /v1/runs/{id}/events         SSE, `data: {"event": ..., "seq": ...}`
 *   POST /v1/runs/{id}/approval       answer an approval.request
 *   POST /v1/runs/{id}/stop           cancel
 *   GET  /v1/runs/{id}                status, incl. the session id it minted
 *
 * Hermes keeps the conversation (its session) and its memory; this app keeps
 * the thread, the citations and the audit. The agent's tools are this app's
 * own, reached by Hermes over MCP (/api/mcp), so they go through the same
 * broker, policies and audit as in the lite runtime. Hermes' own tools
 * (terminal, files, browser, its web search) are switched off in each
 * starter's hermes/config.yaml; turn them on there if you want them.
 */

/** The app's MCP server name in hermes/config.yaml; Hermes names its tools mcp__app__<tool>. */
export const MCP_SERVER_NAME = "app"
const OUR_TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`

export interface HermesEvent {
  event: string
  seq?: number
  [key: string]: unknown
}

function hermes(turn: Pick<TurnInput, "settings">) {
  const { url, apiKey } = turn.settings.hermes
  if (!url || !apiKey) throw new Error("The Hermes runtime needs HERMES_URL and HERMES_API_KEY.")
  return {
    url,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  }
}

async function failText(res: Response): Promise<string> {
  const body = await res.text().catch(() => "")
  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string; detail?: string }
    const message = typeof json.error === "string" ? json.error : json.error?.message
    return message || json.detail || body.slice(0, 300)
  } catch {
    return body.slice(0, 300)
  }
}

/**
 * The approval body Hermes expects. In its canonical mode (the default under
 * `gateway run`) the body is exactly { request_id, execution_generation,
 * choice }; the legacy mode takes { choice, request_id? }.
 */
export function approvalBody(request: HermesEvent, approved: boolean): Record<string, unknown> {
  const choice = approved ? "once" : "deny"
  if (typeof request.prompt_id === "string" && typeof request.execution_generation === "number") {
    return { request_id: request.prompt_id, execution_generation: request.execution_generation, choice }
  }
  return { choice, ...(typeof request.request_id === "string" ? { request_id: request.request_id } : {}) }
}

/** What a Hermes event means for our UI; null when it has nothing to show. */
export function translate(event: HermesEvent): AgentEvent | null {
  switch (event.event) {
    case "message.delta":
      return typeof event.delta === "string" && event.delta ? { type: "message_delta", text: event.delta } : null
    case "tool.started": {
      const tool = String(event.tool ?? "")
      // Our own tools report through the broker, with more detail.
      if (tool.startsWith(OUR_TOOL_PREFIX)) return null
      return { type: "tool_requested", callId: String(event.tool_call_id ?? `${tool}-${event.seq ?? ""}`), tool: `hermes:${tool}`, input: event.preview ?? null }
    }
    case "tool.completed": {
      const tool = String(event.tool ?? "")
      if (tool.startsWith(OUR_TOOL_PREFIX)) return null
      const error = typeof event.error === "string" && event.error ? event.error : null
      const preview = typeof event.preview === "string" ? event.preview : ""
      return {
        type: "tool_result",
        callId: String(event.tool_call_id ?? `${tool}-${event.seq ?? ""}`),
        tool: `hermes:${tool}`,
        ok: !error && !preview.startsWith("BLOCKED"),
        summary: error ?? (preview.slice(0, 200) || "done"),
        ...(error ? { error } : {}),
      }
    }
    default:
      return null
  }
}

const TERMINAL = new Set(["run.completed", "run.failed", "run.cancelled", "run.interrupted"])

export const runHermes: Runtime = async (turn): Promise<TurnOutcome> => {
  const api = hermes(turn)
  const thread = getThread(turn.threadId)
  const sessionId = thread?.hermes_session_id ?? null

  const start = await fetch(`${api.url}/v1/runs`, {
    method: "POST",
    // Our run id makes a retried POST start the same Hermes run, not a second one.
    headers: { ...api.headers, "Idempotency-Key": turn.runId },
    body: JSON.stringify({
      input: turn.message,
      instructions: `${turn.agent.instructions}\n\nYour tools are the ones from the "${MCP_SERVER_NAME}" MCP server: ${turn.broker
        .offeredTools(turn.agent)
        .map((t) => t.name)
        .join(", ")}. Cite numbered sources as [n].`,
      model: turn.settings.model.model,
      ...(sessionId
        ? { session_id: sessionId }
        : // A thread that started on the lite runtime brings its earlier turns along.
          turn.history.length > 0
          ? { conversation_history: turn.history }
          : {}),
    }),
    signal: turn.signal,
  })
  if (!start.ok) throw new Error(`Hermes refused the run (HTTP ${start.status}): ${await failText(start)}`)
  const { run_id: hermesRunId } = (await start.json()) as { run_id: string }

  const onAbort = () => {
    void fetch(`${api.url}/v1/runs/${hermesRunId}/stop`, { method: "POST", headers: api.headers }).catch(() => {})
  }
  turn.signal.addEventListener("abort", onAbort, { once: true })

  let text = ""
  let lastSeq: number | null = null
  let terminal: HermesEvent | null = null

  try {
    for (let attempt = 0; attempt < 5 && !terminal; attempt++) {
      const res = await fetch(`${api.url}/v1/runs/${hermesRunId}/events${lastSeq !== null ? `?last_seq=${lastSeq}` : ""}`, {
        headers: { ...api.headers, Accept: "text/event-stream" },
        signal: turn.signal,
      })
      if (!res.ok || !res.body) throw new Error(`Hermes event stream failed (HTTP ${res.status}): ${await failText(res)}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (!terminal) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = parseSse(buffer)
        buffer = rest
        for (const data of events) {
          let event: HermesEvent
          try {
            event = JSON.parse(data) as HermesEvent
          } catch {
            continue
          }
          if (typeof event.seq === "number") lastSeq = event.seq
          if (event.event === "approval.request") {
            void answerApproval(turn, api, hermesRunId, event)
            continue
          }
          const mapped = translate(event)
          if (mapped) {
            if (mapped.type === "message_delta") text += mapped.text
            turn.emit(mapped)
          }
          if (TERMINAL.has(event.event)) {
            terminal = event
            break
          }
        }
      }
      // A dropped stream resumes from the last event seen.
    }
  } finally {
    turn.signal.removeEventListener("abort", onAbort)
  }

  if (!terminal) throw new Error("Lost the Hermes event stream before the run finished.")
  if (terminal.event !== "run.completed") {
    throw new Error(typeof terminal.error === "string" && terminal.error ? terminal.error : `Hermes run ended: ${terminal.event}`)
  }

  // Hermes minted the session on the first turn; keep it for the next ones.
  if (!sessionId) {
    const status = await fetch(`${api.url}/v1/runs/${hermesRunId}`, { headers: api.headers }).catch(() => null)
    const body = status?.ok ? ((await status.json()) as { session_id?: string }) : null
    if (body?.session_id) setHermesSession(turn.threadId, body.session_id)
  }

  const usage = (terminal.usage ?? {}) as { input_tokens?: number; output_tokens?: number }
  const outcome: TurnOutcome = {
    text: typeof terminal.output === "string" && terminal.output ? terminal.output : text,
    usage: { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 },
  }
  turn.emit({ type: "usage", ...outcome.usage })
  return outcome
}

/**
 * A Hermes approval (for one of Hermes' own gated tools) shown with the same
 * approval card as ours, recorded in the same table, and answered back.
 */
async function answerApproval(turn: TurnInput, api: ReturnType<typeof hermes>, hermesRunId: string, request: HermesEvent) {
  const description = String(request.description ?? request.command ?? "Hermes wants to run a gated action")
  const approval = createApproval({
    runId: turn.runId,
    agentId: turn.agent.id,
    callId: String(request.prompt_id ?? request.request_id ?? `hermes-${request.seq ?? ""}`),
    tool: "hermes.action",
    input: { description, command: request.command ?? null },
    timeoutSeconds: turn.agent.limits.approvalTimeoutSeconds,
  })
  turn.emit({
    type: "approval_required",
    approvalId: approval.id,
    callId: approval.call_id,
    tool: "hermes.action",
    input: { description, command: request.command ?? null },
    expiresAt: approval.expires_at,
  })
  const decision = await waitForDecision(approval.id, turn.agent.limits.approvalTimeoutSeconds, turn.signal)
  turn.emit({ type: "approval_resolved", approvalId: approval.id, decision })
  await fetch(`${api.url}/v1/runs/${hermesRunId}/approval`, {
    method: "POST",
    headers: api.headers,
    body: JSON.stringify(approvalBody(request, decision === "approved")),
  }).catch(() => {})
}
