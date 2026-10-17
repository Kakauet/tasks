"use client"

import { useSubjectScope } from "@/context/subject-scope"
import { cn } from "@/lib/utils"

/**
 * Asignatura de una tarea o evento como chip de metadatos. Con una asignatura
 * ya filtrada sería ruido repetido, así que solo aparece al ver varias a la vez.
 */
export function SubjectChip({ item, className }: { item: { subjectId?: string }; className?: string }) {
  const { subjectOf, scope } = useSubjectScope()
  const subject = subjectOf(item)
  if (!subject || (scope !== "all" && scope !== "none")) return null

  return (
    <span
      data-subject-chip
      title={`Asignatura: ${subject.name}`}
      className={cn("inline-flex h-5 min-w-0 max-w-[9rem] items-center gap-1.5 rounded-md bg-muted/70 px-1.5 text-xs font-medium text-foreground", className)}
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
      <span className="truncate">{subject.name}</span>
    </span>
  )
}
