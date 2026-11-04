"use client"

import { ArrowRight, CircleAlert } from "lucide-react"
import type { ReactNode } from "react"

import { Confirmation, ConfirmationField } from "../elements/confirmation"
import { Conversation, ConversationContent, ConversationScrollButton } from "../elements/conversation"
import { Message, MessageAuthor, MessageContent } from "../elements/message"
import { Shimmer } from "../elements/shimmer"
import { Sources } from "../elements/sources"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "../elements/tool"
import { Markdown } from "./markdown"
import type { Turn } from "./turns"
import type { PendingApproval } from "./use-agent-chat"

/** "search.web" → "Search web"; starters pass their own names where they have better ones. */
export const defaultToolLabel = (tool: string) => {
  const words = tool.replace(/[._]/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export interface ApprovalView {
  title: ReactNode
  body?: ReactNode
  approveLabel?: string
}

/** The generic approval card body: each field of the input on its own line. */
export function defaultApprovalView(approval: PendingApproval, toolLabel: (tool: string) => string): ApprovalView {
  const input = approval.input && typeof approval.input === "object" ? (approval.input as Record<string, unknown>) : null
  return {
    title: `Allow ${toolLabel(approval.tool).toLowerCase()}?`,
    body: input ? (
      <div>
        {Object.entries(input).map(([k, v]) => (
          <ConfirmationField key={k} label={k.replace(/_/g, " ")}>
            {typeof v === "string" ? <span className="whitespace-pre-wrap">{v}</span> : Array.isArray(v) ? v.join(", ") : JSON.stringify(v)}
          </ConfirmationField>
        ))}
      </div>
    ) : (
      <pre className="font-mono text-xs">{JSON.stringify(approval.input, null, 2)}</pre>
    ),
  }
}

export interface ChatViewProps {
  turns: Turn[]
  approvals: PendingApproval[]
  onDecide: (approvalId: string, decision: "approved" | "denied") => void
  error?: string | null
  empty?: ReactNode
  /** Shown above assistant turns; defaults to the turn's agent name. */
  assistantName?: string
  toolLabel?: (tool: string) => string
  renderApproval?: (approval: PendingApproval) => ApprovalView | null
  workingLabel?: string
}

export function ChatView({ turns, approvals, onDecide, error, empty, assistantName, toolLabel = defaultToolLabel, renderApproval, workingLabel = "Working…" }: ChatViewProps) {
  const byId = new Map(approvals.map((a) => [a.approvalId, a]))
  const shown = new Set<string>()
  const card = (a: PendingApproval) => {
    shown.add(a.approvalId)
    const view = renderApproval?.(a) ?? defaultApprovalView(a, toolLabel)
    return (
      <Confirmation key={a.approvalId} title={view.title} expiresAt={a.expiresAt} approveLabel={view.approveLabel} onApprove={() => onDecide(a.approvalId, "approved")} onDeny={() => onDecide(a.approvalId, "denied")}>
        {view.body}
      </Confirmation>
    )
  }

  const body = turns.map((t) => (
    <div key={t.key} className="flex flex-col gap-4">
      {t.prompt !== null ? (
        <Message from="user">
          <MessageContent>{t.prompt}</MessageContent>
        </Message>
      ) : (
        <div className="flex items-center gap-2 self-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
          <ArrowRight className="size-3.5" /> Handed off to {t.agentName}
        </div>
      )}
      <Message from="assistant">
        <MessageAuthor name={assistantName ?? t.agentName ?? "Assistant"} detail={t.demo ? "DEMO" : undefined} />
        {t.tools.length > 0 && (
          <div className="flex flex-col gap-2">
            {t.tools.map((c) => {
              const pending = c.approvalId ? byId.get(c.approvalId) : undefined
              return (
                <div key={c.callId} className="flex flex-col gap-2">
                  <Tool>
                    <ToolHeader title={toolLabel(c.tool)} state={c.state} detail={c.summary} />
                    <ToolContent>
                      <ToolInput input={c.input} />
                      <ToolOutput summary={c.summary} failed={c.state === "failed"} />
                    </ToolContent>
                  </Tool>
                  {pending && card(pending)}
                </div>
              )
            })}
          </div>
        )}
        <MessageContent>
          {t.text ? <Markdown text={t.text} sources={t.sources} /> : t.status === "running" ? <Shimmer>{workingLabel}</Shimmer> : null}
          {t.error && (
            <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {t.error}
            </div>
          )}
          <Sources sources={t.sources} />
        </MessageContent>
      </Message>
    </div>
  ))
  // Approvals from runs not shown here (another tab, a schedule).
  const others = approvals.filter((a) => !shown.has(a.approvalId))

  return (
    <Conversation>
      <ConversationContent>
        {turns.length === 0 && empty}
        {body}
        {others.map(card)}
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}
