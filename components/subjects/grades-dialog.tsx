"use client"

import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { Pencil, Plus } from "lucide-react"
import { useId, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react"
import { v4 as uuidv4 } from "uuid"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formDialogStyles } from "@/components/ui/form-dialog-styles"
import { Input } from "@/components/ui/input"
import { useTaskContext } from "@/context/task-context"
import { buildGradeReport, formatAverage, GRADE_PENDING_LABEL, parseBonusPoints, parseGrade, type GradeGroup } from "@/lib/tasks/subjects"
import type { OtherGrade } from "@/lib/tasks/types"
import { cn } from "@/lib/utils"

const showGrade = (value?: number) => value === undefined ? "—" : formatAverage(value)

type Editing = { kind: "event" | "other"; id: string } | { kind: "new" | "final" }

function GradeEditor({ label, grade, weight, bonus, title, final, onSave, onCancel, onDelete }: {
  label: string
  grade?: string
  weight?: number
  bonus?: boolean
  title?: string
  final?: boolean
  onSave: (fields: Omit<OtherGrade, "id">) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(title ?? "")
  const [value, setValue] = useState(grade ?? "")
  const [percentage, setPercentage] = useState(weight?.toLocaleString("es", { maximumFractionDigits: 20 }) ?? "")
  const [isBonus, setIsBonus] = useState(bonus === true)
  const [error, setError] = useState("")
  const bonusId = useId()

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const enteredGrade = value.trim()
    const enteredWeight = percentage.trim()
    const parsedWeight = !isBonus && enteredWeight ? Number(enteredWeight.replace(",", ".")) : undefined
    setError("")
    if (title !== undefined && !name.trim()) return setError("Escribe un nombre para la nota.")
    if (final && enteredGrade && !/^(?:[0-9]|10)$/.test(enteredGrade)) return setError("Escribe un número entero del 0 al 10.")
    if (isBonus && enteredGrade && parseBonusPoints(enteredGrade) === null) return setError("Escribe los puntos extra como un número entre 0 y 10.")
    if (parsedWeight !== undefined && (!/^\d+(?:[.,]\d+)?$/.test(enteredWeight) || parsedWeight > 100)) {
      return setError("Escribe un porcentaje entre 0 y 100.")
    }
    onSave({ title: name.trim(), grade: enteredGrade || undefined, weight: parsedWeight, bonus: isBonus || undefined })
  }

  return (
    <form aria-label={label} className="grid gap-2 bg-muted/25 px-4 py-3" onSubmit={save}>
      {title !== undefined && (
        <label className="grid gap-1 text-xs font-medium">
          Nombre
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Trabajo, participación…" />
        </label>
      )}
      <div className={cn("grid gap-2", !final && !isBonus && "grid-cols-2")}>
        <label className="grid min-w-0 gap-1 text-xs font-medium">
          {final ? "Nota final manual" : isBonus ? "Puntos extra" : "Nota"}
          <Input autoFocus={title === undefined} inputMode={final ? "numeric" : isBonus ? "decimal" : undefined}
            value={value} onChange={(e) => setValue(e.target.value)} placeholder={final ? "Automática" : isBonus ? "0,5" : "7,5 o 15/20"} />
        </label>
        {!final && !isBonus && (
          <label className="grid min-w-0 gap-1 text-xs font-medium">
            Peso (%)
            <Input inputMode="decimal" value={percentage} onChange={(e) => setPercentage(e.target.value)} placeholder="Automático" />
          </label>
        )}
      </div>
      {!final && (
        <div className="flex min-h-8 items-center gap-2 text-xs font-medium">
          <Checkbox id={bonusId} checked={isBonus} onCheckedChange={(checked) => { setIsBonus(checked === true); setError("") }} />
          <label htmlFor={bonusId} className="cursor-pointer">Sumar puntos a la media</label>
        </div>
      )}
      {final && <p className="text-xs text-muted-foreground">Deja el campo vacío para usar el redondeo automático.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onDelete && <Button type="button" variant="ghost" size="sm" className="mr-auto text-destructive" onClick={onDelete}>Eliminar</Button>}
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" size="sm">Guardar</Button>
      </div>
    </form>
  )
}

function GradeRow({ title, detail, value, weight, pending, onEdit }: {
  title: string
  detail?: string
  value: string
  weight?: number
  pending?: boolean
  onEdit: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-4 py-1.5 text-sm sm:gap-3">
      <div className="min-w-0 flex-1 py-1">
        <p className="break-words">{title}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      {weight !== undefined && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatAverage(weight)} %</span>}
      <span className={cn("max-w-[30%] break-words text-right font-medium tabular-nums", pending && "text-xs text-[hsl(var(--status-caution))]")}>{value}</span>
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" aria-label={`Editar nota de ${title}`} onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function GradeCard({ group }: { group: GradeGroup }) {
  const { updateEvent, updateSubject } = useTaskContext()
  const [editing, setEditing] = useState<Editing>()
  const editButton = useRef<HTMLButtonElement | null>(null)
  const addButton = useRef<HTMLButtonElement | null>(null)
  const { subject, entries, average, finalGrade, evaluatedWeight, sharedWeight, automaticWeight, provisional, excessWeight } = group
  const otherGrades = subject?.otherGrades ?? []
  const name = subject?.name ?? "Sin asignatura"
  const openEditor = (event: MouseEvent<HTMLButtonElement>, editor: Editing) => {
    editButton.current = event.currentTarget
    setEditing(editor)
  }
  const closeEditor = () => {
    setEditing(undefined)
    const button = editButton.current
    requestAnimationFrame(() => (button?.isConnected ? button : addButton.current)?.focus())
  }
  const saveOtherGrade = (id: string | undefined, fields: Omit<OtherGrade, "id">) => {
    if (!subject) return
    const next = id
      ? otherGrades.map((grade) => grade.id === id ? { id, ...fields } : grade)
      : [...otherGrades, { id: uuidv4(), ...fields }]
    updateSubject(subject.id, { otherGrades: next })
    closeEditor()
  }

  return (
    <section aria-label={name} className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <header className="flex items-center gap-2.5 border-b border-border/70 px-4 py-2.5">
        {subject && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />}
        <h3 className={cn("min-w-0 flex-1 break-words text-sm font-semibold", subject?.archived && "text-muted-foreground")}>
          {name}{subject?.archived ? " · archivada" : ""}
        </h3>
      </header>
      <dl className="grid grid-cols-2 gap-2 border-b border-border/70 px-4 py-2.5 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Media calculada</dt>
          <dd className="font-semibold tabular-nums">{showGrade(average)}</dd>
          {average !== undefined && provisional && <dd className="text-xs text-muted-foreground">Provisional</dd>}
        </div>
        {subject && (
          <div className="relative pr-10">
            <dt className="text-xs text-muted-foreground">
              Nota final
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-9 w-9 text-muted-foreground" aria-label={`Editar nota final de ${name}`} onClick={(event) => openEditor(event, { kind: "final" })}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </dt>
            <dd className="font-semibold tabular-nums">{showGrade(finalGrade)}</dd>
            {subject.finalGrade !== undefined && <dd className="text-xs text-muted-foreground">Manual</dd>}
          </div>
        )}
      </dl>
      {editing?.kind === "final" && subject && (
        <GradeEditor key="final" label={`Nota final de ${name}`} final grade={subject.finalGrade?.toString()} onCancel={closeEditor} onSave={({ grade }) => {
          updateSubject(subject.id, { finalGrade: grade === undefined ? undefined : Number(grade) })
          closeEditor()
        }} />
      )}
      {evaluatedWeight !== undefined && (
        <div className="border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
          <p>{formatAverage(evaluatedWeight)} % evaluado</p>
          {excessWeight ? <p className="text-destructive">Los pesos asignados superan el 100 %.</p>
            : sharedWeight !== undefined && <p>Las notas numéricas sin peso asignado se reparten el {formatAverage(sharedWeight)} % restante.</p>}
        </div>
      )}
      <ul className="divide-y divide-border/60">
        {entries.map(({ event, state, value }) => (
          <li key={`event-${event.id}`}>
            <GradeRow title={event.title} detail={format(parseISO(event.date), "d MMM yyyy", { locale: es })}
              weight={event.gradeBonus ? undefined : event.gradeWeight ?? (state === "graded" ? automaticWeight : undefined)}
              value={event.gradeBonus && value !== null ? `+${formatAverage(value)}` : event.grade?.trim() || (state === "upcoming" ? "Próximo" : GRADE_PENDING_LABEL)}
              pending={state === "missing"}
              onEdit={(click) => openEditor(click, { kind: "event", id: event.id })} />
            {editing?.kind === "event" && editing.id === event.id && (
              <GradeEditor label={`Nota de ${event.title}`} grade={event.grade} weight={event.gradeWeight} bonus={event.gradeBonus} onCancel={closeEditor} onSave={({ grade, weight, bonus }) => {
                updateEvent(event.id, { grade, gradeWeight: weight, gradeBonus: bonus })
                closeEditor()
              }} />
            )}
          </li>
        ))}
        {subject && otherGrades.map((grade) => {
          const extra = grade.bonus ? parseBonusPoints(grade.grade) : null
          return (
            <li key={`other-${grade.id}`}>
              <GradeRow title={grade.title} detail={grade.bonus ? "Puntos extra" : undefined}
                weight={grade.bonus ? undefined : grade.weight ?? (parseGrade(grade.grade) !== null ? automaticWeight : undefined)}
                value={extra === null ? grade.grade?.trim() || "Sin nota" : `+${formatAverage(extra)}`}
                onEdit={(event) => openEditor(event, { kind: "other", id: grade.id })} />
              {editing?.kind === "other" && editing.id === grade.id && (
                <GradeEditor label={`Nota de ${grade.title}`} title={grade.title} grade={grade.grade} weight={grade.weight} bonus={grade.bonus} onCancel={closeEditor}
                  onSave={(fields) => saveOtherGrade(grade.id, fields)} onDelete={() => {
                    updateSubject(subject.id, { otherGrades: otherGrades.filter((item) => item.id !== grade.id) })
                    closeEditor()
                  }} />
              )}
            </li>
          )
        })}
      </ul>
      {editing?.kind === "new" ? (
        <GradeEditor key="new" label={`Añadir nota en ${name}`} title="" onCancel={closeEditor} onSave={(fields) => saveOtherGrade(undefined, fields)} />
      ) : subject && (
        <div className={cn("px-2 py-1", (entries.length > 0 || otherGrades.length > 0) && "border-t border-border/70")}>
          <Button ref={addButton} type="button" variant="ghost" size="sm" onClick={(event) => openEditor(event, { kind: "new" })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Añadir nota
          </Button>
        </div>
      )}
    </section>
  )
}

export function GradesDialog({ open, onOpenChange, today }: { open: boolean; onOpenChange: (open: boolean) => void; today: string }) {
  const { subjects, events } = useTaskContext()
  const report = useMemo(() => buildGradeReport(subjects, events, today), [subjects, events, today])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(formDialogStyles.content, "sm:max-w-[560px]")}>
        <div className={formDialogStyles.form}>
          <DialogHeader className={formDialogStyles.header}>
            <DialogTitle>Notas</DialogTitle>
            <DialogDescription>
              Añade notas y pesos por asignatura. La nota final automática sube al entero siguiente a partir de x,8.
            </DialogDescription>
          </DialogHeader>
          <div className={formDialogStyles.body}>
            {report.groups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Crea una asignatura o añade un evento calificable para registrar tus notas.
              </p>
            ) : (
              <>
                <section aria-label="Media del curso" className="rounded-xl bg-muted/40 px-4 py-3">
                  <h3 className="text-sm font-medium">Media del curso</h3>
                  <p className="text-xs text-muted-foreground">Cada asignatura activa con nota pesa lo mismo.{report.average !== undefined && report.provisional ? " Media provisional." : ""}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Sin redondear</dt>
                      <dd className="text-2xl font-semibold tabular-nums">{showGrade(report.average)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Con notas finales</dt>
                      <dd className="text-2xl font-semibold tabular-nums">{showGrade(report.finalAverage)}</dd>
                    </div>
                  </dl>
                  {report.usesManualFallback && <p className="mt-2 text-xs text-muted-foreground">Si una asignatura solo tiene nota manual, se usa en ambas medias.</p>}
                </section>
                {report.groups.map((group) => <GradeCard key={group.subject ? `subject-${group.subject.id}` : "unassigned"} group={group} />)}
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
