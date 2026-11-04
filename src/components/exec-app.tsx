"use client"

import { Badge } from "@agent-starters/ui/components/badge"
import { Button } from "@agent-starters/ui/components/button"
import { AppShell, SidebarBrand, SidebarSection, StatusChips, ThreadList } from "@agent-starters/ui/agent/app-shell"
import { ChatView } from "@agent-starters/ui/agent/chat-view"
import { AuditPanel, CapabilityTable, Empty, List, Panel, PolicyList, Row, SearchProviders } from "@agent-starters/ui/agent/panels"
import { useAgentChat } from "@agent-starters/ui/agent/use-agent-chat"
import { ConfirmationField } from "@agent-starters/ui/elements/confirmation"
import { ConversationEmptyState } from "@agent-starters/ui/elements/conversation"
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@agent-starters/ui/elements/prompt-input"
import { Suggestion, Suggestions } from "@agent-starters/ui/elements/suggestion"
import { CalendarPlus, ExternalLink, Inbox, Mail } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import type { Capabilities } from "@/lib/capabilities"

interface Action {
  id: string
  kind: "draft" | "event"
  title: string
  detail: Record<string, unknown>
  link: string
  sample: boolean
  created_at: string
}

const TOOL_LABEL: Record<string, string> = {
  "mail.search": "Search mail",
  "mail.read": "Read thread",
  "mail.draft": "Save draft",
  "calendar.list": "Read calendar",
  "calendar.find_time": "Find free time",
  "calendar.create": "Create event",
  "search.web": "Web search",
  "page.read": "Read page",
}
const toolLabel = (tool: string) => TOOL_LABEL[tool] ?? tool
const list = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "")

export function ExecApp({ initialCapabilities: caps }: { initialCapabilities: Capabilities }) {
  const google = caps.google
  const [version, setVersion] = useState(0)
  const chat = useAgentChat({ onSettled: () => setVersion((v) => v + 1) })
  const [tab, setTab] = useState(google.account || google.sampleData ? "done" : "setup")
  const [input, setInput] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const { setError } = chat

  // The result of Connect Google comes back as a query parameter.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const failed = params.get("google_error")
    if (params.get("google") === "connected") setNotice("Google connected.")
    if (failed) {
      setError(failed)
      setTab("setup")
    }
    if (failed || params.has("google")) window.history.replaceState(null, "", window.location.pathname)
  }, [setError])

  const send = (text: string) => {
    setInput("")
    setNotice(null)
    void chat.send(text)
  }

  return (
    <AppShell
      sidebar={
        <>
          <SidebarBrand name={caps.agent.name} tagline={caps.agent.tagline} icon={<Inbox />} onNew={chat.reset} />
          <SidebarSection title="Conversations" className="min-h-0 flex-1 overflow-y-auto">
            <ThreadList threads={chat.threads} activeId={chat.threadId} onSelect={(t) => void chat.openThread(t.id)} onDelete={(id) => void chat.deleteThread(id)} />
          </SidebarSection>
        </>
      }
      header={
        <StatusChips caps={caps}>
          {google.sampleData && <Badge variant="warning">Sample mailbox</Badge>}
          <Badge variant={google.account ? "success" : "outline"}>{google.account ? google.account.email : "Google not connected"}</Badge>
        </StatusChips>
      }
      composer={
        <PromptInput onSubmit={() => send(input)}>
          <PromptInputTextarea value={input} onChange={(e) => setInput(e.target.value)} onSubmit={() => send(input)} placeholder="Triage my inbox, find time for…, draft a reply to…" />
          <PromptInputFooter>
            <PromptInputTools>Drafts and events wait for your approval. Nothing is sent.</PromptInputTools>
            <PromptInputSubmit running={chat.running} disabled={!input.trim()} onStop={() => void chat.stop()} />
          </PromptInputFooter>
        </PromptInput>
      }
      tab={tab}
      onTabChange={setTab}
      tabs={[
        { id: "done", label: "Done", content: <DonePanel version={version} /> },
        { id: "activity", label: "Activity", content: <AuditPanel version={version} label={toolLabel} /> },
        { id: "setup", label: "Setup", content: <SetupPanel caps={caps} /> },
      ]}
    >
      <ChatView
        turns={chat.turns}
        approvals={chat.approvals}
        onDecide={(id, d) => void chat.decide(id, d)}
        error={chat.error}
        toolLabel={toolLabel}
        renderApproval={(a) => {
          const i = (a.input ?? {}) as Record<string, unknown>
          if (a.tool === "mail.draft") {
            return {
              title: "Save this draft to Gmail?",
              approveLabel: "Save draft",
              body: (
                <div>
                  <ConfirmationField label="To">{list(i.to)}</ConfirmationField>
                  {list(i.cc) && <ConfirmationField label="Cc">{list(i.cc)}</ConfirmationField>}
                  <ConfirmationField label="Subject">{String(i.subject ?? "")}</ConfirmationField>
                  <p className="mt-2 max-h-60 overflow-y-auto rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{String(i.body ?? "")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Saved as a draft only. Nothing is sent.</p>
                </div>
              ),
            }
          }
          if (a.tool === "calendar.create") {
            return {
              title: "Add this event to your calendar?",
              approveLabel: "Create event",
              body: (
                <div>
                  <ConfirmationField label="Event">{String(i.summary ?? "")}</ConfirmationField>
                  <ConfirmationField label="When">
                    {new Date(String(i.start)).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} –{" "}
                    {new Date(String(i.end)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </ConfirmationField>
                  {list(i.attendees) && <ConfirmationField label="With">{list(i.attendees)}</ConfirmationField>}
                  {typeof i.location === "string" && <ConfirmationField label="Where">{i.location}</ConfirmationField>}
                  <p className="mt-2 text-xs text-muted-foreground">No invitation emails are sent.</p>
                </div>
              ),
            }
          }
          return null
        }}
        empty={
          <ConversationEmptyState
            icon={<Inbox className="size-6" />}
            title={notice ?? "What can I take off your plate?"}
            description={
              !google.account && !google.sampleData ? (
                <>
                  Connect Google under{" "}
                  <button onClick={() => setTab("setup")} className="text-brand underline-offset-2 hover:underline">
                    Setup
                  </button>{" "}
                  first, or set DEMO_DATA=true to try the sample mailbox.
                </>
              ) : (
                caps.agent.tagline
              )
            }
          >
            <Suggestions className="mt-4 max-w-2xl">
              {caps.agent.suggestions.map((s) => (
                <Suggestion key={s} suggestion={s} onClick={send} />
              ))}
            </Suggestions>
          </ConversationEmptyState>
        }
      />
    </AppShell>
  )
}

function DonePanel({ version }: { version: number }) {
  const [actions, setActions] = useState<Action[]>([])
  const load = useCallback(async () => {
    const res = await fetch("/api/actions")
    if (res.ok) setActions(((await res.json()) as { actions: Action[] }).actions)
  }, [])
  useEffect(() => {
    void load()
  }, [load, version])
  if (actions.length === 0) return <Empty>Drafts and events the assistant creates, after your approval, are listed here.</Empty>
  return (
    <List>
      {actions.map((a) => (
        <Row
          key={a.id}
          title={
            <span className="flex items-center gap-2">
              {a.kind === "draft" ? <Mail className="size-3.5 text-brand" /> : <CalendarPlus className="size-3.5 text-brand" />}
              {a.title}
              {a.sample && <Badge variant="warning">sample</Badge>}
            </span>
          }
          detail={`${a.kind === "draft" ? `Draft to ${list(a.detail.to)}` : `Event ${new Date(String(a.detail.start)).toLocaleString()}`} · ${new Date(a.created_at).toLocaleString()}`}
          trailing={
            a.link.startsWith("https://") ? (
              <a href={a.link} target="_blank" rel="noreferrer noopener" aria-label="Open in Google" className="text-brand">
                <ExternalLink className="size-4" />
              </a>
            ) : undefined
          }
        />
      ))}
    </List>
  )
}

function SetupPanel({ caps }: { caps: Capabilities }) {
  const google = caps.google
  const [busy, setBusy] = useState(false)
  const disconnect = async () => {
    setBusy(true)
    await fetch("/api/google/disconnect", { method: "POST" })
    window.location.reload()
  }
  return (
    <div className="space-y-6">
      <Panel title="Google">
        <List>
          {google.setupProblem ? (
            <div className="space-y-2 p-3 text-sm">
              <p>{google.setupProblem}</p>
              <p className="text-xs text-muted-foreground">
                Redirect URI to register on your OAuth client: <code className="font-mono break-all">{google.redirectUri}</code>
              </p>
            </div>
          ) : google.account ? (
            <div className="space-y-3 p-3">
              <Row className="p-0" title={google.account.email} detail={`Connected ${new Date(google.account.connectedAt).toLocaleString()}`} trailing={<Badge variant="success">Connected</Badge>} />
              {google.account.missingScopes.length > 0 && <p className="text-xs text-warning">Some permissions were not granted; the tools that need them will fail. Reconnect to grant them.</p>}
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href="/api/google/connect">Reconnect</a>
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={disconnect} disabled={busy}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-3 text-sm">
              <p>Connect the Google account whose inbox and calendar the assistant should manage. Tokens are stored encrypted on this server only.</p>
              <Button asChild variant="brand" size="sm">
                <a href="/api/google/connect">Connect Google</a>
              </Button>
            </div>
          )}
        </List>
        <details className="px-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Permissions requested</summary>
          <ul className="mt-1 space-y-0.5 font-mono break-all">
            {google.requestedScopes.map((s) => (
              <li key={s}>{s.replace("https://www.googleapis.com/auth/", "")}</li>
            ))}
          </ul>
          <p className="mt-1">Derived from the tool policies below. Google&apos;s compose permission also allows sending; this app has no send tool.</p>
        </details>
        {!caps.passwordProtected && <p className="px-1 text-xs text-warning">No APP_PASSWORD set: anyone who can open this app can read the connected mailbox.</p>}
      </Panel>
      <Panel title="Tool policies" description="Enforced on the server, whichever runtime asks.">
        <PolicyList policies={caps.policies} label={toolLabel} />
      </Panel>
      <Panel title="Search">
        <SearchProviders search={caps.search} />
      </Panel>
      <Panel title="Lite vs Hermes">
        <CapabilityTable matrix={caps.matrix} />
      </Panel>
    </div>
  )
}
