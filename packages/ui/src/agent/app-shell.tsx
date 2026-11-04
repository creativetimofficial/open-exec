"use client"

import type { BaseCapabilities } from "@agent-starters/kit/capabilities"
import { MessageSquare, PanelRight, SquarePen, Trash2 } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Badge } from "../components/badge"
import { Button } from "../components/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/tabs"
import { cn } from "../lib/utils"
import type { ThreadSummary } from "./use-agent-chat"

/**
 * The three-pane window every starter uses, in the manner of Apple's Mail or
 * Notes: a translucent sidebar (brand, optional extra section, threads), the
 * conversation in the middle with its composer, and an inspector of tabs on
 * the right. On small screens the panes stack and the inspector toggles.
 */

export interface InspectorTab {
  id: string
  label: string
  content: ReactNode
}

export interface AppShellProps {
  sidebar: ReactNode
  header?: ReactNode
  composer: ReactNode
  children: ReactNode
  tabs: InspectorTab[]
  tab: string
  onTabChange: (id: string) => void
}

export function AppShell({ sidebar, header, composer, children, tabs, tab, onTabChange }: AppShellProps) {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  return (
    <div className="flex h-dvh flex-col bg-background lg:flex-row">
      <aside className="flex max-h-72 shrink-0 flex-col border-b bg-sidebar backdrop-blur-xl lg:max-h-none lg:w-72 lg:border-r lg:border-b-0">{sidebar}</aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-glass px-4 py-2.5 backdrop-blur-xl">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{header}</div>
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setInspectorOpen((o) => !o)} aria-label="Toggle details">
            <PanelRight />
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6">{composer}</div>
      </main>

      <aside className={cn("min-h-0 shrink-0 border-t bg-card/60 lg:block lg:w-96 lg:border-t-0 lg:border-l", inspectorOpen ? "block" : "hidden")}>
        <Tabs value={tab} onValueChange={onTabChange} className="h-full p-4">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="min-h-0 overflow-y-auto">
              {t.content}
            </TabsContent>
          ))}
        </Tabs>
      </aside>
    </div>
  )
}

export function SidebarBrand({ name, tagline, icon, onNew, newLabel = "New conversation" }: { name: string; tagline: string; icon: ReactNode; onNew?: () => void; newLabel?: string }) {
  return (
    <div className="flex items-start gap-3 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-brand/85 to-brand text-white shadow-soft [&_svg]:size-4.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold tracking-tight">{name}</div>
        <div className="line-clamp-2 text-xs text-muted-foreground">{tagline}</div>
      </div>
      {onNew && (
        <Button variant="ghost" size="icon-sm" onClick={onNew} aria-label={newLabel} title={newLabel}>
          <SquarePen />
        </Button>
      )}
    </div>
  )
}

export function SidebarSection({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("px-2 pb-2", className)}>
      {title && (
        <div className="flex items-center justify-between px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
          <span>{title}</span>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function ThreadList({ threads, activeId, onSelect, onDelete, emptyLabel = "No conversations yet" }: { threads: ThreadSummary[]; activeId: string | null; onSelect: (t: ThreadSummary) => void; onDelete?: (id: string) => void; emptyLabel?: string }) {
  if (threads.length === 0) return <p className="px-3 py-2 text-xs text-muted-foreground">{emptyLabel}</p>
  return (
    <ul className="space-y-0.5">
      {threads.map((t) => (
        <li key={t.id} className={cn("group flex items-center rounded-lg transition-colors", t.id === activeId ? "bg-brand/12 text-foreground" : "hover:bg-foreground/5")}>
          <button onClick={() => onSelect(t)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm">
            <MessageSquare className={cn("size-3.5 shrink-0", t.id === activeId ? "text-brand" : "text-muted-foreground")} />
            <span className="truncate">{t.title}</span>
          </button>
          {onDelete && (
            <button onClick={() => onDelete(t.id)} className="p-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive" aria-label="Delete conversation">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

const ROUTE_LABEL = { companyfabric: "CompanyFabric", openai: "OpenAI", custom: "custom endpoint" } as const

/** The header's status chips: DEMO, runtime, model, search, plus a starter's own. */
export function StatusChips({ caps, children }: { caps: BaseCapabilities; children?: ReactNode }) {
  const search = caps.search.providers.find((p) => p.id === caps.search.active)
  return (
    <>
      {caps.demo && <Badge variant="warning">DEMO: no model key</Badge>}
      {children}
      <Badge variant="outline">{caps.runtime === "hermes" ? "Hermes" : "Lite"}</Badge>
      <Badge variant="outline" title={`${caps.model.model} via ${ROUTE_LABEL[caps.model.route]}`}>
        {caps.model.model}
      </Badge>
      {search && <Badge variant="outline">Search: {search.label}</Badge>}
    </>
  )
}
