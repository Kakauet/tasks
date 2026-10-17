"use client"

import { CircleCheck, Clock, Pin } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { STATUS_LABEL, type SubjectStatus } from "@/lib/tasks/subjects"

const STATUS_COLOR: Record<SubjectStatus, string> = {
  pending: "text-[hsl(var(--status-caution))]",
  upToDate: "text-[hsl(var(--status-success))]",
}

const STATUS_TINT: Record<SubjectStatus, string> = {
  pending: "bg-[hsl(var(--status-caution)/0.14)]",
  upToDate: "bg-[hsl(var(--status-success)/0.12)]",
}

const STATUS_ICON = { pending: Clock, upToDate: CircleCheck } as const

/** El estado nunca se comunica solo con color: cada uno lleva su icono. */
export function StatusIcon({ status, className }: { status: SubjectStatus; className?: string }) {
  const Icon = STATUS_ICON[status]
  return <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", STATUS_COLOR[status], className)} />
}

/** `pinned`: el estado está fijado a mano en la asignatura y no se calcula. `children` va al final, como una flecha de menú. */
export function StatusBadge({ status, pinned, className, children }: { status: SubjectStatus; pinned?: boolean; className?: string; children?: ReactNode }) {
  return (
    <span
      title={pinned ? "Estado fijado a mano" : undefined}
      className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground transition-colors duration-200", STATUS_TINT[status], className)}
    >
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {STATUS_LABEL[status]}
      {pinned && (
        <>
          <Pin aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
          <span className="sr-only">, fijado a mano</span>
        </>
      )}
      {children}
    </span>
  )
}
