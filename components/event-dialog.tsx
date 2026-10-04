"use client"

import type React from "react"

import { ColorPicker } from "@/components/color-picker"
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
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import { TagBadge } from "@/components/ui/tag-badge"
import { Textarea } from "@/components/ui/textarea"
import { formDialogStyles } from "@/components/ui/form-dialog-styles"
import { useTaskContext, type Event, type RecurrenceType } from "@/context/task-context"
import { cn } from "@/lib/utils"
import { MAX_OCCURRENCES } from "@/lib/tasks/recurrence"
import { addDays, format, isBefore, parseISO, startOfDay } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarDays, CalendarIcon, Clock, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultValues?: Partial<Event>
  mode?: "create" | "edit"
}

// Recuperar colores personalizados del localStorage
const getCustomColors = (): string[] => {
  try {
    const savedColors = localStorage.getItem("custom-event-colors")
    return savedColors ? JSON.parse(savedColors) : []
  } catch (error) {
    console.error("Error loading custom colors:", error)
    return []
  }
}

// Guardar colores personalizados en localStorage
const saveCustomColor = (color: string) => {
  try {
    const currentColors = getCustomColors()
    if (!currentColors.includes(color)) {
      const updatedColors = [...currentColors, color]
      localStorage.setItem("custom-event-colors", JSON.stringify(updatedColors))
    }
  } catch (error) {
    console.error("Error saving custom color:", error)
  }
}

export function EventDialog({ open, onOpenChange, defaultValues, mode = "create" }: EventDialogProps) {
  const { addEvent, updateEvent, deleteEvent, undo, tags } = useTaskContext()
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [openDatePicker, setOpenDatePicker] = useState<"date" | "start" | "end" | "recurrenceEnd" | null>(null)

  const [title, setTitle] = useState(defaultValues?.title || "")
  const [description, setDescription] = useState(defaultValues?.description || "")
  const [date, setDate] = useState<Date | undefined>(defaultValues?.date ? parseISO(defaultValues.date) : new Date())
  const [isMultiDay, setIsMultiDay] = useState(defaultValues?.isMultiDay || false)
  const [endDate, setEndDate] = useState<Date | undefined>(
    defaultValues?.endDate ? parseISO(defaultValues.endDate) : addDays(startOfDay(new Date()), 1),
  )
  const [isAllDay, setIsAllDay] = useState(defaultValues?.isAllDay !== false)
  const [startTime, setStartTime] = useState(defaultValues?.startTime || "09:00")
  const [endTime, setEndTime] = useState(defaultValues?.endTime || "10:00")
  const [isGraded, setIsGraded] = useState(defaultValues?.isGraded || false)
  const [grade, setGrade] = useState(defaultValues?.grade || "")
  const [selectedTags, setSelectedTags] = useState<string[]>(defaultValues?.tags || [])
  const [eventColor, setEventColor] = useState(defaultValues?.color || "#3b82f6")
  const [customColors, setCustomColors] = useState<string[]>([])

  // Recurrence state
  const [recurrenceTab, setRecurrenceTab] = useState<"none" | "recurrence">(
    defaultValues?.recurrence?.type !== "none" && defaultValues?.recurrence ? "recurrence" : "none",
  )
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(defaultValues?.recurrence?.type || "none")
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(defaultValues?.recurrence?.interval || 1)
  const [recurrenceEndType, setRecurrenceEndType] = useState<"never" | "after" | "on">(
    defaultValues?.recurrence?.occurrences ? "after" : defaultValues?.recurrence?.endDate ? "on" : "never",
  )
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState<number>(
    defaultValues?.recurrence?.occurrences || 10,
  )
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<Date | undefined>(
    defaultValues?.recurrence?.endDate ? parseISO(defaultValues.recurrence.endDate) : undefined,
  )

  // Dentro del componente EventDialog, añadir validación para fechas y horas
  const [timeError, setTimeError] = useState<string | null>(null)
  const lastInitKeyRef = useRef<string | null>(null)

  // Cargar colores personalizados al abrir el diálogo
  useEffect(() => {
    if (open) {
      setCustomColors(getCustomColors())
    }
  }, [open])

  const initKey = useMemo(() => {
    if (mode === "edit") {
      return `edit:${defaultValues?.id ?? "unknown"}`
    }
    return `create:${defaultValues?.date ?? "no-date"}`
  }, [mode, defaultValues?.id, defaultValues?.date])

  // Inicializar el formulario solo cuando se abre el diálogo o cambia realmente el evento a editar
  useEffect(() => {
    if (!open) {
      lastInitKeyRef.current = null
      return
    }

    if (lastInitKeyRef.current === initKey) {
      return
    }

    setTitleError(null)
    setTimeError(null)
    setOpenDatePicker(null)
    if (defaultValues) {
      setTitle(defaultValues.title || "")
      setDescription(defaultValues.description || "")
      setDate(defaultValues.date ? parseISO(defaultValues.date) : new Date())
      setIsMultiDay(defaultValues.isMultiDay || false)
      setEndDate(defaultValues.endDate ? parseISO(defaultValues.endDate) : addDays(startOfDay(new Date()), 1))
      setIsAllDay(defaultValues.isAllDay !== false)
      setStartTime(defaultValues.startTime || "09:00")
      setEndTime(defaultValues.endTime || "10:00")
      setIsGraded(defaultValues.isGraded || false)
      setGrade(defaultValues.grade || "")
      setSelectedTags(defaultValues.tags || [])
      setEventColor(defaultValues.color || "#3b82f6")

      setRecurrenceTab(defaultValues.recurrence?.type !== "none" && defaultValues.recurrence ? "recurrence" : "none")
      setRecurrenceType(defaultValues.recurrence?.type || "none")
      setRecurrenceInterval(defaultValues.recurrence?.interval || 1)
      setRecurrenceEndType(
        defaultValues.recurrence?.occurrences ? "after" : defaultValues.recurrence?.endDate ? "on" : "never",
      )
      setRecurrenceOccurrences(defaultValues.recurrence?.occurrences || 10)
      setRecurrenceEndDate(defaultValues.recurrence?.endDate ? parseISO(defaultValues.recurrence.endDate) : undefined)
    } else {
      setTitle("")
      setDescription("")
      setDate(new Date())
      setIsMultiDay(false)
      setEndDate(addDays(startOfDay(new Date()), 1))
      setIsAllDay(true)
      setStartTime("09:00")
      setEndTime("10:00")
      setIsGraded(false)
      setGrade("")
      setSelectedTags([])
      setEventColor("#3b82f6")
      setRecurrenceTab("none")
      setRecurrenceType("none")
      setRecurrenceInterval(1)
      setRecurrenceEndType("never")
      setRecurrenceOccurrences(10)
      setRecurrenceEndDate(undefined)
    }

    lastInitKeyRef.current = initKey
  }, [open, defaultValues, initKey])

  // Colores predefinidos para el selector
  const predefinedColors = [
    "#3b82f6", // Azul
    "#ef4444", // Rojo
    "#10b981", // Verde
    "#f59e0b", // Naranja
    "#8b5cf6", // Púrpura
    "#ec4899", // Rosa
    "#6b7280", // Gris
  ]

  // Añadir validación de tiempo antes del handleSubmit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!date) return

    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setTitleError("El título es obligatorio.")
      document.getElementById("event-title")?.focus()
      return
    }

    // En un evento de un solo día, la hora de fin debe ser posterior a la de inicio
    const multiDay = isMultiDay && !!endDate && isBefore(startOfDay(date), startOfDay(endDate))
    if (!isAllDay && !multiDay && startTime && endTime) {
      if (endTime <= startTime) {
        setTimeError("La hora de fin debe ser posterior a la hora de inicio")
        return
      }
    }

    setTimeError(null)

    // Guardar el color personalizado si no es uno de los predefinidos
    if (!predefinedColors.includes(eventColor) && !customColors.includes(eventColor)) {
      saveCustomColor(eventColor)
    }

    const eventData: Omit<Event, "id"> = {
      title: normalizedTitle,
      description,
      date: format(date, "yyyy-MM-dd"),
      isMultiDay: multiDay,
      endDate: multiDay && endDate ? format(endDate, "yyyy-MM-dd") : undefined,
      isAllDay,
      startTime: isAllDay ? undefined : startTime,
      endTime: isAllDay ? undefined : endTime,
      isGraded,
      grade: isGraded ? grade : undefined,
      tags: selectedTags,
      color: eventColor,
      recurrence: undefined,
    }

    // Add recurrence data if enabled
    if (recurrenceTab === "recurrence" && recurrenceType !== "none") {
      eventData.recurrence = {
        type: recurrenceType,
        interval: recurrenceInterval,
      }

      if (recurrenceEndType === "after") {
        eventData.recurrence.occurrences = recurrenceOccurrences
      } else if (recurrenceEndType === "on" && recurrenceEndDate) {
        eventData.recurrence.endDate = format(recurrenceEndDate, "yyyy-MM-dd")
      }
    }

    if (mode === "edit" && defaultValues?.id) {
      updateEvent(defaultValues.id, eventData)
    } else {
      addEvent(eventData)
      toast.success(eventData.recurrence ? "Evento creado con sus repeticiones." : "Evento creado.")
    }

    onOpenChange(false)
  }

  const isRecurringSeries = mode === "edit" && !!defaultValues?.recurrence && !defaultValues.parentEventId

  const handleDialogClose = (newOpen: boolean) => {
    onOpenChange(newOpen)
  }

  const handleDeleteEvent = () => {
    if (!(mode === "edit" && defaultValues?.id)) return

    setIsDeleting(true)
    deleteEvent(defaultValues.id)
    setIsDeleting(false)
    setConfirmDeleteOpen(false)
    onOpenChange(false)
    toast.success(isRecurringSeries ? "Serie de eventos eliminada." : "Evento eliminado.", {
      action: { label: "Deshacer", onClick: undo }, duration: 8000,
    })
  }

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]))
  }

  // Manejar la adición de un color personalizado
  const handleColorChange = (color: string) => {
    setEventColor(color)
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={handleDialogClose}
    >
      <DialogContent
        className={cn(formDialogStyles.content, "sm:max-w-[760px]")}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <form onSubmit={handleSubmit} className={formDialogStyles.form}>
          <DialogHeader className={formDialogStyles.header}>
            <DialogTitle>{mode === "create" ? "Crear nuevo evento" : "Editar evento"}</DialogTitle>
            <DialogDescription>
              {mode === "create" ? "Añade un nuevo evento a tu calendario" : "Modifica los detalles del evento"}
            </DialogDescription>
          </DialogHeader>
          <div className={formDialogStyles.body}>
            <div className="grid gap-2">
              <Label htmlFor="event-title">Título</Label>
              <Input
                id="event-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (titleError) setTitleError(null)
                }}
                placeholder="Ej: Examen de Historia"
                required
                aria-invalid={!!titleError}
                aria-describedby={titleError ? "event-title-error" : undefined}
                className="glass-input"
              />
              {titleError && <p id="event-title-error" className="text-xs text-[hsl(var(--status-danger))]">{titleError}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-description">Descripción</Label>
              <Textarea
                id="event-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción del evento"
                rows={2}
                autoResize
                className="glass-input min-h-[76px] max-h-60"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="isMultiDay">Evento de varios días</Label>
                <Switch
                  id="isMultiDay"
                  checked={isMultiDay}
                  onCheckedChange={(checked) => {
                    setIsMultiDay(checked)
                    // The end must follow the start, even when the start is a future day.
                    if (checked && date && (!endDate || !isBefore(startOfDay(date), startOfDay(endDate)))) {
                      setEndDate(addDays(startOfDay(date), 1))
                    }
                  }}
                />
              </div>

              {!isMultiDay ? (
                <div className="grid gap-2">
                  <Label htmlFor="date">Fecha</Label>
                  <Popover open={openDatePicker === "date"} onOpenChange={(next) => setOpenDatePicker(next ? "date" : null)}>
                    <PopoverTrigger asChild>
                      <Button
                        id="date"
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal glass-input",
                          !date && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 glass">
                      <Calendar
                        mode="single"
                        selected={date}
                        defaultMonth={date}
                        onSelect={(newDate) => {
                          if (newDate) setDate(newDate)
                          setOpenDatePicker(null)
                        }}
                        initialFocus
                        locale={es}
                        weekStartsOn={1}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">Fecha de inicio</Label>
                    <Popover open={openDatePicker === "start"} onOpenChange={(next) => setOpenDatePicker(next ? "start" : null)}>
                      <PopoverTrigger asChild>
                        <Button
                          id="startDate"
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal glass-input",
                            !date && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "PPP", { locale: es }) : <span>Selecciona fecha de inicio</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 glass">
                        <Calendar
                          mode="single"
                          selected={date}
                          defaultMonth={date}
                          onSelect={(newDate) => {
                            setOpenDatePicker(null)
                            if (!newDate) return
                            setDate(newDate)
                            // Si la fecha de fin ya no es posterior a la nueva fecha
                            if (!endDate || !isBefore(startOfDay(newDate), startOfDay(endDate))) {
                              setEndDate(addDays(startOfDay(newDate), 1))
                            }
                          }}
                          locale={es}
                          weekStartsOn={1}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="endDate">Fecha de fin</Label>
                    <Popover open={openDatePicker === "end"} onOpenChange={(next) => setOpenDatePicker(next ? "end" : null)}>
                      <PopoverTrigger asChild>
                        <Button
                          id="endDate"
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal glass-input",
                            !endDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "PPP", { locale: es }) : <span>Selecciona fecha de fin</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 glass">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          defaultMonth={endDate ?? date}
                          onSelect={(newDate) => {
                            if (newDate) setEndDate(newDate)
                            setOpenDatePicker(null)
                          }}
                          initialFocus
                          disabled={(currentDate) => (date ? !isBefore(startOfDay(date), currentDate) : false)}
                          locale={es}
                          weekStartsOn={1}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="isAllDay">Todo el día</Label>
                <Switch id="isAllDay" checked={isAllDay} onCheckedChange={setIsAllDay} />
              </div>

              {!isAllDay && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="grid gap-2">
                    <Label htmlFor="startTime">Hora de inicio</Label>
                    <div className="flex items-center">
                      <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="startTime"
                        type="time"
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value)
                          setTimeError(null)
                        }}
                        className="glass-input"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endTime">Hora de fin</Label>
                    <div className="flex items-center">
                      <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="endTime"
                        type="time"
                        value={endTime}
                        onChange={(e) => {
                          setEndTime(e.target.value)
                          setTimeError(null)
                        }}
                        className="glass-input"
                      />
                    </div>
                  </div>
                  {timeError && <div role="alert" className="col-span-2 mt-1 text-sm text-[hsl(var(--status-danger))]">{timeError}</div>}
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="eventColor">Color del evento</Label>
              <ColorPicker
                selectedColor={eventColor}
                onColorChange={handleColorChange}
                customColors={customColors}
                setCustomColors={setCustomColors}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="isGraded">Evento calificable</Label>
                <Switch id="isGraded" checked={isGraded} onCheckedChange={setIsGraded} />
              </div>
              {isGraded && (
                <div className="grid gap-2">
                  <Label htmlFor="grade">Calificación</Label>
                  <Input
                    id="grade"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    placeholder="Ej: 8.5"
                    className="glass-input"
                  />
                </div>
              )}
            </div>

            {defaultValues?.parentEventId ? (
              <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                ↻ Esta es una repetición de una serie. Los cambios solo afectan a este día; para cambiar la repetición, edita el primer evento de la serie.
              </p>
            ) : <div className="grid gap-2">
              <Label>Repetición</Label>
              <Tabs
                value={recurrenceTab}
                onValueChange={(v) => {
                  setRecurrenceTab(v as "none" | "recurrence")
                  // Choosing "Repetir" must produce a repetition, not an empty frequency.
                  if (v === "recurrence" && recurrenceType === "none") setRecurrenceType("weekly")
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="none">
                    No repetir
                  </TabsTrigger>
                  <TabsTrigger value="recurrence">
                    Repetir
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="recurrence" className="mt-2 space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="recurrenceType">Frecuencia</Label>
                    <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}>
                      <SelectTrigger id="recurrenceType" className="glass-input">
                        <SelectValue placeholder="Selecciona frecuencia" />
                      </SelectTrigger>
                      <SelectContent className="glass">
                        <SelectItem value="daily">Diariamente</SelectItem>
                        <SelectItem value="weekly">Semanalmente</SelectItem>
                        <SelectItem value="monthly">Mensualmente</SelectItem>
                        <SelectItem value="yearly">Anualmente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="recurrenceInterval">Cada</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="recurrenceInterval"
                        type="number"
                        min="1"
                        max="99"
                        value={recurrenceInterval}
                        onChange={(e) => setRecurrenceInterval(Number.parseInt(e.target.value) || 1)}
                        className="w-20 glass-input"
                      />
                      <span className="text-sm text-muted-foreground">
                        {recurrenceType === "daily"
                          ? "días"
                          : recurrenceType === "weekly"
                            ? "semanas"
                            : recurrenceType === "monthly"
                              ? "meses"
                              : "años"}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="recurrenceEndType">Finaliza</Label>
                    <Select
                      value={recurrenceEndType}
                      onValueChange={(v) => setRecurrenceEndType(v as "never" | "after" | "on")}
                    >
                      <SelectTrigger id="recurrenceEndType" className="glass-input">
                        <SelectValue placeholder="Selecciona cuándo finaliza" />
                      </SelectTrigger>
                      <SelectContent className="glass">
                        <SelectItem value="never">Nunca</SelectItem>
                        <SelectItem value="after">Después de</SelectItem>
                        <SelectItem value="on">En fecha</SelectItem>
                      </SelectContent>
                    </Select>

                    {recurrenceEndType === "after" && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          type="number"
                          min="2"
                          max={MAX_OCCURRENCES}
                          value={recurrenceOccurrences}
                          onChange={(e) => setRecurrenceOccurrences(Math.min(MAX_OCCURRENCES, Math.max(1, Number.parseInt(e.target.value) || 1)))}
                          className="w-20 glass-input"
                        />
                        <span className="text-sm text-muted-foreground">veces en total</span>
                      </div>
                    )}

                    {recurrenceEndType === "on" && (
                      <div className="mt-2">
                        <Popover open={openDatePicker === "recurrenceEnd"} onOpenChange={(next) => setOpenDatePicker(next ? "recurrenceEnd" : null)}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal glass-input",
                                !recurrenceEndDate && "text-muted-foreground",
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {recurrenceEndDate ? (
                                format(recurrenceEndDate, "PPP", { locale: es })
                              ) : (
                                <span>Selecciona fecha final</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 glass">
                            <Calendar
                              mode="single"
                              selected={recurrenceEndDate}
                              defaultMonth={recurrenceEndDate ?? date}
                              onSelect={(newDate) => {
                                setRecurrenceEndDate(newDate)
                                setOpenDatePicker(null)
                              }}
                              initialFocus
                              disabled={(currentDate) => (date ? isBefore(currentDate, date) : false)}
                              locale={es}
                              weekStartsOn={1}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>}

            <div className="grid gap-2">
              <Label>Etiquetas</Label>
              <div className="flex flex-wrap gap-2">
                {tags.length === 0 && <p className="text-sm text-muted-foreground">Aún no tienes etiquetas. Créalas desde Herramientas en el tablero.</p>}
                {tags.map((tag) => (
                  <TagBadge key={tag.id} id={tag.id} name={tag.name} color={tag.color}
                    selected={selectedTags.includes(tag.id)} onClick={toggleTag} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className={formDialogStyles.footer}>
            <div className="flex items-center gap-2">
              {mode === "edit" && defaultValues?.id && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="text-muted-foreground hover:bg-transparent hover:text-foreground"
                  disabled={isDeleting}
                >
                  <Trash2 className="mr-2 h-4 w-4 text-[hsl(var(--status-danger))]" />
                  <span className="hidden sm:inline">{isRecurringSeries ? "Eliminar serie" : "Eliminar evento"}</span>
                  <span className="sr-only">Eliminar evento</span>
                </Button>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 sm:ml-auto">
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                {mode === "edit" ? "Cancelar" : "Cerrar"}
              </Button>
              <Button type="submit" variant="primary" disabled={isDeleting}>
                {mode === "create" ? "Crear evento" : "Guardar cambios"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmationDialog
      open={confirmDeleteOpen}
      onOpenChange={setConfirmDeleteOpen}
      title={isRecurringSeries ? "Eliminar serie de eventos" : "Eliminar evento"}
      description={isRecurringSeries
        ? `Se eliminarán «${defaultValues?.title ?? "este evento"}» y todas sus repeticiones.`
        : `Se eliminará «${defaultValues?.title ?? "este evento"}».`}
      confirmText="Eliminar"
      cancelText="Cancelar"
      onConfirm={handleDeleteEvent}
      isProcessing={isDeleting}
      variant="destructive"
    />
    </>
  )
}
