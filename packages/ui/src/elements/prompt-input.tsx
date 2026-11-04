"use client"

// Adapted from Vercel AI Elements' PromptInput (Apache-2.0,
// https://github.com/vercel/ai-elements): the text box, footer and submit
// button only (no attachments or model menus). Enter sends, Shift+Enter
// adds a line.
import { ArrowUp, Square } from "lucide-react"
import type { ComponentProps, FormEvent, ReactNode } from "react"

import { Button } from "../components/button"
import { cn } from "../lib/utils"

export interface PromptInputProps extends Omit<ComponentProps<"form">, "onSubmit"> {
  onSubmit: () => void
}

export const PromptInput = ({ className, onSubmit, children, ...props }: PromptInputProps) => (
  <form
    className={cn("w-full rounded-2xl border bg-card shadow-float transition-shadow focus-within:border-brand/50 focus-within:ring-4 focus-within:ring-ring/15", className)}
    onSubmit={(e: FormEvent) => {
      e.preventDefault()
      onSubmit()
    }}
    {...props}
  >
    {children}
  </form>
)

export function PromptInputTextarea({ className, onSubmit, ...props }: ComponentProps<"textarea"> & { onSubmit?: () => void }) {
  return (
    <textarea
      rows={1}
      className={cn("field-sizing-content block max-h-48 min-h-14 w-full resize-none bg-transparent px-4 pt-3.5 text-sm outline-none placeholder:text-muted-foreground", className)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onSubmit?.()
        }
      }}
      {...props}
    />
  )
}

export const PromptInputFooter = ({ className, ...props }: ComponentProps<"div">) => <div className={cn("flex items-center justify-between gap-2 px-2.5 pb-2.5", className)} {...props} />

export const PromptInputTools = ({ className, ...props }: ComponentProps<"div">) => <div className={cn("flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)} {...props} />

export function PromptInputSubmit({ running, disabled, onStop, label = "Send" }: { running: boolean; disabled?: boolean; onStop: () => void; label?: ReactNode }) {
  return running ? (
    <Button type="button" size="icon-sm" onClick={onStop} aria-label="Stop">
      <Square className="size-3 fill-current" />
    </Button>
  ) : (
    <Button type="submit" size="icon-sm" variant="brand" disabled={disabled} aria-label={typeof label === "string" ? label : "Send"}>
      <ArrowUp />
    </Button>
  )
}
