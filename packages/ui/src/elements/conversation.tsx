"use client"

// Adapted from Vercel AI Elements (Apache-2.0, https://github.com/vercel/ai-elements):
// AI SDK types and the download button removed, Apple-style spacing.
import { ArrowDown } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"

import { Button } from "../components/button"
import { cn } from "../lib/utils"

export type ConversationProps = ComponentProps<typeof StickToBottom>

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom className={cn("relative flex-1 overflow-y-hidden", className)} initial="smooth" resize="smooth" role="log" {...props} />
)

export const ConversationContent = ({ className, ...props }: ComponentProps<typeof StickToBottom.Content>) => (
  <StickToBottom.Content className={cn("mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6", className)} {...props} />
)

export type ConversationEmptyStateProps = ComponentProps<"div"> & { title?: string; description?: ReactNode; icon?: ReactNode }

export const ConversationEmptyState = ({ className, title, description, icon, children, ...props }: ConversationEmptyStateProps) => (
  <div className={cn("flex flex-col items-center justify-center gap-4 py-16 text-center", className)} {...props}>
    {icon && <div className="flex size-14 items-center justify-center rounded-2xl bg-card text-brand shadow-soft">{icon}</div>}
    {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
    {description && <div className="max-w-md text-sm text-muted-foreground">{description}</div>}
    {children}
  </div>
)

export const ConversationScrollButton = ({ className, ...props }: ComponentProps<typeof Button>) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  if (isAtBottom) return null
  return (
    <Button
      className={cn("absolute bottom-4 left-1/2 -translate-x-1/2 shadow-float", className)}
      onClick={() => void scrollToBottom()}
      size="icon-sm"
      type="button"
      variant="outline"
      aria-label="Scroll to the latest message"
      {...props}
    >
      <ArrowDown />
    </Button>
  )
}
