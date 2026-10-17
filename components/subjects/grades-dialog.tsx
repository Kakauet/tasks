"use client"

import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formDialogStyles } from "@/components/ui/form-dialog-styles"
import { useTaskContext } from "@/context/task-context"
import { buildGradeReport, formatAverage, type GradeEntry } from "@/lib/tasks/subjects"
import { cn } from "@/lib/utils"

const entryValue = (entry: GradeEntry) =>
  entry.state === "graded" || entry.state === "text" ? entry.event.grade?.trim() : entry.state === "missing" ? "Sin nota" : "Próximo"

/** Notas de todas las asignaturas: discreto, para consultar y no para vigilar. */
export function GradesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { subjects, events } = useTaskContext()
  const report = useMemo(() => buildGradeReport(subjects, events), [subjects, events])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(formDialogStyles.content, "sm:max-w-[560px]")}>
        <div className={formDialogStyles.form}>
          <DialogHeader className={formDialogStyles.header}>
            <DialogTitle>Notas</DialogTitle>
            <DialogDescription>
              Eventos calificables por asignatura. Solo las notas numéricas, como 7,5 o 15/20, entran en las medias.
            </DialogDescription>
          </DialogHeader>
          <div className={formDialogStyles.body}>
            {report.groups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Todavía no hay eventos calificables. Un evento con «examen» en el título se marca como calificable al crearlo.
              </p>
            ) : (
              <>
                {report.average !== undefined && (
                  <div className="flex items-baseline justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">Media general</p>
                      <p className="text-xs text-muted-foreground">Media de las medias de cada asignatura.</p>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums">{formatAverage(report.average)}</p>
                  </div>
                )}
                {report.groups.map((group) => (
                  <section key={group.subject?.id ?? "none"} aria-label={group.subject?.name ?? "Sin asignatura"} className="overflow-hidden rounded-xl border border-border/70 bg-card">
                    <header className="flex items-center gap-2.5 border-b border-border/70 px-4 py-2.5">
                      {group.subject ? <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.subject.color }} /> : null}
                      <h3 className={cn("min-w-0 flex-1 truncate text-sm font-semibold", group.subject?.archived && "text-muted-foreground")}>
                        {group.subject?.name ?? "Sin asignatura"}{group.subject?.archived ? " · archivada" : ""}
                      </h3>
                      {group.average !== undefined && <span className="text-sm tabular-nums text-muted-foreground">Media <strong className="font-semibold text-foreground">{formatAverage(group.average)}</strong></span>}
                    </header>
                    <ul className="divide-y divide-border/60">
                      {group.entries.map((entry) => (
                        <li key={entry.event.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{entry.event.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{format(parseISO(entry.event.date), "d MMM yyyy", { locale: es })}</span>
                          <span className={cn("w-16 shrink-0 text-right tabular-nums", entry.state === "graded" || entry.state === "text" ? "font-medium" : "text-muted-foreground")}>{entryValue(entry)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            )}
          </div>
          <DialogFooter className={formDialogStyles.footer}>
            <Button type="button" variant="outline" className="sm:ml-auto" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
