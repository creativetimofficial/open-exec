"use client"

// Adapted from Vercel AI Elements (Apache-2.0, https://github.com/vercel/ai-elements):
// numbered sources that match the answer's [n] citations.
import type { Source as KitSource } from "@agent-starters/kit/events"
import { ChevronDown, Globe } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/collapsible"
import { cn } from "../lib/utils"

export function Sources({ sources, className, defaultOpen = false }: { sources: KitSource[]; className?: string; defaultOpen?: boolean }) {
  if (sources.length === 0) return null
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn("group/sources text-xs", className)}>
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground">
        <Globe className="size-3.5" />
        {sources.length} {sources.length === 1 ? "source" : "sources"}
        <ChevronDown className="size-3.5 transition-transform group-data-[state=open]/sources:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {sources.map((s) => (
            <li key={s.n} id={`source-${s.n}`}>
              <SourceCard source={s} />
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function SourceCard({ source }: { source: KitSource }) {
  const host = URL.canParse(source.url) ? new URL(source.url).hostname.replace(/^www\./, "") : source.url
  return (
    <a href={source.url} target="_blank" rel="noreferrer noopener" className="flex h-full flex-col gap-1 rounded-xl border bg-card p-3 shadow-soft transition-shadow hover:shadow-float">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="flex size-4 items-center justify-center rounded bg-brand/12 text-xs font-semibold text-brand">{source.n}</span>
        <span className="truncate">{host}</span>
      </span>
      <span className="line-clamp-2 font-medium text-foreground">{source.title}</span>
    </a>
  )
}
