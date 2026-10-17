"use client"

import { Check, ChevronDown, Wand2 } from "lucide-react"
import { useState } from "react"
import { StatusBadge, StatusIcon } from "@/components/subjects/subject-status"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTaskContext, type Subject } from "@/context/task-context"
import { useSubjectScope } from "@/context/subject-scope"
import { STATUS_LABEL, type SubjectStatus, type SubjectSummary } from "@/lib/tasks/subjects"
import { cn } from "@/lib/utils"

const OPTION = "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"

/**
 * La insignia de estado es también el botón para cambiarlo, como los puntos de prioridad de una
 * tarea: un toque y se elige, sin pasar por el diálogo de asignaturas.
 */
export function StatusMenu({ subject, summary }: { subject: Subject; summary: SubjectSummary }) {
  const { updateSubject } = useTaskContext()
  const { threshold } = useSubjectScope()
  const [open, setOpen] = useState(false)
  const automatic = threshold !== "manual"

  const choose = (manual: SubjectStatus | undefined) => {
    updateSubject(subject.id, { manual })
    setOpen(false)
  }

  const option = (value: SubjectStatus) => {
    const selected = automatic ? summary.manual === value : summary.status === value
    return (
      <button key={value} type="button" aria-pressed={selected} className={cn(OPTION, selected && "bg-muted font-semibold")} onClick={() => choose(value)}>
        <StatusIcon status={value} />
        <span className="min-w-0 flex-1">{automatic ? `Siempre ${STATUS_LABEL[value].toLowerCase()}` : STATUS_LABEL[value]}</span>
        {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
      </button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Estado de ${subject.name}: ${STATUS_LABEL[summary.status].toLowerCase()}${summary.pinned ? ", fijado a mano" : ""}. Cambiar estado`}
          title="Cambiar estado"
          className="group/status flex shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatusBadge status={summary.status} pinned={summary.pinned} className="pr-1.5 group-hover/status:brightness-110">
            <ChevronDown aria-hidden="true" className={cn("-ml-0.5 h-3 w-3 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
          </StatusBadge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 rounded-lg p-1" aria-label={`Estado de ${subject.name}`}>
        {automatic && summary.computed && (
          <button type="button" aria-pressed={!summary.manual} className={cn(OPTION, !summary.manual && "bg-muted font-semibold")} onClick={() => choose(undefined)}>
            <Wand2 aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              Automático
              <span className="block text-xs font-normal text-muted-foreground">Ahora: {STATUS_LABEL[summary.computed].toLowerCase()}</span>
            </span>
            {!summary.manual && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
          </button>
        )}
        {option("upToDate")}
        {option("pending")}
      </PopoverContent>
    </Popover>
  )
}
