// Adapted from Vercel AI Elements (Apache-2.0, https://github.com/vercel/ai-elements):
// CSS (text-shimmer + animate-shimmer in styles.css) instead of motion.
import type { ElementType } from "react"

import { cn } from "../lib/utils"

export function Shimmer({ children, as: Component = "p", className }: { children: string; as?: ElementType; className?: string }) {
  return (
    <Component
      className={cn("inline-block animate-shimmer text-sm text-shimmer", className)}
    >
      {children}
    </Component>
  )
}
