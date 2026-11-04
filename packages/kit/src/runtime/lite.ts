import type { AgentProfile, AppInfo } from "../agent"
import { parseSse } from "../events"
import { inputJsonSchema, type Broker } from "../tools/broker"
import type { Runtime, TurnInput, TurnOutcome } from "./types"

/**
 * The lite runtime: a tool-calling loop in this server, on any
 * chat.completions endpoint (CompanyFabric by default, OpenAI, or a local
 * server). No container and no extra service, so it also runs on serverless
 * hosts. What it does not have (files, a terminal, a browser, schedules,
 * memory across threads) is what the Hermes runtime adds.
 */

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export function systemPrompt(agent: AgentProfile, today = new Date()): string {
  return `${agent.instructions}\n\nToday's date is ${today.toISOString().slice(0, 10)}.`
}

export function functionTools(broker: Broker, agent: AgentProfile) {
  return broker.offeredTools(agent).map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: inputJsonSchema(t) },
  }))
}

interface StepResult {
  text: string
  toolCalls: ToolCall[]
  usage: { prompt_tokens?: number; completion_tokens?: number; cost_usd?: number } | null
}

/** One streamed chat.completions call; text deltas go out as they arrive. */
export async function streamStep(
  turn: Pick<TurnInput, "settings" | "signal" | "emit"> & { app: AppInfo },
  messages: ChatMessage[],
  tools: ReturnType<typeof functionTools>,
  fetchImpl: typeof fetch = fetch
): Promise<StepResult> {
  const { baseUrl, apiKey, model } = turn.settings.model
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      // Names this app to CompanyFabric for per-app usage (planned there; ignored today and by other providers).
      "X-CF-App": `${turn.app.id}@${turn.app.version}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: turn.signal,
  })
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "")
    let detail = body.slice(0, 300)
    try {
      const json = JSON.parse(body) as { error?: { message?: string; resolution?: string } }
      detail = [json.error?.message, json.error?.resolution].filter(Boolean).join(" ") || detail
    } catch {
      /* not JSON: keep the raw text */
    }
    throw new Error(`The model endpoint answered HTTP ${res.status}${detail ? `: ${detail}` : ""}`)
  }

  let text = ""
  const calls = new Map<number, ToolCall>()
  let usage: StepResult["usage"] = null
  const decoder = new TextDecoder()
  let buffer = ""
  const reader = res.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSse(buffer)
    buffer = rest
    for (const data of events) {
      if (data === "[DONE]") continue
      let chunk: {
        choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[]
        usage?: StepResult["usage"]
      }
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      if (chunk.usage) usage = chunk.usage
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) {
        text += delta.content
        turn.emit({ type: "message_delta", text: delta.content })
      }
      for (const [i, part] of (delta.tool_calls ?? []).entries()) {
        const index = part.index ?? i
        const call = calls.get(index) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } }
        if (part.id) call.id = part.id
        if (part.function?.name) call.function.name += part.function.name
        if (part.function?.arguments) call.function.arguments += part.function.arguments
        calls.set(index, call)
      }
    }
  }
  const toolCalls = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, c]) => ({ ...c, id: c.id || `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` }))
  return { text, toolCalls, usage }
}

export const runLite: Runtime = async (turn): Promise<TurnOutcome> => {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(turn.agent) },
    ...turn.history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: "user", content: turn.message },
  ]
  const tools = functionTools(turn.broker, turn.agent)
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: undefined as number | undefined }
  const parts: string[] = []

  for (let step = 0; step < turn.agent.limits.maxStepsPerRun; step++) {
    const result = await streamStep(turn, messages, tools)
    usage.inputTokens += result.usage?.prompt_tokens ?? 0
    usage.outputTokens += result.usage?.completion_tokens ?? 0
    if (typeof result.usage?.cost_usd === "number") usage.costUsd = (usage.costUsd ?? 0) + result.usage.cost_usd
    if (result.text) parts.push(result.text)

    if (result.toolCalls.length === 0) {
      turn.emit({ type: "usage", ...usage })
      return { text: parts.join("\n\n"), usage }
    }

    messages.push({ role: "assistant", content: result.text || null, tool_calls: result.toolCalls })
    for (const call of result.toolCalls) {
      let input: unknown = {}
      try {
        input = call.function.arguments ? JSON.parse(call.function.arguments) : {}
      } catch {
        input = { _unparsed: call.function.arguments }
      }
      const outcome = await turn.broker.runTool(call.function.name, input, call.id, {
        agent: turn.agent,
        runId: turn.runId,
        threadId: turn.threadId,
        initiator: "lite",
        signal: turn.signal,
        emit: turn.emit,
        sources: turn.sources,
        toolCalls: turn.toolCalls,
      })
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content })
    }
  }
  turn.emit({ type: "usage", ...usage })
  throw new Error(`Stopped after ${turn.agent.limits.maxStepsPerRun} model steps without a final answer.`)
}
