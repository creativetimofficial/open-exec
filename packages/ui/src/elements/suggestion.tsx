"use client"

// Adapted from Vercel AI Elements (Apache-2.0, https://github.com/vercel/ai-elements):
// a wrapping grid of cards instead of a horizontal scroller.
import type { ComponentProps, ReactNode } from "react"

import { cn } from "../lib/utils"

export const Suggestions = ({ className, ...props }: ComponentProps<"div">) => <div className={cn("grid w-full gap-2 sm:grid-cols-2", className)} {...props} />

export type SuggestionProps = Omit<ComponentProps<"button">, "onClick"> & { suggestion: string; label?: ReactNode; onClick?: (suggestion: string) => void }

export const Suggestion = ({ suggestion, label, onClick, className, children, ...props }: SuggestionProps) => (
  <button
    type="button"
    onClick={() => onClick?.(suggestion)}
    className={cn(
      "rounded-xl border bg-card px-4 py-3 text-left text-sm shadow-soft transition-all hover:-translate-y-px hover:shadow-float focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
      className
    )}
    {...props}
  >
    {label && <span className="mb-0.5 block text-xs font-medium text-muted-foreground">{label}</span>}
    {children ?? suggestion}
  </button>
)
