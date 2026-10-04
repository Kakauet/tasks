"use client"

import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react"
import { useDrag, useDrop, type DragSourceMonitor } from "react-dnd"
import { getEmptyImage } from "react-dnd-html5-backend"
import type { Event } from "@/context/task-context"
import { entityKey, track } from "@/lib/activity"
import { cn } from "@/lib/utils"
import { calendarEventPreviewColor } from "@/lib/ui/drag-preview-color"

export const CALENDAR_EVENT_DND_TYPE = "CALENDAR_EVENT"

export interface CalendarEventDragItem {
  type: typeof CALENDAR_EVENT_DND_TYPE
  id: string
  eventStartDate: string
  anchorDate: string
  preview: HTMLElement
  rect: { x: number; y: number; width: number; height: number }
  dropDate?: string
}

/** Moving a middle segment preserves the event's full multi-day duration. */
export function movedEventStartDate(startDate: string, anchorDate: string, targetDate: string) {
  const offset = differenceInCalendarDays(parseISO(targetDate), parseISO(anchorDate))
  return format(addDays(parseISO(startDate), offset), "yyyy-MM-dd")
}

interface EventSurfaceProps extends Omit<ComponentPropsWithoutRef<"div">, "onClick" | "onKeyDown"> {
  event: Event
  anchorDate: string
  onOpen: (event: Event) => void
  actionLabel?: string
  children: ReactNode
}

export const CalendarEventDragSurface = forwardRef<HTMLDivElement, EventSurfaceProps>(function CalendarEventDragSurface({ event, anchorDate, onOpen, actionLabel, className, style, children, ...triggerProps }, forwardedRef) {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const suppressClickUntil = useRef(0)
  const startedAt = useRef(0)

  const createItem = useCallback((): CalendarEventDragItem | null => {
    const node = nodeRef.current
    if (!node) return null
    const rect = node.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const appearance = getComputedStyle(node)
    const preview = node.cloneNode(true) as HTMLElement
    preview.removeAttribute("id")
    preview.removeAttribute("data-calendar-event-id")
    preview.removeAttribute("data-calendar-anchor-date")
    preview.removeAttribute("data-calendar-dragging")
    preview.querySelectorAll("[id]").forEach(child => child.removeAttribute("id"))
    preview.querySelectorAll("[draggable]").forEach(child => child.removeAttribute("draggable"))
    preview.inert = true
    preview.style.backgroundColor = calendarEventPreviewColor(node)
    preview.style.borderRadius = "10px"
    preview.style.color = appearance.color
    preview.style.fontFamily = appearance.fontFamily
    preview.style.fontSize = appearance.fontSize
    preview.style.fontWeight = appearance.fontWeight
    preview.style.lineHeight = appearance.lineHeight
    preview.style.opacity = "1"
    startedAt.current = performance.now()
    track("event.drag_start", { entity: entityKey(event.id), anchorOffset: differenceInCalendarDays(parseISO(anchorDate), parseISO(event.date)), multiDay: !!event.isMultiDay })
    return { type: CALENDAR_EVENT_DND_TYPE, id: event.id, eventStartDate: event.date, anchorDate,
      preview, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
  }, [event.id, event.date, event.isMultiDay, anchorDate])

  const endDrag = useCallback((item: CalendarEventDragItem, monitor: DragSourceMonitor) => {
    suppressClickUntil.current = Date.now() + 250
    track("event.drag_end", {
      entity: entityKey(item.id), dropped: monitor.didDrop(),
      dayOffset: item.dropDate ? differenceInCalendarDays(parseISO(item.dropDate), parseISO(item.anchorDate)) : 0,
      durationMs: Math.round(performance.now() - startedAt.current),
    })
  }, [])

  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: CALENDAR_EVENT_DND_TYPE,
    item: createItem,
    end: endDrag,
    collect: monitor => ({ isDragging: monitor.isDragging() }),
  }), [createItem, endDrag])

  useLayoutEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true })
  }, [preview])

  const wasDragging = useRef(false)
  useEffect(() => {
    if (isDragging && !wasDragging.current && window.matchMedia("(pointer: coarse)").matches) {
      try { navigator.vibrate?.(18) } catch { /* optional haptic feedback */ }
    }
    wasDragging.current = isDragging
  }, [isDragging])

  const setNode = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node
    drag(node)
    if (typeof forwardedRef === "function") forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [drag, forwardedRef])

  return <div
    {...triggerProps}
    ref={setNode}
    className={cn("calendar-event-drag-surface", className)}
    style={style}
    data-calendar-event-id={event.id}
    data-calendar-anchor-date={anchorDate}
    data-calendar-dragging={isDragging ? "true" : undefined}
    role="button"
    tabIndex={0}
    aria-label={actionLabel ?? `Ver detalle de ${event.title}. Arrastrar para mover de fecha.`}
    onClick={click => { click.stopPropagation(); if (Date.now() >= suppressClickUntil.current) onOpen(event) }}
    onKeyDown={key => {
      if (key.key === "Enter" || key.key === " ") {
        key.preventDefault(); key.stopPropagation(); onOpen(event)
      }
    }}
  >{children}</div>
})

export function CalendarDropDay({ date, className, children, onSelect, onMove }: {
  date: Date
  className?: string
  children: ReactNode
  onSelect: () => void
  onMove: (item: CalendarEventDragItem, date: Date) => void
}) {
  const dateKey = format(date, "yyyy-MM-dd")
  const [{ isOver }, drop] = useDrop<CalendarEventDragItem, { date: string }, { isOver: boolean }>(() => ({
    accept: CALENDAR_EVENT_DND_TYPE,
    drop: (item, monitor) => {
      if (!monitor.didDrop()) {
        item.dropDate = dateKey
        onMove(item, date)
      }
      return { date: dateKey }
    },
    collect: monitor => ({ isOver: monitor.isOver({ shallow: true }) }),
  }), [date, dateKey, onMove])

  return <div
    ref={node => { drop(node) }}
    className={cn(className, isOver && "calendar-drop-target")}
    data-calendar-drop-date={dateKey}
    tabIndex={0}
    role="group"
    aria-label={format(date, "EEEE d MMMM yyyy", { locale: es })}
    onClick={onSelect}
    onKeyDown={key => {
      if (key.target === key.currentTarget && (key.key === "Enter" || key.key === " ")) {
        key.preventDefault(); onSelect()
      }
    }}
  >{children}</div>
}
