"use client"

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ColorPicker } from "@/components/color-picker"
import { AliasInput } from "@/components/subjects/alias-input"
import { Button } from "@/components/ui/button"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formDialogStyles } from "@/components/ui/form-dialog-styles"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTaskContext, type Subject } from "@/context/task-context"
import { describeDetection, nextSubjectColor, THRESHOLDS, THRESHOLD_LABEL, type PendingThreshold } from "@/lib/tasks/subjects"
import { cn } from "@/lib/utils"

interface SubjectsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Asignatura que se abre ya en edición. */
  editId?: string
  threshold: PendingThreshold
  onThresholdChange: (threshold: PendingThreshold) => void
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function SubjectsDialog({ open, onOpenChange, editId, threshold, onThresholdChange }: SubjectsDialogProps) {
  const { subjects, tasks, events, addSubject, updateSubject, deleteSubject, moveSubject, undo } = useTaskContext()
  const [name, setName] = useState("")
  const [color, setColor] = useState(() => nextSubjectColor(subjects))
  const [customColors, setCustomColors] = useState<string[]>([])
  const [editing, setEditing] = useState<Subject | null>(null)
  const [toDelete, setToDelete] = useState<Subject | null>(null)

  useEffect(() => {
    if (!open) return
    try {
      const saved = localStorage.getItem("custom-event-colors")
      setCustomColors(saved ? JSON.parse(saved) : [])
    } catch {
      setCustomColors([])
    }
  }, [open])

  useEffect(() => {
    if (open) setEditing(editId ? subjects.find((subject) => subject.id === editId) ?? null : null)
    // Solo al abrir: las ediciones posteriores no deben sobrescribir lo que se está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId])

  const active = useMemo(() => subjects.filter((subject) => !subject.archived), [subjects])
  const archived = useMemo(() => subjects.filter((subject) => subject.archived), [subjects])
  const usage = (id: string) => ({
    tasks: tasks.filter((task) => task.subjectId === id).length,
    events: events.filter((event) => event.subjectId === id).length,
  })

  /** Lo asignado por el título se avisa siempre, con la opción de deshacerlo. */
  const announceDetection = (subjectName: string, detected: { tasks: number; events: number }) => {
    if (!detected.tasks && !detected.events) return
    toast.success(`${describeDetection(detected)} ${detected.tasks + detected.events === 1 ? "pasa" : "pasan"} a «${subjectName}» por su título.`, {
      action: { label: "Deshacer", onClick: undo },
      duration: 8000,
    })
  }

  const handleAdd = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const added = addSubject({ name: trimmed, color })
    if (added) announceDetection(trimmed, added)
    setName("")
    setColor(nextSubjectColor([...subjects, { id: "", name: trimmed, color }]))
  }

  const saveEditing = () => {
    if (!editing || !editing.name.trim()) return
    announceDetection(editing.name.trim(), updateSubject(editing.id, { name: editing.name, color: editing.color, aliases: editing.aliases }))
    setEditing(null)
  }

  /** Mover dentro del grupo visible: se salta lo archivado que haya en medio. */
  const move = (subject: Subject, direction: -1 | 1) => {
    const group = subject.archived ? archived : active
    const neighbour = group[group.findIndex((item) => item.id === subject.id) + direction]
    if (neighbour) moveSubject(subject.id, subjects.findIndex((item) => item.id === neighbour.id))
  }

  const confirmDelete = () => {
    if (!toDelete) return
    deleteSubject(toDelete.id)
    toast.success(`Asignatura «${toDelete.name}» eliminada.`, { action: { label: "Deshacer", onClick: undo }, duration: 8000 })
    setToDelete(null)
  }

  const deleting = toDelete ? usage(toDelete.id) : null

  const renderRow = (subject: Subject, group: Subject[]) => {
    const index = group.findIndex((item) => item.id === subject.id)
    const isEditing = editing?.id === subject.id
    const counts = usage(subject.id)
    return (
      <li key={subject.id} className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2">
        {isEditing && editing ? (
          <div className="grid w-full gap-2 py-1">
            <div className="flex gap-2">
              <Input
                aria-label={`Nombre de ${subject.name}`}
                value={editing.name}
                autoFocus
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); saveEditing() }
                  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(null) }
                }}
                className="glass-input h-9 min-w-0 flex-1"
              />
              <ColorPicker selectedColor={editing.color} onColorChange={(next) => setEditing({ ...editing, color: next })} customColors={customColors} setCustomColors={setCustomColors} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AliasInput
                id={`aliases-${subject.id}`}
                label={`Apodos de ${subject.name}`}
                value={editing.aliases ?? []}
                onChange={(aliases) => setEditing((current) => current && { ...current, aliases })}
                onCancel={() => setEditing(null)}
                className="min-w-[12rem] flex-1"
              />
              <div className="ml-auto flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button type="button" size="sm" variant="primary" onClick={saveEditing} disabled={!editing.name.trim()}>Guardar</Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-medium", subject.archived && "text-muted-foreground")}>{subject.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {plural(counts.tasks, "tarea", "tareas")} · {plural(counts.events, "evento", "eventos")}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Subir ${subject.name}`} disabled={index === 0} onClick={() => move(subject, -1)}><ArrowUp /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Bajar ${subject.name}`} disabled={index === group.length - 1} onClick={() => move(subject, 1)}><ArrowDown /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${subject.name}`} onClick={() => setEditing(subject)}><Pencil /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={subject.archived ? `Recuperar ${subject.name}` : `Archivar ${subject.name}`} title={subject.archived ? "Recuperar" : "Archivar"}
                onClick={() => announceDetection(subject.name, updateSubject(subject.id, { archived: subject.archived ? undefined : true }))}>
                {subject.archived ? <ArchiveRestore /> : <Archive />}
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Eliminar ${subject.name}`} onClick={() => setToDelete(subject)}>
                <Trash2 className="text-[hsl(var(--status-danger))]" />
              </Button>
            </div>
          </>
        )}
      </li>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(formDialogStyles.content, "sm:max-w-[560px]")}>
          <div className={formDialogStyles.form}>
            <DialogHeader className={formDialogStyles.header}>
              <DialogTitle>Asignaturas</DialogTitle>
              <DialogDescription>Cada tarea o evento puede pertenecer a una. Archivarla la quita de la lista sin tocar sus tareas ni eventos.</DialogDescription>
            </DialogHeader>
            <div className={formDialogStyles.body}>
              <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); handleAdd() }}>
                <Label htmlFor="new-subject">Nueva asignatura</Label>
                <div className="flex gap-2">
                  <Input id="new-subject" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Cálculo" className="glass-input min-w-0 flex-1" autoComplete="off" />
                  <ColorPicker selectedColor={color} onColorChange={setColor} customColors={customColors} setCustomColors={setCustomColors} />
                  <Button type="submit" variant="primary" disabled={!name.trim()}>Añadir</Button>
                </div>
              </form>

              <div className="grid gap-2">
                <Label>Tus asignaturas</Label>
                {active.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Aún no hay ninguna. Añade la primera arriba.</p>
                ) : (
                  <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card">{active.map((subject) => renderRow(subject, active))}</ul>
                )}
              </div>

              {archived.length > 0 && (
                <div className="grid gap-2">
                  <Label>Archivadas</Label>
                  <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card">{archived.map((subject) => renderRow(subject, archived))}</ul>
                </div>
              )}

              <div className="grid gap-2 border-t border-border/70 pt-4">
                <Label htmlFor="threshold">Una asignatura está al día cuando…</Label>
                <Select value={threshold} onValueChange={(value) => onThresholdChange(value as PendingThreshold)}>
                  <SelectTrigger id="threshold" className="glass-input"><SelectValue /></SelectTrigger>
                  <SelectContent className="glass">
                    {THRESHOLDS.map((value) => <SelectItem key={value} value={value}>{THRESHOLD_LABEL[value]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {threshold === "manual"
                    ? "Cámbialo cuando quieras tocando el estado de la asignatura en la pantalla principal."
                    : "Las fechas no cuentan y las tareas de menor prioridad aparecen como «sin prisa». Para fijar una a mano, toca su estado en la pantalla principal."}
                </p>
              </div>
            </div>
            <DialogFooter className={formDialogStyles.footer}>
              <Button type="button" variant="outline" className="sm:ml-auto" onClick={() => onOpenChange(false)}>Cerrar</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={!!toDelete}
        onOpenChange={(next) => !next && setToDelete(null)}
        title="Eliminar asignatura"
        description={deleting && (deleting.tasks || deleting.events)
          ? `Se eliminará «${toDelete?.name}». Sus ${plural(deleting.tasks, "tarea", "tareas")} y ${plural(deleting.events, "evento", "eventos")} no se borran: pasan a quedar sin asignatura.`
          : `Se eliminará «${toDelete?.name}».`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </>
  )
}
