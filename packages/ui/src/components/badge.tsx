// Adapted from shadcn/ui (MIT).
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "../lib/utils"

const badgeVariants = cva("inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      secondary: "bg-secondary text-secondary-foreground",
      outline: "border text-muted-foreground",
      brand: "bg-brand/12 text-brand",
      warning: "bg-warning/15 text-warning",
      success: "bg-success/15 text-success",
      destructive: "bg-destructive/12 text-destructive",
    },
  },
  defaultVariants: { variant: "secondary" },
})

function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
