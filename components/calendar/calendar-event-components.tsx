"use client"

import type { Event, Task, TaskTag } from "@/context/task-context"
import { cn } from "@/lib/utils"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"

// UI Components
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LinkifiedText } from "@/components/ui/linkified-text"
import { TagBadge } from "@/components/ui/tag-badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// Icons
import { CalendarDays, Clock, Trash2 } from "lucide-react"
import { CalendarEventDragSurface } from "./calendar-event-dnd"

/**
 * Componente para renderizar un evento de un solo día
 */
export function SingleDayEvent({ event, onOpen }: { event: Event; onOpen: (event: Event) => void }) {
  const eventColor = event.color
  const resolvedEventColor = eventColor ?? "hsl(var(--event-default))"
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <CalendarEventDragSurface
            event={event}
            anchorDate={event.date}
            onOpen={onOpen}
            className="calendar-event flex min-w-0 cursor-grab items-center gap-1 border px-1.5 py-0.5 text-xs active:cursor-grabbing"
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
            <CalendarDays className="h-3 w-3 shrink-0 opacity-90" />
            <span className="calendar-event-title-fade">
              {event.startTime && !event.isAllDay ? `${event.startTime} · ` : ""}
              {event.title}
            </span>
            {event.recurrence && <span className="shrink-0 opacity-80">↻</span>}
          </CalendarEventDragSurface>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="glass">
          <div className="text-xs space-y-1">
            <p className="font-bold">{event.title}</p>
            {event.startTime && !event.isAllDay && (
              <p>
                {event.startTime} - {event.endTime || "?"}
              </p>
            )}
            {event.isAllDay && <p>Todo el día</p>}
            {event.description && <LinkifiedText text={event.description} as="p" maxLinkLength={38} />}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Componente para renderizar un evento de varios días
 */
export function MultiDayEvent({
  event,
  position,
  anchorDate,
  onOpen,
}: {
  event: Event
  position: "start" | "middle" | "end" | null
  anchorDate: string
  onOpen: (event: Event) => void
}) {
  const eventColor = event.color
  const resolvedEventColor = eventColor ?? "hsl(var(--event-default))"
  return (
    <CalendarEventDragSurface
      event={event}
      anchorDate={anchorDate}
      onOpen={onOpen}
      className={cn(
        "flex h-6 min-w-0 items-center gap-1 overflow-hidden px-2 py-1 text-xs text-white select-none",
        position === "start" && "multi-day-event-start -mr-2.5 w-[calc(100%+0.625rem)]",
        position === "middle" && "multi-day-event-middle -mx-2.5 w-[calc(100%+1.25rem)] rounded-none",
        position === "end" && "multi-day-event-end -ml-2.5 w-[calc(100%+0.625rem)]",
        position === null && "w-full rounded-sm",
        "cursor-grab active:cursor-grabbing",
      )}
      style={{
        backgroundColor: resolvedEventColor,
        boxShadow:
          position === "start" || position === "end"
            ? "0 0 0 1px rgba(255,255,255,0.06) inset, 0 1px 2px rgba(0,0,0,0.16)"
            : "0 1px 2px rgba(0,0,0,0.12)",
        borderWidth: "0",
        zIndex: position === "start" ? 2 : position === "end" ? 2 : 1,
      }}
    >
      {position === "start" && (
        <>
          <CalendarDays className="h-3 w-3 shrink-0" />
          <span className="calendar-event-title-fade">{event.title}</span>
        </>
      )}
    </CalendarEventDragSurface>
  )
}

/**
 * Componente para renderizar una tarea en el calendario
 */
export function TaskItem({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  return (
    <div
      className="calendar-event cursor-pointer truncate border border-[hsl(var(--status-success)/0.24)] bg-[hsl(var(--status-success-soft)/0.65)] py-1 pl-1.5 pr-1 text-xs select-none hover:brightness-110"
      role="button"
      tabIndex={0}
      aria-label={`Abrir tarea ${task.title}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onOpen(task)
      }}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          onOpen(task)
        }
      }}
      style={{
        borderLeftColor:
          task.priority === "high"
            ? "hsl(var(--status-danger))"
            : task.priority === "medium"
              ? "hsl(var(--status-caution))"
              : "hsl(var(--status-success))",
        borderLeftWidth: "2px",
      }}
    >
      {task.title}
    </div>
  )
}

/**
 * Componente para renderizar el detalle de un evento
 */
export function EventDetail({
  event,
  tags,
  onOpen,
  onDelete,
}: {
  event: Event
  tags: TaskTag[]
  onOpen: (event: Event) => void
  onDelete: (eventId: string) => void
}) {
  const eventTags = event.tags ? tags.filter((tag) => event.tags.includes(tag.id)) : []

  return (
    <div
      className="calendar-event-clickable card-hover-effect glass cursor-pointer rounded-lg border p-3 hover:bg-muted/50 select-none"
      onClick={() => onOpen(event)}
      tabIndex={0}
      role="button"
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault()
          onOpen(event)
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium" style={{ color: event.color || "hsl(var(--event-default))" }}>
            {event.title}
          </h4>
          {event.isMultiDay && event.endDate && (
            <div className="text-xs flex items-center text-muted-foreground mt-1">
              <CalendarDays className="h-3 w-3 mr-1" />
              <span>
                {format(parseISO(event.date), "d MMM", { locale: es })} -
                {format(parseISO(event.endDate), "d MMM", { locale: es })}
              </span>
            </div>
          )}
          {event.startTime && !event.isAllDay && (
            <div className="text-xs flex items-center text-muted-foreground mt-1">
              <Clock className="h-3 w-3 mr-1" />
              <span>
                {event.startTime} - {event.endTime || "?"}
              </span>
            </div>
          )}
          {event.isAllDay && <div className="text-xs text-muted-foreground mt-1">Todo el día</div>}
          {event.description && (
            <LinkifiedText text={event.description} as="p" className="text-sm text-muted-foreground" maxLinkLength={48} />
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
          {eventTags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {eventTags.map((tag) => (
                <TagBadge key={tag.id} id={tag.id} name={tag.name} color={tag.color} size="sm" />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-start">
          {event.isGraded && (
            <Badge variant="outline" className="ml-2">
              {event.grade ? `Nota: ${event.grade}` : "Sin calificar"}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 h-8 w-8 rounded-lg p-0 hover:bg-transparent"
            aria-label={`Eliminar evento ${event.title}`}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(event.id)
            }}
          >
            <Trash2 className="h-4 w-4 text-[hsl(var(--status-danger))]" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Componente para renderizar el detalle de una tarea
 */
export function TaskDetail({ task, tags, onOpen }: { task: Task; tags: TaskTag[]; onOpen: (task: Task) => void }) {
  const taskTags = task.tags ? tags.filter((tag) => task.tags.includes(tag.id)) : []

  return (
    <div className="glass card-hover-effect cursor-pointer rounded-lg border p-3 hover:bg-muted/50 select-none"
      role="button" tabIndex={0} aria-label={`Abrir tarea ${task.title}`}
      onClick={() => onOpen(task)}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault()
          onOpen(task)
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium">{task.title}</h4>
          {task.description && (
            <LinkifiedText text={task.description} as="p" className="text-sm text-muted-foreground" maxLinkLength={48} />
          )}
          {taskTags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {taskTags.map((tag) => (
                <TagBadge key={tag.id} id={tag.id} name={tag.name} color={tag.color} size="sm" />
              ))}
            </div>
          )}
        </div>
        <Badge
          variant={task.status === "done" ? "default" : task.status === "inProgress" ? "secondary" : "outline"}
          className="ml-2"
        >
          {task.status === "todo" ? "Por hacer" : task.status === "inProgress" ? "En progreso" : "Completada"}
        </Badge>
      </div>
    </div>
  )
}
