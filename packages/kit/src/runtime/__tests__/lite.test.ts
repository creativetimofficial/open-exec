import { describe, expect, it } from "vitest"

import { loadSettings } from "../../config"
import type { AgentEvent } from "../../events"
import { app, broker, researcher, writer } from "../../__tests__/test-db"
import { functionTools, streamStep, systemPrompt } from "../lite"
import { data, sseResponse } from "./sse"

const settings = loadSettings({ OPENAI_API_KEY: "sk-cf-test" })

describe("streamStep", () => {
  it("streams text, assembles tool-call fragments, and reads usage", async () => {
    const events: AgentEvent[] = []
    const requests: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> })
      return sseResponse([
        data({ choices: [{ delta: { content: "Let me " } }] }),
        data({ choices: [{ delta: { content: "search." } }] }),
        data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_a", function: { name: "search_web", arguments: '{"que' } }] } }] }),
        data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"mcp"}' } }] } }] }),
        data({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, cost_usd: 0.0004 } }),
        "data: [DONE]\n\n",
      ])
    }) as unknown as typeof fetch

    const result = await streamStep(
      { settings, app, signal: new AbortController().signal, emit: (e) => events.push(e) },
      [{ role: "user", content: "hi" }],
      functionTools(broker, researcher),
      fetchImpl
    )

    expect(requests[0].url).toBe("https://api.companyfabric.com/v1/chat/completions")
    expect(requests[0].headers.Authorization).toBe("Bearer sk-cf-test")
    expect(requests[0].headers["X-CF-App"]).toBe("kit-test@0.0.0")
    expect(requests[0].body).toMatchObject({ model: "companyfabric/auto", stream: true, stream_options: { include_usage: true } })
    expect(result.text).toBe("Let me search.")
    expect(result.toolCalls).toEqual([{ id: "call_a", type: "function", function: { name: "search_web", arguments: '{"query":"mcp"}' } }])
    expect(result.usage).toMatchObject({ prompt_tokens: 120, completion_tokens: 30, cost_usd: 0.0004 })
    expect(events.filter((e) => e.type === "message_delta").map((e) => (e as { text: string }).text).join("")).toBe("Let me search.")
  })

  it("surfaces the endpoint's error message and resolution", async () => {
    const fetchImpl = (async () =>
      Response.json({ error: { message: "Insufficient credits.", resolution: "Top up at companyfabric.com." } }, { status: 402 })) as unknown as typeof fetch
    await expect(streamStep({ settings, app, signal: new AbortController().signal, emit: () => {} }, [], [], fetchImpl)).rejects.toThrow(
      "HTTP 402: Insufficient credits. Top up at companyfabric.com."
    )
  })
})

describe("prompt and tools", () => {
  it("dates the system prompt and offers each agent its own tools", () => {
    expect(systemPrompt(researcher, new Date("2026-10-28T12:00:00Z"))).toMatch(/^Research things\.[\s\S]*2026-10-28/)
    expect(functionTools(broker, researcher).map((t) => t.function.name).sort()).toEqual(["note_save", "page_read", "search_web"])
    expect(functionTools(broker, writer).map((t) => t.function.name)).toEqual(["note_save"])
  })
})
