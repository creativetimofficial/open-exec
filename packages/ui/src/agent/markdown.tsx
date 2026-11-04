"use client"

import { linkCitations } from "@agent-starters/kit/citations"
import type { Source } from "@agent-starters/kit/events"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "../lib/utils"

/** An answer in markdown, with [n] citations linked to the numbered sources. */
export function Markdown({ text, sources = [], className }: { text: string; sources?: Source[]; className?: string }) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("#source-") ? (
              <a href={href} className="mx-0.5 inline-flex min-w-5 items-center justify-center rounded-md bg-brand/12 px-1 align-baseline text-xs font-semibold text-brand no-underline">
                {children}
              </a>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener" className="text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand">
                {children}
              </a>
            ),
          h1: ({ children }) => <h2 className="mt-5 text-lg font-semibold tracking-tight">{children}</h2>,
          h2: ({ children }) => <h3 className="mt-5 text-base font-semibold tracking-tight">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-4 font-semibold">{children}</h4>,
          ul: ({ children }) => <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-brand/40 pl-3 text-muted-foreground">{children}</blockquote>,
          code: ({ children }) => <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>,
          pre: ({ children }) => <pre className="overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs">{children}</pre>,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b bg-muted/60 px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b px-3 py-2 last:border-b-0">{children}</td>,
          hr: () => <hr className="my-4 border-border" />,
        }}
      >
        {linkCitations(text, sources)}
      </ReactMarkdown>
    </div>
  )
}
