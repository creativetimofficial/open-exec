"use client"

// Adapted from Vercel AI Elements' Confirmation (Apache-2.0,
// https://github.com/vercel/ai-elements): driven by the broker's approval
// rows instead of AI SDK tool-part states. The body shows exactly what will
// happen if approved; the decision is made on the server (first one wins).
import { Check, ShieldCheck, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "../components/button"
import { cn } from "../lib/utils"

export interface ConfirmationProps {
  title: ReactNode
  children?: ReactNode
  expiresAt?: string
  onApprove: () => void
  onDeny: () => void
  approveLabel?: string
  className?: string
}

export function Confirmation({ title, children, expiresAt, onApprove, onDeny, approveLabel = "Approve", className }: ConfirmationProps) {
  return (
    <div role="alertdialog" aria-label={typeof title === "string" ? title : "Approval needed"} className={cn("overflow-hidden rounded-2xl border border-warning/40 bg-card shadow-float", className)}>
      <div className="flex items-center gap-2 border-b bg-warning/10 px-4 py-2.5 text-sm font-medium">
        <ShieldCheck className="size-4 text-warning" />
        <span className="flex-1">{title}</span>
        {expiresAt && <span className="text-xs font-normal text-muted-foreground">Expires {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      {children && <div className="px-4 py-3 text-sm">{children}</div>}
      <div className="flex justify-end gap-2 px-4 pb-4">
        <Button variant="outline" size="sm" onClick={onDeny}>
          <X /> Deny
        </Button>
        <Button variant="brand" size="sm" onClick={onApprove}>
          <Check /> {approveLabel}
        </Button>
      </div>
    </div>
  )
}

/** A labelled field inside a confirmation: "To", "Subject", … */
export function ConfirmationField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b py-1.5 text-sm last:border-b-0">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  )
}
