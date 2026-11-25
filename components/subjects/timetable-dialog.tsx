"use client"

import { Coffee, Pencil, Plus, Trash2, X } from "lucide-react"
import { useRef, useState, type FormEvent } from "react"
import { v4 as uuid } from "uuid"
import { BreakLabel, lessonBackground, TimetableDay, timetableColors, TimeRange } from "@/components/subjects/timetable-day"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { formDialogStyles } from "@/components/ui/form-dialog-styles"
import { Input } from "@/components/ui/input"
import { useTaskContext } from "@/context/task-context"
import {
  DEFAULT_TIMETABLE,
  TIMETABLE_DAYS,
  TIMETABLE_LABEL_LIMIT,
  TIMETABLE_ROW_LIMIT,
  validateTimetable,
  type Timetable,
  type TimetableDraft,
  type TimetableRow,
} from "@/lib/tasks/timetable"
import { cn } from "@/lib/utils"

const SHORT_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"]
const WEEK_CELL = "border-b border-r border-border/65 px-2.5 text-left align-middle last:border-r-0 lg:px-4"
const DIALOG_GUTTER = "px-[var(--timetable-inset)]"
const GRID_CORNERS = "rounded-[var(--timetable-grid-radius)]"
// El radio exterior suma el margen y el borde de 1 px. Así las dos curvas tienen el mismo centro.
const DIALOG_CORNERS = "[--timetable-grid-radius:10px] [--timetable-inset:14px] sm:[--timetable-inset:16px] lg:[--timetable-inset:18px] rounded-[calc(var(--timetable-grid-radius)_+_var(--timetable-inset)_+_1px)]"
const EDITOR_COLUMNS = "sm:grid-cols-[6.75rem_6.75rem_minmax(0,1fr)_2.5rem]"

function DayButtons({ day, today, onDayChange }: { day: number; today: number; onDayChange: (day: number) => void }) {
  return (
    <div role="group" aria-label="Día de la semana" className="grid grid-cols-5 gap-1 rounded-xl bg-muted/65 p-1">
      {TIMETABLE_DAYS.map((label, index) => (
        <button
          key={label}
          type="button"
          aria-label={index === today ? `${label}, hoy` : label}
          aria-current={index === today ? "date" : undefined}
          aria-pressed={index === day}
          onClick={() => onDayChange(index)}
          className={cn(
            "flex h-10 items-center justify-center rounded-lg px-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            index === day ? "bg-popover font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:bg-popover/65 hover:text-foreground",
            index === today && index !== day && "text-primary",
          )}
        >
          <span className="sm:hidden">{SHORT_DAYS[index]}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}

function TimetableView({ data, day, today, onDayChange }: {
  data: TimetableDraft
  day: number
  today: number
  onDayChange: (day: number) => void
}) {
  const { subjects } = useTaskContext()
  const colors = timetableColors(subjects)

  if (!data.rows.length) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">El horario está vacío. Pulsa «Editar horario» para añadir clases.</p>

  return (
    <>
      <div className="flex min-h-0 flex-col gap-3 md:hidden">
        <div className="shrink-0">
          <DayButtons day={day} today={today} onDayChange={onDayChange} />
        </div>
        <TimetableDay rows={data.rows} day={day} colors={colors} className={GRID_CORNERS} />
      </div>
      <div className={cn("hidden min-h-0 flex-col overflow-hidden border border-border/75 md:flex", GRID_CORNERS)}>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <caption className="sr-only">Horario semanal de lunes a viernes</caption>
            <thead className="sticky top-0 z-10 bg-popover">
              <tr>
                <th scope="col" className={cn(WEEK_CELL, "w-[7.25rem] bg-muted/45 py-3 text-xs font-medium text-muted-foreground", today === 0 && "border-r-primary/40")}>Hora</th>
                {TIMETABLE_DAYS.map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    aria-current={index === today ? "date" : undefined}
                    className={cn(
                      WEEK_CELL, "bg-muted/45 py-3 text-sm font-semibold text-foreground",
                      index === today && "border-b-primary/55 border-r-primary/40 bg-accent",
                      index + 1 === today && "border-r-primary/40",
                    )}
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {label}
                      {index === today && <span className="text-[11px] font-medium text-muted-foreground">Hoy</span>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>*]:border-b-0">
              {data.rows.map((row) => (
                <tr key={row.id} className={row.kind === "break" ? "bg-muted/45" : undefined}>
                  <th scope="row" className={cn(WEEK_CELL, "bg-muted/25 font-normal", row.kind === "break" && "bg-transparent", today === 0 && row.kind !== "break" && "border-r-primary/40")}>
                    <TimeRange row={row} inline />
                  </th>
                  {row.kind === "break" ? (
                    <td colSpan={TIMETABLE_DAYS.length} className={cn(WEEK_CELL, "py-2.5")}><BreakLabel label={row.label} className="justify-center" /></td>
                  ) : row.lessons.map((label, index) => (
                    <td
                      key={TIMETABLE_DAYS[index]}
                      className={cn(
                        WEEK_CELL,
                        "py-3.5 text-[13px] font-medium leading-snug [overflow-wrap:anywhere] lg:py-4 lg:text-[15px]",
                        (index === today || index + 1 === today) && "border-r-primary/40",
                      )}
                      style={{ backgroundColor: lessonBackground(colors, label) }}
                    >
                      {label || (
                        <span className="text-muted-foreground/75">
                          <span aria-hidden="true">—</span><span className="sr-only">Sin clase</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export function TimetableDialog({ onClose, onRestoreFocus }: { onClose: () => void; onRestoreFocus: () => void }) {
  const { timetable, saveTimetable } = useTaskContext()
  const data = timetable ?? DEFAULT_TIMETABLE
  const [today] = useState(() => new Date().getDay() - 1)
  const [day, setDay] = useState(today >= 0 && today < TIMETABLE_DAYS.length ? today : 0)
  const [edit, setEdit] = useState<{ draft: TimetableDraft; original: Timetable | null | undefined } | null>(null)
  const [error, setError] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const changeDraft = (change: (draft: TimetableDraft) => TimetableDraft) => {
    setEdit((current) => current && { ...current, draft: change(current.draft) })
    setError("")
  }
  const changeRow = (id: string, change: (row: TimetableRow) => TimetableRow) =>
    changeDraft((draft) => ({ ...draft, rows: draft.rows.map((row) => row.id === id ? change(row) : row) }))

  const startEditing = () => {
    setEdit({ draft: data, original: timetable })
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    requestAnimationFrame(() => headingRef.current?.focus())
  }
  const finishEditing = () => {
    setEdit(null)
    setError("")
    requestAnimationFrame(() => editButtonRef.current?.focus())
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }
  const addRow = (kind: TimetableRow["kind"]) => {
    const id = uuid()
    const time = { id, start: "", end: "" }
    const row: TimetableRow = kind === "break"
      ? { ...time, kind, label: "Descanso" }
      : { ...time, kind, lessons: TIMETABLE_DAYS.map(() => "") }
    changeDraft((draft) => ({ ...draft, rows: [...draft.rows, row] }))
    requestAnimationFrame(() => document.getElementById(`timetable-start-${id}`)?.focus())
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!edit) return
    const problem = validateTimetable(edit.draft)
    if (problem) {
      setError(problem)
    } else if (saveTimetable(edit.draft, edit.original)) {
      finishEditing()
    } else {
      setError("El horario ha cambiado mientras lo editabas. Pulsa «Cancelar» para ver la versión actual.")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !edit && onClose()}>
      <DialogContent
        className={cn(formDialogStyles.content, "max-w-[58rem] gap-0", DIALOG_CORNERS)}
        hideCloseButton
        onOpenAutoFocus={(event) => { event.preventDefault(); headingRef.current?.focus() }}
        onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus() }}
        onEscapeKeyDown={(event) => { if (edit) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (edit) event.preventDefault() }}
      >
        <form className={cn(formDialogStyles.form, "max-h-[calc(92dvh_-_2px)]")} onSubmit={save} noValidate>
          <header className={cn("flex shrink-0 items-center justify-between gap-3 py-[var(--timetable-inset)]", DIALOG_GUTTER)}>
            <div className="min-w-0">
              <DialogTitle ref={headingRef} tabIndex={-1} className="text-[1.375rem] font-semibold leading-tight outline-none [overflow-wrap:anywhere] sm:text-[1.75rem]">
                {edit ? "Editar horario" : data.title}
              </DialogTitle>
              <DialogDescription className={edit ? "mt-1 text-sm" : "sr-only"}>
                {edit ? "Las horas y los descansos son comunes a todos los días." : "Horario semanal de clases"}
              </DialogDescription>
            </div>
            {!edit && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button ref={editButtonRef} type="button" variant="secondary" className="size-10 px-0 min-[380px]:w-auto min-[380px]:px-3.5" aria-label="Editar horario" title="Editar horario" onClick={startEditing}>
                  <Pencil aria-hidden="true" />
                  <span className="hidden min-[380px]:inline">Editar</span>
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
                  <X aria-hidden="true" />
                </Button>
              </div>
            )}
          </header>
          <div ref={bodyRef} className={cn(
            edit ? cn(formDialogStyles.body, "pt-0 sm:px-[var(--timetable-inset)] sm:pt-0") : "flex min-h-0 flex-col",
            DIALOG_GUTTER, "pb-[var(--timetable-inset)]",
          )}>
            {edit ? (
              <div className="w-full">
                <label className="mb-3 grid max-w-md gap-1.5 text-sm font-medium">
                  Nombre del horario
                  <Input value={edit.draft.title} maxLength={TIMETABLE_LABEL_LIMIT} onChange={(event) => changeDraft((draft) => ({ ...draft, title: event.target.value }))} />
                </label>
                <div className="sticky top-0 z-10 bg-popover pb-1">
                  <DayButtons day={day} today={today} onDayChange={setDay} />
                  {!!edit.draft.rows.length && (
                    <div aria-hidden="true" className={cn("hidden gap-2 pb-1.5 pt-3 text-xs font-medium text-muted-foreground sm:grid", EDITOR_COLUMNS)}>
                      <span>Inicio</span><span>Fin</span><span>Asignatura o descanso</span>
                    </div>
                  )}
                </div>
                <ul className="divide-y divide-border/60">
                  {edit.draft.rows.map((row, index) => (
                    <li key={row.id} className={cn("grid scroll-mt-16 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-end gap-x-2 gap-y-2.5 py-3 sm:scroll-mt-24 sm:py-2", EDITOR_COLUMNS)}>
                      {(["start", "end"] as const).map((field) => (
                        <label key={field} className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
                          <span className="sm:sr-only">{field === "start" ? "Inicio" : "Fin"}</span>
                          <Input
                            id={`timetable-${field}-${row.id}`}
                            aria-label={`${field === "start" ? "Inicio" : "Fin"} de la franja ${index + 1}`}
                            type="time"
                            value={row[field]}
                            className="min-w-0 scroll-mt-16 px-2 tabular-nums sm:scroll-mt-24"
                            onChange={(event) => changeRow(row.id, (current) => ({ ...current, [field]: event.target.value }))}
                          />
                        </label>
                      ))}
                      <label className="col-span-2 col-start-1 row-start-2 grid min-w-0 gap-1 text-xs font-medium text-muted-foreground sm:col-span-1 sm:col-start-3 sm:row-start-1">
                        <span className="sm:sr-only">{row.kind === "break" ? "Descanso" : "Asignatura"}</span>
                        <span className="relative">
                          {row.kind === "break" && <Coffee aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />}
                          <Input
                            aria-label={row.kind === "break" ? `Descanso de la franja ${index + 1}` : `${TIMETABLE_DAYS[day]}, franja ${index + 1}`}
                            value={row.kind === "break" ? row.label : row.lessons[day]}
                            placeholder={row.kind === "lesson" ? "Sin clase" : undefined}
                            className={cn("scroll-mt-16 sm:scroll-mt-24", row.kind === "break" && "bg-muted/40 pl-9")}
                            maxLength={TIMETABLE_LABEL_LIMIT}
                            onChange={(event) => changeRow(row.id, (current) => current.kind === "break"
                              ? { ...current, label: event.target.value }
                              : { ...current, lessons: current.lessons.map((label, index) => index === day ? event.target.value : label) })}
                          />
                        </span>
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="col-start-3 row-start-2 size-10 hover:text-[hsl(var(--status-danger))] sm:col-start-4 sm:row-start-1"
                        aria-label={`Quitar franja ${index + 1}`}
                        title="Quitar franja"
                        onClick={() => changeDraft((draft) => ({ ...draft, rows: draft.rows.filter((item) => item.id !== row.id) }))}
                      ><Trash2 /></Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
                  <Button type="button" variant="ghost" size="sm" disabled={edit.draft.rows.length >= TIMETABLE_ROW_LIMIT} onClick={() => addRow("lesson")}><Plus /> Añadir franja</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={edit.draft.rows.length >= TIMETABLE_ROW_LIMIT} onClick={() => addRow("break")}><Coffee /> Añadir descanso</Button>
                </div>
              </div>
            ) : <TimetableView data={data} day={day} today={today} onDayChange={setDay} />}
          </div>
          {edit && (
            <footer className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/75 py-3 sm:py-4", DIALOG_GUTTER)}>
              {error && <p role="alert" className="mr-auto w-full text-sm text-[hsl(var(--status-danger))] sm:w-auto sm:flex-1">{error}</p>}
              <Button type="button" variant="ghost" onClick={finishEditing}>Cancelar</Button>
              <Button type="submit" variant="primary">Guardar cambios</Button>
            </footer>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
