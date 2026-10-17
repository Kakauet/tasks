"use client"

import { AlertCircle, CalendarClock, ChevronDown, GraduationCap, Hourglass, Inbox, Layers, ListTodo, Pencil, Settings2, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { StatusIcon } from "@/components/subjects/subject-status"
import { StatusMenu } from "@/components/subjects/status-menu"
import { SubjectNav } from "@/components/subjects/subject-sidebar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSubjectScope } from "@/context/subject-scope"
import type { Subject } from "@/context/task-context"
import { formatAverage, formatDaysAway, type SubjectSummary } from "@/lib/tasks/subjects"
import { cn } from "@/lib/utils"

interface Fact {
  key: string
  icon: LucideIcon
  text: string
  /** Detalle secundario que nunca se recorta, como «en 9 días». */
  detail?: string
  tone?: "danger"
  /** Puede recortarse con puntos suspensivos si falta sitio. */
  flexible?: boolean
  /** Dato secundario: solo con mucho espacio en la fila de escritorio. */
  minor?: boolean
}

/** Datos de la asignatura en orden de importancia. */
function subjectFacts(summary: SubjectSummary): Fact[] {
  const facts: Fact[] = []
  if (summary.blocking > 0) facts.push({ key: "blocking", icon: ListTodo, text: `${summary.blocking} ${summary.blocking === 1 ? "tarea pendiente" : "tareas pendientes"}` })
  else if (summary.pending === 0) facts.push({ key: "clear", icon: ListTodo, text: "Sin tareas pendientes" })
  if (summary.overdue > 0) facts.push({ key: "overdue", icon: AlertCircle, text: `${summary.overdue} ${summary.overdue === 1 ? "vencida" : "vencidas"}`, tone: "danger" })
  if (summary.next) facts.push({ key: "next", icon: CalendarClock, text: summary.next.title, detail: formatDaysAway(summary.next.daysAway), flexible: true })
  if (summary.relaxed > 0) facts.push({ key: "relaxed", icon: Hourglass, text: `${summary.relaxed} sin prisa`, minor: summary.blocking > 0 })
  if (summary.averageGrade !== undefined) facts.push({ key: "grade", icon: GraduationCap, text: `Media ${formatAverage(summary.averageGrade)}` })
  return facts
}

function FactContent({ fact }: { fact: Fact }) {
  const Icon = fact.icon
  return (
    <>
      <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", fact.tone === "danger" && "text-[hsl(var(--status-danger))]")} />
      {fact.key === "next" && <span className="sr-only">Próximo: </span>}
      <span className={cn(fact.flexible ? "min-w-0 truncate" : "whitespace-nowrap", fact.key === "next" && "text-foreground/85")}>{fact.text}</span>
      {fact.detail && <span className="shrink-0 whitespace-nowrap">· {fact.detail}</span>}
    </>
  )
}

function SubjectHeading({ subject, summary }: { subject: Subject; summary: SubjectSummary }) {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2.5">
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
      <h2 className="min-w-0 max-w-[14rem] truncate text-sm font-semibold">{subject.name}</h2>
      <StatusMenu subject={subject} summary={summary} />
    </div>
  )
}

/**
 * Fila de la asignatura filtrada, con la misma altura que la barra de búsqueda. En móvil no
 * aparece: el mismo resumen vive dentro del selector de la cabecera para no gastar filas.
 */
function SubjectSummaryStrip() {
  const { selectedSubject, summaries, openManager } = useSubjectScope()
  const summary = selectedSubject ? summaries.get(selectedSubject.id) : undefined
  if (!selectedSubject || !summary) return null
  const facts = subjectFacts(summary)

  return (
    <section
      aria-label={`Resumen de ${selectedSubject.name}`}
      data-subject-summary
      className="hidden shrink-0 items-center gap-4 rounded-2xl border border-border/70 bg-card/70 p-2 pl-4 shadow-sm md:flex"
    >
      <SubjectHeading subject={selectedSubject} summary={summary} />
      {facts.length > 0 && (
        <ul className="flex h-9 min-w-0 flex-1 items-center gap-x-4 overflow-hidden border-l border-border/70 pl-4 text-sm text-muted-foreground">
          {facts.map((fact) => (
            <li key={fact.key} className={cn("flex items-center gap-1.5", fact.flexible ? "min-w-0" : "shrink-0", fact.minor && "hidden 2xl:flex")}>
              <FactContent fact={fact} />
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="ghost" size="icon" className="ml-auto h-9 w-9 shrink-0 sm:h-9 sm:w-9" aria-label={`Editar ${selectedSubject.name}`} title="Editar asignatura" onClick={() => openManager(selectedSubject.id)}>
        <Pencil />
      </Button>
    </section>
  )
}

/** Resumen apilado dentro del selector móvil. */
function PopoverSummary({ subject, summary, onEdit }: { subject: Subject; summary: SubjectSummary; onEdit: () => void }) {
  const facts = subjectFacts(summary)
  return (
    <div className="mb-2 rounded-lg bg-muted/45 p-3">
      <div className="flex items-center justify-between gap-2">
        <SubjectHeading subject={subject} summary={summary} />
        <Button type="button" variant="ghost" size="icon" className="-my-1 -mr-1 h-8 w-8 shrink-0 sm:h-8 sm:w-8" aria-label={`Editar ${subject.name}`} onClick={onEdit}>
          <Pencil />
        </Button>
      </div>
      {facts.length > 0 && (
        <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
          {facts.map((fact) => (
            <li key={fact.key} className="flex min-w-0 items-center gap-2">
              <FactContent fact={fact} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Selector de asignatura para pantallas sin barra lateral. Va en la cabecera, junto a las vistas,
 * así que no añade ninguna fila: el detalle de la asignatura se abre al tocarlo.
 */
export function SubjectHeaderPicker() {
  const { enabled, scope, selectedSubject, summaries, openManager, openGrades } = useSubjectScope()
  const [open, setOpen] = useState(false)
  if (!enabled) return null

  const summary = selectedSubject ? summaries.get(selectedSubject.id) : undefined
  const label = selectedSubject?.name ?? (scope === "none" ? "Sin asignatura" : "Todas")
  const close = (then: () => void) => () => {
    setOpen(false)
    then()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Asignatura: ${selectedSubject?.name ?? (scope === "none" ? "sin asignatura" : "todas")}${summary ? `, ${summary.status === "upToDate" ? "al día" : "pendiente"}` : ""}`}
          className="flex min-w-0 max-w-[8.5rem] flex-initial items-center gap-1.5 self-stretch rounded-xl border border-border/60 bg-muted/70 px-2.5 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:max-w-[13rem] lg:hidden"
        >
          {selectedSubject ? (
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selectedSubject.color }} />
          ) : scope === "none" ? (
            <Inbox aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <Layers aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">{label}</span>
          {summary && <StatusIcon status={summary.status} className="h-3.5 w-3.5" />}
          <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="max-h-[70dvh] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl p-2">
        {selectedSubject && summary && <PopoverSummary subject={selectedSubject} summary={summary} onEdit={close(() => openManager(selectedSubject.id))} />}
        <SubjectNav onNavigate={() => setOpen(false)} />
        <div className="mt-1 grid grid-cols-2 gap-1 border-t border-border/70 pt-1">
          <Button type="button" variant="ghost" size="sm" className="justify-start px-2.5" onClick={close(openGrades)}>
            <GraduationCap /> Notas
          </Button>
          <Button type="button" variant="ghost" size="sm" className="justify-start px-2.5" onClick={close(() => openManager())}>
            <Settings2 /> Gestionar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Se coloca al inicio del tablero y del calendario; no pinta nada con las asignaturas apagadas. */
export function SubjectScopeBar() {
  const { enabled } = useSubjectScope()
  return enabled ? <SubjectSummaryStrip /> : null
}
