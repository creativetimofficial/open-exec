"use client"

import type { BaseCapabilities, CapabilityRow } from "@agent-starters/kit/capabilities"
import type { Source } from "@agent-starters/kit/events"
import { CircleCheck, CircleX, Clock, ShieldCheck } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { Badge } from "../components/badge"
import { SourceCard } from "../elements/sources"
import { cn } from "../lib/utils"

/** Inspector building blocks shared by the starters. */

export function Panel({ title, description, action, children, className }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        {action}
      </div>
      {description && <p className="px-1 text-xs text-muted-foreground">{description}</p>}
      {children}
    </section>
  )
}

/** A grouped list in the iOS Settings manner: one rounded card, hairline rows. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y overflow-hidden rounded-xl border bg-card shadow-soft", className)}>{children}</div>
}

export function Row({ title, detail, trailing, onClick, className }: { title: ReactNode; detail?: ReactNode; trailing?: ReactNode; onClick?: () => void; className?: string }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{title}</span>
        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
      {trailing && <span className="shrink-0 text-xs text-muted-foreground">{trailing}</span>}
    </>
  )
  const cls = cn("flex w-full items-center gap-3 px-3 py-2.5 text-left", onClick && "transition-colors hover:bg-foreground/5", className)
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">{children}</p>
}

export function SourcesPanel({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return <Empty>Sources the agent retrieves appear here, numbered as the answer cites them.</Empty>
  return (
    <ol className="space-y-2 text-xs">
      {sources.map((s) => (
        <li key={s.n}>
          <SourceCard source={s} />
        </li>
      ))}
    </ol>
  )
}

const POLICY: Record<string, { label: string; variant: "success" | "warning" | "outline" }> = {
  allow: { label: "Allowed", variant: "success" },
  approve: { label: "Asks you", variant: "warning" },
  deny: { label: "Denied", variant: "outline" },
}

export function PolicyList({ policies, label = (t: string) => t }: { policies: Record<string, string>; label?: (tool: string) => string }) {
  return (
    <List>
      {Object.entries(policies).map(([tool, policy]) => (
        <Row key={tool} title={label(tool)} detail={<span className="font-mono">{tool}</span>} trailing={<Badge variant={POLICY[policy]?.variant ?? "outline"}>{POLICY[policy]?.label ?? policy}</Badge>} />
      ))}
    </List>
  )
}

export function SearchProviders({ search }: { search: BaseCapabilities["search"] }) {
  return (
    <List>
      {search.providers.map((p) => (
        <Row
          key={p.id}
          title={
            <span className="flex items-center gap-2">
              {p.label}
              {p.id === search.active && <Badge variant="brand">Active</Badge>}
            </span>
          }
          detail={p.unavailableReason ?? p.verification}
        />
      ))}
    </List>
  )
}

const SUPPORT: Record<CapabilityRow["lite"], ReactNode> = {
  yes: <CircleCheck className="size-4 text-success" aria-label="Yes" />,
  no: <CircleX className="size-4 text-muted-foreground/60" aria-label="No" />,
  "off-by-default": <span className="text-xs text-muted-foreground">Off by default</span>,
  "not-in-ui-yet": <span className="text-xs text-muted-foreground">Not in UI yet</span>,
}

export function CapabilityTable({ matrix }: { matrix: CapabilityRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Capability</th>
            <th className="w-16 px-2 py-2 text-center font-medium">Lite</th>
            <th className="w-20 px-2 py-2 text-center font-medium">Hermes</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {matrix.map((row) => (
            <tr key={row.capability} title={row.note}>
              <td className="px-3 py-2">{row.capability}</td>
              <td className="px-2 py-2">
                <span className="flex justify-center">{SUPPORT[row.lite]}</span>
              </td>
              <td className="px-2 py-2">
                <span className="flex justify-center">{SUPPORT[row.hermes]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface AuditRow {
  id: number
  agent_id: string
  tool: string
  initiator: string
  policy: string
  status: "requested" | "denied" | "running" | "succeeded" | "failed"
  summary: string | null
  error: string | null
  created_at: string
}

const AUDIT_ICON: Record<AuditRow["status"], ReactNode> = {
  requested: <ShieldCheck className="size-3.5 text-warning" />,
  running: <Clock className="size-3.5 text-muted-foreground" />,
  succeeded: <CircleCheck className="size-3.5 text-success" />,
  denied: <CircleX className="size-3.5 text-muted-foreground" />,
  failed: <CircleX className="size-3.5 text-destructive" />,
}

/** The broker's audit log (GET /api/audit), newest first; refreshes when `version` changes. */
export function AuditPanel({ version, label = (t: string) => t, agentName }: { version: number; label?: (tool: string) => string; agentName?: (id: string) => string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  useEffect(() => {
    void fetch("/api/audit")
      .then((r) => (r.ok ? r.json() : { audit: [] }))
      .then((d: { audit: AuditRow[] }) => setRows(d.audit.slice(0, 60)))
  }, [version])
  if (!rows) return null
  if (rows.length === 0) return <Empty>Every tool call is recorded here before it runs, with who asked and what happened.</Empty>
  return (
    <List>
      {rows.map((r) => (
        <Row
          key={r.id}
          title={
            <span className="flex items-center gap-2">
              {AUDIT_ICON[r.status]}
              {label(r.tool)}
            </span>
          }
          detail={[agentName?.(r.agent_id), r.error ?? r.summary, new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · ")}
        />
      ))}
    </List>
  )
}
