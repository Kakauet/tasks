"use client"

import { track } from "@/lib/activity"
import { useTaskContext, type Task, type Event as TaskEvent } from "@/context/task-context"
import { cn } from "@/lib/utils"
import { differenceInCalendarDays, format, isSameDay, isSameMonth, isToday, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

// Hooks personalizados
import { useCalendar } from "@/hooks/use-calendar"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useIsMobile } from "@/hooks/use-mobile"

// UI Components
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import { LinkifiedText } from "@/components/ui/linkified-text"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"

// Custom Components
import {
EventDetail,
MultiDayEvent,
SingleDayEvent,
TaskDetail,
TaskItem,
} from "@/components/calendar/calendar-event-components"
import { CalendarDropDay, CalendarEventDragSurface, movedEventStartDate, type CalendarEventDragItem } from "@/components/calendar/calendar-event-dnd"
import { CalendarEventDragLayer } from "@/components/calendar/calendar-event-drag-layer"
import { EventDialog } from "@/components/event-dialog"
import { TaskDialog } from "@/components/task-dialog"

// Icons
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, PlusCircle } from "lucide-react"

export function CalendarView() {
  const { tasks, events, tags, moveEvent, deleteEvent, undo, getEventsForDate } = useTaskContext()
  const isMobile = useIsMobile()

  // Estado de diálogos
  const eventDialog = useDialogState(false)
  const deleteDialog = useDialogState(false)

  // Estado adicional
  const [editingEvent, setEditingEvent] = useState<TaskEvent | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [eventToDelete, setEventToDelete] = useState<string | null>(null)
  const [eventToReveal, setEventToReveal] = useState<{ id: string; day: string } | null>(null)
  const eventDetailsRef = useRef<HTMLDivElement>(null)

  // Hook de calendario
  const {
    currentDate,
    selectedDate,
    setSelectedDate,
    view,
    setView,
    calendarDays,
    weekDays,
    goToToday,
    prevMonth,
    nextMonth,
    prevWeek,
    nextWeek,
    isSunday,
    getMultiDayPosition,
    selectedDateEvents,
  } = useCalendar(getEventsForDate)

  useEffect(() => { track("calendar.navigate",{view,monthOffset:(currentDate.getFullYear()-new Date().getFullYear())*12+currentDate.getMonth()-new Date().getMonth()}) },[view,currentDate])
  useEffect(() => { if(selectedDate) track("calendar.select",{dayOffset:differenceInCalendarDays(selectedDate,new Date())}) },[selectedDate])

  // Obtener tareas para una fecha específica
  const getTasksForDate = useCallback(
    (date: Date): Task[] => {
      return tasks.filter((task) => task.dueDate && isSameDay(parseISO(task.dueDate), date))
    },
    [tasks],
  )

  // Tareas para la fecha seleccionada
  const selectedDateTasks = useMemo(() => (selectedDate ? getTasksForDate(selectedDate) : []), [selectedDate, getTasksForDate])
  const eventDialogDefaultValues = useMemo(() => {
    if (editingEvent) return editingEvent
    return selectedDate ? { date: format(selectedDate, "yyyy-MM-dd") } : undefined
  }, [editingEvent, selectedDate])

  // Efecto para manejar el evento goToToday
  useEffect(() => {
    const handleGoToToday = () => {
      goToToday()
    }

    window.addEventListener("goToToday", handleGoToToday)
    return () => window.removeEventListener("goToToday", handleGoToToday)
  }, [goToToday])

  // Handlers para eventos
  const handleEditEvent = useCallback(
    (event: TaskEvent) => {
      setEditingEvent(event)
      eventDialog.open()
    },
    [eventDialog],
  )

  const handleRevealEvent = useCallback((event: TaskEvent, day: Date) => {
    setSelectedDate(day)
    setEventToReveal({ id: event.id, day: format(day, "yyyy-MM-dd") })
  }, [setSelectedDate])

  useEffect(() => {
    if (!isMobile || !eventToReveal || !selectedDate || format(selectedDate, "yyyy-MM-dd") !== eventToReveal.day) return

    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(eventDetailsRef.current?.querySelectorAll<HTMLDivElement>("[data-calendar-detail-event-id]") ?? [])
        .find(node => node.dataset.calendarDetailEventId === eventToReveal.id)
      target?.querySelector<HTMLElement>('[role="button"]')?.focus({ preventScroll: true })
      target?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isMobile, eventToReveal, selectedDate, selectedDateEvents])

  const handleEventDrop = useCallback((item: CalendarEventDragItem, targetDate: Date) => {
    const nextStartDate = movedEventStartDate(item.eventStartDate, item.anchorDate, format(targetDate, "yyyy-MM-dd"))
    if (nextStartDate !== item.eventStartDate) moveEvent(item.id, nextStartDate)
    setSelectedDate(targetDate)
  }, [moveEvent, setSelectedDate])

  const handleDeleteEvent = useCallback(() => {
    if (eventToDelete) {
      deleteDialog.startProcessing()
      deleteEvent(eventToDelete)
      setEventToDelete(null)
      deleteDialog.endProcessing()
      toast.success("Evento eliminado.", { action: { label: "Deshacer", onClick: undo }, duration: 8000 })
    }
  }, [eventToDelete, deleteEvent, deleteDialog, undo])

  const eventPendingDeletion = eventToDelete ? events.find((event) => event.id === eventToDelete) : undefined
  const deletingSeries = !!eventPendingDeletion?.recurrence && !eventPendingDeletion.parentEventId

  const handleCreateEventForDate = useCallback((date: Date) => {
    setSelectedDate(date)
    setEditingEvent(null)
    eventDialog.open()
  }, [setSelectedDate, eventDialog])

  const handleCreateEvent = useCallback(() => {
    const selectedInView = selectedDate && (view === "month"
      ? isSameMonth(selectedDate, currentDate)
      : weekDays.some((day) => isSameDay(day, selectedDate)))
    handleCreateEventForDate(selectedInView ? selectedDate : currentDate)
  }, [selectedDate, view, currentDate, weekDays, handleCreateEventForDate])

  // Renderizado de la vista mensual
  const renderMonthView = useCallback(() => {
    return (
      <div
        className={cn(
          "calendar-grid",
          isMobile
            ? "gap-px rounded-none border border-border/60 bg-border/60 overflow-hidden"
            : "gap-px rounded-md border border-border/60 bg-border/60 overflow-hidden",
        )}
      >
        {/* Cabecera de días de la semana */}
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day, index) => (
          <div
            key={index}
            className={cn(
              "calendar-day-header",
              isMobile && "bg-background py-2 text-[11px] font-semibold tracking-wide",
              index === 6 && "text-[hsl(var(--calendar-sunday-foreground))] font-medium",
            )}
          >
            {day}
          </div>
        ))}

        {/* Días del mes */}
        {calendarDays.map((day, index) => {
          const dayEvents = getEventsForDate(day)
          const dayTasks = getTasksForDate(day)
          const isCurrentMonth = isSameMonth(day, currentDate)
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
          const isDomingo = isSunday(day)

          // Agrupar eventos de varios días
          const multiDayEvents = dayEvents.filter((event) => event.isMultiDay && event.endDate)
          const singleDayEvents = dayEvents.filter((event) => !event.isMultiDay || !event.endDate)

          return (
            <CalendarDropDay
              key={index}
              date={day}
              onSelect={() => setSelectedDate(day)}
              onMove={handleEventDrop}
              className={cn(
                "group transition-colors cursor-pointer select-none",
                isMobile
                  ? "min-h-[78px] bg-background p-1.5"
                  : "min-h-[120px] bg-card px-1.5 py-2",
                !isMobile && (isCurrentMonth ? "bg-card" : "bg-muted/45"),
                isMobile && !isCurrentMonth && "bg-muted/20",
                !isMobile && isToday(day) && "today",
                isMobile && isToday(day) && "bg-primary/5",
                isSelected &&
                  (isMobile ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : "bg-primary/10 ring-1 ring-inset ring-primary/35"),
                isDomingo && "calendar-sunday",
                !isMobile && "hover:bg-accent/45",
              )}
            >
              <div className="flex justify-between items-start">
                <div className="flex h-6 items-center gap-1">
                  <span
                    className={cn(
                      isMobile ? "text-[11px] font-medium select-none" : "text-sm font-medium select-none",
                      !isCurrentMonth && "text-muted-foreground",
                      isDomingo && "text-[hsl(var(--calendar-sunday-foreground))]",
                      isToday(day) && "font-semibold text-primary",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {isToday(day) && (
                    <span aria-hidden="true" className={cn("inline-block shrink-0 rounded-full bg-primary", isMobile ? "h-1 w-1" : "h-1.5 w-1.5")} />
                  )}
                </div>
                {!isMobile && <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Crear evento el ${format(day, "d 'de' MMMM", { locale: es })}`}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation()
                      handleCreateEventForDate(day)
                    }}
                    className={cn("flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-[opacity,background-color,color] hover:bg-primary/10 hover:text-primary focus-visible:opacity-100", isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>}
              </div>

              {isMobile ? (
                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => {
                    const eventColor = event.color
                    const resolvedEventColor = eventColor ?? "hsl(var(--event-default))"
                    return (
                      <CalendarEventDragSurface
                        key={event.id}
                        event={event}
                        anchorDate={format(day, "yyyy-MM-dd")}
                        onOpen={(selectedEvent) => handleRevealEvent(selectedEvent, day)}
                        actionLabel={`Ir a ${event.title} en eventos del día. Arrastrar para mover de fecha.`}
                        className="calendar-mobile-event-pill cursor-grab active:cursor-grabbing"
                        style={{
                          backgroundColor: eventColor ? `${eventColor}20` : "hsl(var(--event-default) / 0.14)",
                          borderColor: event.isGraded
                            ? "hsl(var(--status-danger))"
                            : eventColor
                              ? `${eventColor}55`
                              : "hsl(var(--event-default) / 0.36)",
                          color: resolvedEventColor,
                        }}
                      >
                        {/* Cells are narrow on phones: the title matters more than the time, shown in the day detail. */}
                        <span className="calendar-event-title-fade">{event.title}</span>
                      </CalendarEventDragSurface>
                    )
                  })}

                  {dayEvents.length > 3 && (
                    <span className="block pl-1 text-[10px] text-muted-foreground select-none">+{dayEvents.length - 3} más</span>
                  )}

                  {dayTasks.length > 0 && (
                    dayTasks.length === 1 ? (
                      <button type="button" aria-label={`Abrir tarea ${dayTasks[0].title}`}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          setEditingTask(dayTasks[0])
                        }}
                        className="block w-full truncate pl-1 text-left text-[10px] text-[hsl(var(--status-success))] hover:underline"
                      >
                        1 tarea
                      </button>
                    ) : (
                      <span className="block pl-1 text-[10px] text-[hsl(var(--status-success))] select-none">
                        {dayTasks.length} tareas
                      </span>
                    )
                  )}
                </div>
              ) : (
                <div className="mt-1 space-y-1">
                  {/* Eventos de varios días */}
                  {multiDayEvents.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {multiDayEvents.slice(0, 2).map((event) => {
                        const position = getMultiDayPosition(event, day)
                        return <MultiDayEvent key={event.id} event={event} position={position} anchorDate={format(day, "yyyy-MM-dd")} onOpen={handleEditEvent} />
                      })}
                      {multiDayEvents.length > 2 && (
                        <div className="text-xs text-muted-foreground">+{multiDayEvents.length - 2} más</div>
                      )}
                    </div>
                  )}

                  {/* Eventos de un solo día */}
                  {singleDayEvents.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {singleDayEvents.slice(0, 2).map((event) => (
                        <SingleDayEvent key={event.id} event={event} onOpen={handleEditEvent} />
                      ))}
                      {singleDayEvents.length > 2 && (
                        <div className="text-xs text-muted-foreground">+{singleDayEvents.length - 2} más</div>
                      )}
                    </div>
                  )}

                  {/* Tareas */}
                  {dayTasks.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {dayTasks.slice(0, 2).map((task) => (
                        <TaskItem key={task.id} task={task} onOpen={setEditingTask} />
                      ))}
                      {dayTasks.length > 2 && <div className="text-xs text-muted-foreground">+{dayTasks.length - 2} más</div>}
                    </div>
                  )}
                </div>
              )}
            </CalendarDropDay>
          )
        })}
      </div>
    )
  }, [
    calendarDays,
    currentDate,
    selectedDate,
    getEventsForDate,
    getTasksForDate,
    isSunday,
    getMultiDayPosition,
    handleEventDrop,
    handleEditEvent,
    handleRevealEvent,
    handleCreateEventForDate,
    isMobile,
    setSelectedDate,
  ])

  // Renderizado de la vista semanal
  const renderWeekView = useCallback(() => {
    return (
      <div className="grid grid-cols-1 gap-2">
        {weekDays.map((day, index) => {
          const dayEvents = getEventsForDate(day)
          const dayTasks = getTasksForDate(day)
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
          const isDomingo = isSunday(day)

          return (
            <CalendarDropDay
              key={index}
              date={day}
              onSelect={() => setSelectedDate(day)}
              onMove={handleEventDrop}
              className={cn(
                "group p-2 transition-colors select-none",
                isMobile
                  ? "rounded-none border border-border/70 bg-card"
                  : "calendar-day-modern",
                isToday(day) && "today",
                isSelected && "border-primary bg-primary/10",
                isDomingo && "calendar-sunday",
                !isMobile && "hover:bg-muted/50",
                "cursor-pointer",
              )}
            >
              <div className="flex justify-between items-center mb-2">
                <span
                  className={cn(
                    "font-medium",
                    isDomingo && "text-[hsl(var(--calendar-sunday-foreground))]",
                  )}
                >
                  {format(day, "EEEE d", { locale: es })}
                </span>
                <div className="flex items-center gap-2">
                  {isToday(day) && (
                    <Badge variant="outline" className="border-primary text-primary">Hoy</Badge>
                  )}
                  <button type="button" aria-label={`Crear evento el ${format(day, "d 'de' MMMM", { locale: es })}`}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation()
                      handleCreateEventForDate(day)
                    }}
                    className={cn("flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-[opacity,background-color,color] hover:bg-primary/10 hover:text-primary focus-visible:opacity-100", isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {/* Eventos */}
                {dayEvents.map((event) => (
                  <CalendarEventDragSurface
                    key={event.id}
                    event={event}
                    anchorDate={format(day, "yyyy-MM-dd")}
                    onOpen={isMobile ? (selectedEvent) => handleRevealEvent(selectedEvent, day) : handleEditEvent}
                    actionLabel={isMobile ? `Ir a ${event.title} en eventos del día. Arrastrar para mover de fecha.` : undefined}
                    className="calendar-event card-hover-effect cursor-grab p-2 active:cursor-grabbing"
                    style={{
                      backgroundColor: event.color ? `${event.color}15` : "hsl(var(--event-default) / 0.12)",
                      borderLeft: `3px solid ${
                        event.isGraded
                          ? "hsl(var(--status-danger))"
                          : event.color ?? "hsl(var(--event-default))"
                      }`,
                    }}
                  >
                    <div className="flex min-w-0 items-center justify-between">
                      <span
                        className="calendar-event-title-fade text-[15px] font-semibold leading-tight"
                        style={{ color: event.color ?? "hsl(var(--event-default))" }}
                      >
                        {event.title}
                      </span>
                    </div>
                    {event.isMultiDay && event.endDate && (
                      <div className="text-xs flex items-center text-muted-foreground mt-1">
                        <CalendarIcon className="h-3 w-3 mr-1" />
                        <span>
                          {format(parseISO(event.date), "d MMM", { locale: es })} -
                          {format(parseISO(event.endDate), "d MMM", { locale: es })}
                        </span>
                      </div>
                    )}
                    {event.startTime && !event.isAllDay && (
                      <div className="text-xs flex items-center text-muted-foreground mt-1">
                        <CalendarIcon className="h-3 w-3 mr-1" />
                        <span>
                          {event.startTime} - {event.endTime || "?"}
                        </span>
                      </div>
                    )}
                    {event.description && (
                      isMobile ? (
                        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground/90">{event.description}</div>
                      ) : (
                        <LinkifiedText
                          text={event.description}
                          as="div"
                          className="mt-1 line-clamp-1 text-xs text-muted-foreground/90"
                          maxLinkLength={26}
                        />
                      )
                    )}
                    {event.recurrence && (
                      <div className="text-xs text-muted-foreground mt-1 flex items-center">
                        <span className="mr-1">↻</span>
                        {event.recurrence.type === "daily" && "Repetición diaria"}
                        {event.recurrence.type === "weekly" && "Repetición semanal"}
                        {event.recurrence.type === "monthly" && "Repetición mensual"}
                        {event.recurrence.type === "yearly" && "Repetición anual"}
                      </div>
                    )}
                  </CalendarEventDragSurface>
                ))}

                {/* Tareas */}
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="calendar-event card-hover-effect cursor-pointer border border-[hsl(var(--status-success)/0.24)] bg-[hsl(var(--status-success-soft)/0.65)] p-2"
                    role="button"
                    tabIndex={0}
                    aria-label={`Abrir tarea ${task.title}`}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation()
                      setEditingTask(task)
                    }}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault()
                        keyboardEvent.stopPropagation()
                        setEditingTask(task)
                      }
                    }}
                    style={{
                      borderLeftColor:
                        task.priority === "high"
                          ? "hsl(var(--status-danger))"
                          : task.priority === "medium"
                            ? "hsl(var(--status-caution))"
                            : "hsl(var(--status-success))",
                      borderLeftWidth: "3px",
                    }}
                  >
                    <div className="font-medium">{task.title}</div>
                    {task.description && (
                      <LinkifiedText
                        text={task.description}
                        as="div"
                        className="text-sm text-muted-foreground line-clamp-1"
                        maxLinkLength={26}
                      />
                    )}
                  </div>
                ))}

                {dayEvents.length === 0 && dayTasks.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No hay eventos ni tareas para este día
                  </div>
                )}
              </div>
            </CalendarDropDay>
          )
        })}
      </div>
    )
  }, [weekDays, selectedDate, getEventsForDate, getTasksForDate, isSunday, handleEventDrop, handleEditEvent, handleRevealEvent, handleCreateEventForDate, isMobile, setSelectedDate])

  // Renderizado del panel lateral
  const renderSidebar = useCallback(() => {
    return (
      <Card className="glass-card overflow-hidden rounded-2xl">
        <CardHeader className="calendar-header px-4 py-3">
          <CardTitle className="flex items-center text-md font-medium">
            <CalendarIcon className="mr-2 h-5 w-5" />
            {selectedDate ? format(selectedDate, "d 'de' MMMM, yyyy", { locale: es }) : "Selecciona una fecha"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {!selectedDate ? (
            <p className="text-sm text-muted-foreground">
              Haz clic en una fecha del calendario para ver los eventos y tareas de ese día.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Eventos */}
              <div>
                <h3 className="mb-2 text-sidebar-title">Eventos</h3>
                {selectedDateEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay eventos para este día.</p>
                ) : (
                  <div ref={eventDetailsRef} className="space-y-2">
                    {selectedDateEvents.map((event) => (
                      <div key={event.id} data-calendar-detail-event-id={event.id}>
                        <EventDetail
                          event={event}
                          tags={tags}
                          onOpen={handleEditEvent}
                          onDelete={setEventToDelete}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tareas */}
              <div>
                <h3 className="mb-2 text-sidebar-title">Tareas</h3>
                {selectedDateTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay tareas para este día.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDateTasks.map((task) => (
                      <TaskDetail key={task.id} task={task} tags={tags} onOpen={setEditingTask} />
                    ))}
                  </div>
                )}
              </div>

              {/* Botón para añadir evento */}
              <Button variant="primary" data-action="create-event" className="w-full" onClick={handleCreateEvent}>
                <Plus className="mr-2 h-4 w-4" />
                Añadir evento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }, [selectedDate, selectedDateEvents, selectedDateTasks, tags, handleEditEvent, handleCreateEvent, setEventToDelete])

  const periodLabel = view === "month"
    ? format(currentDate, "MMMM yyyy", { locale: es })
    : `Semana del ${format(weekDays[0], "d MMM", { locale: es })} al ${format(weekDays[6], "d MMM", { locale: es })}`

  return (
    <div className="flex flex-col gap-2 sm:gap-3 animate-in">
      <h1 className="sr-only">Calendario</h1>
      <CalendarEventDragLayer />
      <TooltipProvider>
        {/* Barra de herramientas */}
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 md:flex md:justify-between">
          <span className="min-w-0 truncate text-sm font-medium md:hidden" aria-live="polite" title={periodLabel}>
            {periodLabel}
          </span>
          <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-1.5 sm:gap-2 md:col-span-1 md:row-auto md:shrink-0">
            <Button variant="outline" size="sm" onClick={goToToday} className="order-3 ml-auto h-8 shrink-0 px-2.5 md:order-none md:ml-0">
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              Hoy
            </Button>
            <Tabs value={view} onValueChange={(v) => setView(v as "month" | "week")} className="shrink-0 md:hidden">
              <TabsList className="h-8 rounded-[14px] p-0.5">
                <TabsTrigger value="month" className="px-2.5 text-xs">Mes</TabsTrigger>
                <TabsTrigger value="week" className="px-2.5 text-xs">Semana</TabsTrigger>
              </TabsList>
            </Tabs>
            {view === "month" ? (
              <div className="flex shrink-0 gap-1 md:hidden">
                <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={prevMonth} className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={nextMonth} className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex shrink-0 gap-1 md:hidden">
                <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={prevWeek} className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={nextWeek} className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Tabs value={view} onValueChange={(v) => setView(v as "month" | "week")} className="mr-2 shrink-0 hidden md:block">
              <TabsList>
                <TabsTrigger value="month">
                  Mes
                </TabsTrigger>
                <TabsTrigger value="week">
                  Semana
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {view === "month" ? (
              <div className="hidden md:flex gap-1">
                <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={prevMonth} className="shrink-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={nextMonth} className="shrink-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="hidden md:flex gap-1">
                <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={prevWeek} className="shrink-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={nextWeek} className="shrink-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <Button variant="primary" data-action="create-event" size="sm" onClick={handleCreateEvent} className="col-start-2 row-start-1 h-8 w-auto flex-none justify-self-end whitespace-nowrap px-3 sm:h-9 md:col-auto md:row-auto">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="md:hidden">Nuevo</span><span className="hidden md:inline">Nuevo evento</span>
          </Button>
        </div>

        {/* Contenido principal */}
        <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-4">
          {/* Calendario */}
          <Card
            className={cn(
              "col-span-1 min-w-0 lg:col-span-3",
              isMobile
                ? "-mx-3 !rounded-none !border-0 !bg-transparent !shadow-none"
                : "glass-card overflow-hidden rounded-2xl",
            )}
          >
            <CardHeader className="calendar-header hidden flex-row flex-wrap items-center justify-between gap-2 space-y-0 px-3 py-3 md:flex">
              <CardTitle className="min-w-0 basis-full text-sm font-medium sm:basis-auto md:text-base">
                <span className="block truncate" aria-live="polite">
                  {periodLabel}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className={cn(isMobile ? "p-0" : "p-3")}>{view === "month" ? renderMonthView() : renderWeekView()}</CardContent>
          </Card>

          {/* Panel lateral */}
          {renderSidebar()}
        </div>

        {/* Diálogos */}
        <EventDialog
          open={eventDialog.isOpen}
          onOpenChange={eventDialog.setIsOpen}
          defaultValues={eventDialogDefaultValues}
          mode={editingEvent ? "edit" : "create"}
        />
        <TaskDialog
          open={editingTask !== null}
          onOpenChange={(open) => { if (!open) setEditingTask(null) }}
          defaultValues={editingTask ?? undefined}
          mode="edit"
        />

        <ConfirmationDialog
          open={!!eventToDelete}
          onOpenChange={(open) => !open && !deleteDialog.isProcessing && setEventToDelete(null)}
          title={deletingSeries ? "Eliminar serie de eventos" : "Eliminar evento"}
          description={deletingSeries
            ? `Se eliminarán «${eventPendingDeletion?.title ?? "este evento"}» y todas sus repeticiones.`
            : `Se eliminará «${eventPendingDeletion?.title ?? "este evento"}».`}
          confirmText="Eliminar"
          cancelText="Cancelar"
          onConfirm={handleDeleteEvent}
          isProcessing={deleteDialog.isProcessing}
          variant="destructive"
        />
      </TooltipProvider>
    </div>
  )
}
