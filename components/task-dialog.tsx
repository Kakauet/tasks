"use client"

import type React from "react"

import { TagBadge } from "@/components/ui/tag-badge"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
Dialog,
DialogContent,
DialogDescription,
DialogFooter,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formDialogStyles } from "@/components/ui/form-dialog-styles"
import { useTaskContext, type Task, type TaskStep } from "@/context/task-context"
import { cn } from "@/lib/utils"
import { addDays, format, isSameDay, nextMonday, parseISO, startOfDay } from "date-fns"
import { es } from "date-fns/locale"
import { AlertCircle, CalendarIcon, Circle, Clock, Timer, Trash2, X } from "lucide-react"
import { formatStudyTime } from "@/lib/focus"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

// Implementar drag and drop para los pasos

// Importar los nuevos componentes al principio del archivo
import { DragDropProvider } from "@/components/dnd-provider"
import { StepList } from "@/components/step-list"

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultValues?: Partial<Task>
  initialStatus?: Task["status"]
  mode?: "create" | "edit"
}

export function TaskDialog({
  open,
  onOpenChange,
  defaultValues,
  initialStatus = "todo",
  mode = "create",
}: TaskDialogProps) {
  // Modificar la función handleSubmit para incluir la nueva funcionalidad
  const { addTask, updateTask, deleteTask, undo, tags } = useTaskContext()
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const saveStartedRef = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState(defaultValues?.title || "")
  const [description, setDescription] = useState(defaultValues?.description || "")
  const [status, setStatus] = useState<Task["status"]>(defaultValues?.status || initialStatus)
  const [priority, setPriority] = useState<Task["priority"]>(defaultValues?.priority || "medium")
  const [dueDate, setDueDate] = useState<Date | undefined>(
    defaultValues?.dueDate ? parseISO(defaultValues.dueDate) : undefined,
  )
  const [steps, setSteps] = useState<TaskStep[]>(defaultValues?.steps || [])
  const stepsRef = useRef<TaskStep[]>(defaultValues?.steps || [])
  const [draftStep, setDraftStep] = useState("")
  const draftStepRef = useRef("")
  const [selectedTags, setSelectedTags] = useState<string[]>(defaultValues?.tags || [])

  useEffect(() => {
    if (open) {
      saveStartedRef.current = false
      setTitleError(null)
      // Reset form fields based on mode and defaultValues
      if (mode === "create" && !defaultValues) {
        // Clear all fields for new task creation
        setTitle("")
        setDescription("")
        setStatus(initialStatus)
        setPriority("medium")
        setDueDate(undefined)
        setSteps([])
        stepsRef.current = []
        setDraftStep("")
        draftStepRef.current = ""
        setSelectedTags([])
      } else if (defaultValues) {
        // Populate fields for editing
        setTitle(defaultValues.title || "")
        setDescription(defaultValues.description || "")
        setStatus(defaultValues.status || initialStatus)
        setPriority(defaultValues.priority || "medium")
        setDueDate(defaultValues.dueDate ? parseISO(defaultValues.dueDate) : undefined)
        const initialSteps = defaultValues.steps || []
        setSteps(initialSteps)
        stepsRef.current = initialSteps
        setDraftStep("")
        draftStepRef.current = ""
        setSelectedTags(defaultValues.tags || [])
      }
    }
  }, [open, defaultValues, initialStatus, mode])

  const handleDraftStepChange = (text: string) => {
    draftStepRef.current = text
    setDraftStep(text)
  }

  const commitDraftStep = () => {
    const text = draftStepRef.current.trim()
    if (!text) return stepsRef.current

    const nextSteps = [...stepsRef.current, { id: crypto.randomUUID(), text, completed: false }]
    stepsRef.current = nextSteps
    setSteps(nextSteps)
    draftStepRef.current = ""
    setDraftStep("")
    return nextSteps
  }

  const saveTask = () => {
    if (saveStartedRef.current) return false

    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setTitleError("El título es obligatorio.")
      document.getElementById("title")?.focus()
      return false
    }

    saveStartedRef.current = true
    setIsSubmitting(true)

    const taskData = {
      title: normalizedTitle,
      description,
      status: status as "todo" | "inProgress" | "done",
      priority: priority as "low" | "medium" | "high",
      dueDate: dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
      steps: commitDraftStep(),
      tags: selectedTags,
    }

    if (mode === "edit" && defaultValues?.id) {
      updateTask(defaultValues.id, taskData)
    } else {
      addTask(taskData)
      toast.success("Tarea creada.")
    }
    setIsSubmitting(false)
    onOpenChange(false)
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveTask()
  }

  const handleOverlayInteraction = (event: React.SyntheticEvent) => {
    if (mode !== "edit" || confirmDeleteOpen || isSubmitting || isDeleting) return
    event.preventDefault()
    saveTask()
  }

  const handleToggleStep = (id: string) => {
    const nextSteps = stepsRef.current.map((step) => (step.id === id ? { ...step, completed: !step.completed } : step))
    stepsRef.current = nextSteps
    setSteps(nextSteps)
  }

  const handleDeleteStep = (id: string) => {
    const nextSteps = stepsRef.current.filter((step) => step.id !== id)
    stepsRef.current = nextSteps
    setSteps(nextSteps)
  }

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]))
  }

  const handleDialogClose = (newOpen: boolean) => {
    if (!isSubmitting) onOpenChange(newOpen)
  }

  const handleDeleteTask = () => {
    if (!(mode === "edit" && defaultValues?.id)) return

    setIsDeleting(true)
    deleteTask(defaultValues.id)
    setIsDeleting(false)
    setConfirmDeleteOpen(false)
    onOpenChange(false)
    toast.success("Tarea eliminada.", { action: { label: "Deshacer", onClick: undo }, duration: 8000 })
  }

  const today = startOfDay(new Date())
  const quickDates = [
    { label: "Hoy", date: today },
    { label: "Mañana", date: addDays(today, 1) },
    { label: "Próx. lunes", date: nextMonday(today) },
    { label: "En 1 semana", date: addDays(today, 7) },
  ]

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={handleDialogClose}
    >
      {/* Modificar el DialogContent para hacerlo más ancho en pantallas grandes */}
      <DialogContent
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          if (mode === "edit") {
            event.preventDefault()
            // Focus the dialog without selecting or activating an input.
            dialogRef.current?.focus({ preventScroll: true })
          }
        }}
        ref={dialogRef}
        onOverlayPointerDown={handleOverlayInteraction}
        onOverlayClick={handleOverlayInteraction}
        onEscapeKeyDown={(event) => {
          if (event.target instanceof Element && event.target.matches('[data-step-editor]')) event.preventDefault()
        }}
        className={cn("interactive-after-delete", formDialogStyles.content, "sm:max-w-[720px]")}
      >
        <form onSubmit={handleSubmit} className={formDialogStyles.form}>
          <DialogHeader className={formDialogStyles.header}>
            <DialogTitle>{mode === "create" ? "Crear nueva tarea" : "Editar tarea"}</DialogTitle>
            <DialogDescription className="sr-only">
              {mode === "create" ? "Añade una nueva tarea a tu tablero" : "Modifica los detalles de la tarea"}
            </DialogDescription>
          </DialogHeader>
          <div className={formDialogStyles.body}>
            <div className="grid gap-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (titleError) setTitleError(null)
                }}
                placeholder="Ej: Repasar tema 3 de Biología"
                required
                aria-invalid={!!titleError}
                aria-describedby={titleError ? "title-error" : undefined}
                className="glass-input"
              />
              {titleError && <p id="title-error" className="text-xs text-[hsl(var(--status-danger))]">{titleError}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notas, enlaces, apuntes…"
                rows={2}
                autoResize
                className="min-h-[76px] max-h-60 glass-input"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="status">Estado</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as Task["status"])}>
                  <SelectTrigger id="status" className="glass-input">
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent className="glass">
                    <SelectItem value="todo">Por Hacer</SelectItem>
                    <SelectItem value="inProgress">En Progreso</SelectItem>
                    <SelectItem value="done">Completada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <fieldset className="min-w-0">
                <legend id="priority-label" className="mb-2 text-sm font-medium leading-none">Prioridad</legend>
                <div role="radiogroup" aria-labelledby="priority-label" className="grid h-10 grid-cols-3 gap-1 rounded-xl border border-border/70 bg-muted/20 p-1">
                  {([
                    { value: "low", label: "Baja", Icon: Circle, color: "hsl(var(--status-success))" },
                    { value: "medium", label: "Media", Icon: Clock, color: "hsl(var(--status-caution))" },
                    { value: "high", label: "Alta", Icon: AlertCircle, color: "hsl(var(--status-danger))" },
                  ] as const).map(({ value, label, Icon, color }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={priority === value}
                      onClick={() => setPriority(value)}
                      className={cn(
                        "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:text-sm",
                        priority === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dueDate">Fecha de vencimiento</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="dueDate"
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal glass-input",
                      !dueDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 glass">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    defaultMonth={dueDate}
                    onSelect={(date) => {
                      setDueDate(date)
                      setDatePickerOpen(false)
                    }}
                    initialFocus
                    locale={es}
                    weekStartsOn={1}
                  />
                </PopoverContent>
              </Popover>
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Fechas rápidas">
                {quickDates.map(({ label, date }) => {
                  const active = !!dueDate && isSameDay(dueDate, date)
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setDueDate(date)}
                      className={cn(
                        "h-7 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate(undefined)}
                    className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5 text-[hsl(var(--status-danger))]" aria-hidden="true" />
                    Quitar fecha
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Etiquetas</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <TagBadge key={tag.id} id={tag.id} name={tag.name} color={tag.color}
                    selected={selectedTags.includes(tag.id)} onClick={toggleTag} />
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Pasos</Label>
                {steps.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">{steps.filter(step => step.completed).length}/{steps.length}</span>}
              </div>
              <div className="min-w-0">
                <DragDropProvider>
                  <StepList
                    steps={steps}
                    onStepsChange={(newSteps) => {
                      stepsRef.current = newSteps
                      setSteps(newSteps)
                    }}
                    onToggleStep={handleToggleStep}
                    onDeleteStep={handleDeleteStep}
                    onAddStep={commitDraftStep}
                    onUpdateStepText={(id, text) => {
                      const nextSteps = stepsRef.current.map((step) => (step.id === id ? { ...step, text } : step))
                      stepsRef.current = nextSteps
                      setSteps(nextSteps)
                    }}
                    draftStep={draftStep}
                    onDraftStepChange={handleDraftStepChange}
                  />
                </DragDropProvider>
              </div>
            </div>
            {mode === "edit" && !!defaultValues?.focusSeconds && defaultValues.focusSeconds >= 60 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                {formatStudyTime(defaultValues.focusSeconds)} de estudio
                {defaultValues.focusSessions ? ` · ${defaultValues.focusSessions} pomodoro${defaultValues.focusSessions > 1 ? "s" : ""}` : ""}
              </p>
            )}
          </div>
          <DialogFooter className={formDialogStyles.footer}>
            <div className="flex items-center gap-2">
              {mode === "edit" && defaultValues?.id && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="text-muted-foreground hover:bg-transparent hover:text-foreground"
                  aria-label="Eliminar tarea"
                  disabled={isDeleting || isSubmitting}
                >
                  <Trash2 className="mr-2 h-4 w-4 text-[hsl(var(--status-danger))]" />
                  <span className="hidden sm:inline">Eliminar tarea</span>
                </Button>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 sm:ml-auto">
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                {mode === "edit" ? "Cancelar" : "Cerrar"}
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting || isDeleting}>
                {mode === "create" ? "Crear tarea" : "Guardar cambios"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmationDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}
      title="Eliminar tarea" description={`Se eliminará «${defaultValues?.title ?? "esta tarea"}».`}
      confirmText="Eliminar" cancelText="Cancelar" onConfirm={handleDeleteTask} isProcessing={isDeleting} variant="destructive" />
    </>
  )
}
