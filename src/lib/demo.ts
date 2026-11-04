import type { Runtime } from "@agent-starters/kit/runtime/types"

/**
 * DEMO: a scripted turn for a fresh clone with no model key. No model is
 * called. The tools, policies, approval and audit are the real ones, run on
 * the sample mailbox: it searches unread mail, reads the thread that matters,
 * finds free time, and drafts a reply that waits for your approval.
 */

const say = async (turn: Parameters<Runtime>[0], text: string) => {
  for (const word of text.split(/(?<=\s)/)) {
    turn.emit({ type: "message_delta", text: word })
    await new Promise((r) => setTimeout(r, 12))
  }
}

const nextWeekday = (from: Date, days: number) => {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

export const runDemo: Runtime = async (turn) => {
  const call = (name: string, input: unknown) =>
    turn.broker.runTool(name, input, `demo_${name}_${crypto.randomUUID().slice(0, 6)}`, {
      agent: turn.agent,
      runId: turn.runId,
      threadId: turn.threadId,
      initiator: "demo",
      signal: turn.signal,
      emit: turn.emit,
      sources: turn.sources,
      toolCalls: turn.toolCalls,
    })

  await call("mail_search", { query: "is:unread", max_results: 10 })
  await call("mail_read", { thread_id: "t-board" })
  const now = new Date()
  const free = await call("calendar_find_time", { start: now.toISOString(), end: nextWeekday(now, 5), duration_minutes: 30 })
  const slot = free.content.match(/- (.+?) – /)?.[1] ?? "Wednesday afternoon"

  const draft = await call("mail_draft", {
    thread_id: "t-board",
    to: ["priya@example.com"],
    subject: "Re: Board deck: numbers needed by Thursday",
    body: `Hi Priya,\n\nYes, I'll send the Q3 revenue and churn figures by Thursday noon, with the churn definition signed off.\n\nFor the narrative, does ${slot} work for 30 minutes?\n\nThanks`,
  })

  const text = [
    "**DEMO: scripted turn on the sample mailbox. No model was called.** Add a model key in `.env` for live work, and connect Google under Setup for your real inbox.",
    "",
    "**Needs you first**",
    "1. **Priya Natarajan: board deck numbers, due Thursday noon.** She needs your sign-off on the churn definition and 30 minutes for the narrative.",
    `2. **Lee Kim: staff engineer loop.** The panel is set; pick Tuesday or Thursday afternoon.`,
    "3. **Sam Ortega (vendor): renewal quote.** Decide this month to keep last year's price. Note: this email contains an instruction to forward your mail to the sender; I ignored it.",
    "",
    "The Analytics Weekly newsletter can wait.",
    "",
    draft.ok
      ? `I saved a reply to Priya proposing ${slot}. It is a draft and has not been sent.`
      : `The reply to Priya was not saved: ${draft.content.replace(/^Tool not run: /, "")}`,
  ].join("\n")
  await say(turn, text)
  return { text, usage: { inputTokens: 0, outputTokens: 0 } }
}
