"use client"

import { parseSse, type AgentEvent, type Source } from "@agent-starters/kit/events"
import { useCallback, useEffect, useRef, useState } from "react"

import { emptyChat, pendingTurn, reduceChat, turnsFromMessages, type ChatState } from "./turns"

/**
 * The client side every starter shares: send a message to POST /api/runs and
 * fold its SSE events into turns, stop a run, list and open threads, and
 * keep the pending approvals (from this run or any other) up to date.
 */

export interface PendingApproval {
  approvalId: string
  callId: string
  tool: string
  input: unknown
  expiresAt: string
  agentId?: string
}

export interface ThreadSummary {
  id: string
  title: string
  agent_id: string
  updated_at: string
}

export interface UseAgentChatOptions {
  /** Extra fields for POST /api/runs, e.g. { coworkerId }. */
  body?: () => Record<string, unknown>
  /** Called for every event, after the turns are updated (refresh a panel on a tool result, say). */
  onEvent?: (event: AgentEvent) => void
  /** Called when a run's stream ends, however it ended. */
  onSettled?: () => void
}

export function useAgentChat(options: UseAgentChatOptions = {}) {
  const [chat, setChat] = useState<ChatState>(emptyChat)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  const opts = useRef(options)
  opts.current = options
  const chatRef = useRef(chat)
  chatRef.current = chat

  const refreshThreads = useCallback(async () => {
    const res = await fetch("/api/threads").catch(() => null)
    if (res?.ok) setThreads(((await res.json()) as { threads: ThreadSummary[] }).threads)
  }, [])

  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  // Approvals can come from runs this tab did not start (Hermes on a schedule).
  useEffect(() => {
    const poll = async () => {
      const res = await fetch("/api/approvals").catch(() => null)
      if (!res?.ok) return
      const { approvals: rows } = (await res.json()) as { approvals: { id: string; call_id: string; tool: string; input: unknown; expires_at: string; agent_id: string }[] }
      setApprovals(rows.map((r) => ({ approvalId: r.id, callId: r.call_id, tool: r.tool, input: r.input, expiresAt: r.expires_at, agentId: r.agent_id })))
    }
    const timer = setInterval(poll, 4000)
    void poll()
    return () => clearInterval(timer)
  }, [])

  const apply = (event: AgentEvent) => {
    setChat((s) => reduceChat(s, event))
    if (event.type === "approval_required") {
      setApprovals((p) => (p.some((a) => a.approvalId === event.approvalId) ? p : [...p, { approvalId: event.approvalId, callId: event.callId, tool: event.tool, input: event.input, expiresAt: event.expiresAt }]))
    }
    if (event.type === "approval_resolved") setApprovals((p) => p.filter((a) => a.approvalId !== event.approvalId))
    opts.current.onEvent?.(event)
  }

  const send = useCallback(async (text: string, agent?: { id: string; name: string }, extra: Record<string, unknown> = {}) => {
    const message = text.trim()
    // One run at a time from this view; activeRunId is "starting" until the server names the run.
    if (!message || chatRef.current.activeRunId !== null) return
    setError(null)
    setRunning(true)
    const starting = { ...chatRef.current, turns: [...chatRef.current.turns, pendingTurn(message, agent)], activeRunId: "starting" }
    chatRef.current = starting
    setChat(starting)
    try {
      const threadId = chatRef.current.threadId
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ...(threadId ? { threadId } : {}), ...opts.current.body?.(), ...extra }),
      })
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed (${res.status}).`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = parseSse(buffer)
        buffer = rest
        for (const data of events) apply(JSON.parse(data) as AgentEvent)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      // A message the server never accepted is not part of the thread.
      setChat((s) => ({ ...s, turns: s.turns.filter((t) => t.runId !== null) }))
    } finally {
      setRunning(false)
      setChat((s) => ({ ...s, activeRunId: null, turns: s.turns.map((t) => (t.status === "running" ? { ...t, status: "done" } : t)) }))
      void refreshThreads()
      opts.current.onSettled?.()
    }
  }, [refreshThreads])

  const stop = useCallback(async () => {
    const runId = chatRef.current.activeRunId
    if (runId && runId !== "starting") await fetch(`/api/runs/${runId}/stop`, { method: "POST" })
  }, [])

  const decide = useCallback(async (approvalId: string, decision: "approved" | "denied") => {
    setApprovals((p) => p.filter((a) => a.approvalId !== approvalId))
    await fetch(`/api/approvals/${approvalId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) })
  }, [])

  const openThread = useCallback(async (id: string, agent?: { id: string; name: string }) => {
    if (chatRef.current.activeRunId) return
    const res = await fetch(`/api/threads/${id}`)
    if (!res.ok) return
    const { messages } = (await res.json()) as { messages: { role: "user" | "assistant"; content: string; sources: Source[] }[] }
    chatRef.current = { turns: turnsFromMessages(messages, agent), activeRunId: null, threadId: id }
    setChat(chatRef.current)
    setError(null)
  }, [])

  const reset = useCallback(() => {
    if (chatRef.current.activeRunId) return
    // Updated now, not on the next render, so a send() right after starts a new thread.
    chatRef.current = emptyChat
    setChat(emptyChat)
    setError(null)
  }, [])

  const deleteThread = useCallback(
    async (id: string) => {
      await fetch(`/api/threads/${id}`, { method: "DELETE" })
      if (chatRef.current.threadId === id) setChat(emptyChat)
      void refreshThreads()
    },
    [refreshThreads]
  )

  return { ...chat, running, error, setError, threads, refreshThreads, approvals, send, stop, decide, openThread, reset, deleteThread }
}

export type AgentChat = ReturnType<typeof useAgentChat>
