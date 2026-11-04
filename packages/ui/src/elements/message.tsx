// Adapted from Vercel AI Elements (Apache-2.0, https://github.com/vercel/ai-elements):
// AI SDK types, branches and Streamdown removed (the starters render markdown
// with citations themselves), Apple-style bubbles.
import type { ComponentProps, HTMLAttributes, ReactNode } from "react"

import { cn } from "../lib/utils"

export type MessageProps = HTMLAttributes<HTMLDivElement> & { from: "user" | "assistant" }

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div className={cn("group flex w-full flex-col gap-2", from === "user" ? "is-user ml-auto max-w-xl items-end" : "is-assistant", className)} {...props} />
)

export const MessageContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex w-fit max-w-full min-w-0 flex-col gap-3 text-sm leading-relaxed",
      "group-[.is-user]:rounded-2xl group-[.is-user]:rounded-br-md group-[.is-user]:bg-brand group-[.is-user]:px-4 group-[.is-user]:py-2.5 group-[.is-user]:text-white",
      "group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  />
)

/** Who answered: a monogram and a name, above an assistant message. */
export const MessageAuthor = ({ name, detail, className, ...props }: ComponentProps<"div"> & { name: string; detail?: ReactNode }) => (
  <div className={cn("flex items-center gap-2 text-xs", className)} {...props}>
    <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-b from-brand/80 to-brand text-xs font-semibold text-white">{name.slice(0, 1)}</span>
    <span className="font-semibold">{name}</span>
    {detail && <span className="text-muted-foreground">{detail}</span>}
  </div>
)

export const MessageActions = ({ className, ...props }: ComponentProps<"div">) => <div className={cn("flex items-center gap-1", className)} {...props} />
