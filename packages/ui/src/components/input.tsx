// Adapted from shadcn/ui (MIT).
import type { ComponentProps } from "react"

import { cn } from "../lib/utils"

const field =
  "w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-50"

function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(field, "h-9", className)} {...props} />
}

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(field, "min-h-20 py-2", className)} {...props} />
}

export { Input, Textarea }
