"use client"

// Adapted from Vercel AI Elements (Apache-2.0, https://github.com/vercel/ai-elements):
// the starters' tool-call states (from the broker's events) instead of AI SDK
// tool parts, and the JSON shown as plain preformatted text.
import { ChevronDown, CircleCheck, CircleX, Clock, LoaderCircle, ShieldCheck, Wrench } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { Badge } from "../components/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/collapsible"
import { cn } from "../lib/utils"

export type ToolState = "running" | "waiting" | "ok" | "failed"

const STATUS: Record<ToolState, { label: string; icon: ReactNode; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  running: { label: "Running", icon: <LoaderCircle className="animate-spin" />, variant: "secondary" },
  waiting: { label: "Needs approval", icon: <ShieldCheck />, variant: "warning" },
  ok: { label: "Done", icon: <CircleCheck />, variant: "success" },
  failed: { label: "Not run", icon: <CircleX />, variant: "destructive" },
}

export const Tool = ({ className, ...props }: ComponentProps<typeof Collapsible>) => (
  <Collapsible className={cn("group/tool w-full overflow-hidden rounded-xl border bg-card shadow-soft", className)} {...props} />
)

export function ToolHeader({ title, state, detail, className }: { title: string; state: ToolState; detail?: ReactNode; className?: string }) {
  const status = STATUS[state]
  return (
    <CollapsibleTrigger className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left", className)}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        {state === "running" ? <Clock className="size-3.5" /> : <Wrench className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-xs font-medium">{title}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
      <Badge variant={status.variant}>
        {status.icon}
        {status.label}
      </Badge>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
    </CollapsibleTrigger>
  )
}

export const ToolContent = ({ className, ...props }: ComponentProps<typeof CollapsibleContent>) => (
  <CollapsibleContent
    className={cn("space-y-3 border-t px-3 py-3 text-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0", className)}
    {...props}
  />
)

export function ToolInput({ input }: { input: unknown }) {
  if (input === undefined) return null
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Input</h4>
      <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-2.5 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(input, null, 2)}</pre>
    </div>
  )
}

export function ToolOutput({ summary, failed }: { summary?: string; failed?: boolean }) {
  if (!summary) return null
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{failed ? "Why" : "Result"}</h4>
      <p className={cn("rounded-lg p-2.5", failed ? "bg-destructive/10 text-destructive" : "bg-muted")}>{summary}</p>
    </div>
  )
}
