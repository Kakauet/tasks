"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { useDragDropManager, useDragLayer } from "react-dnd"
import { CALENDAR_EVENT_DND_TYPE, type CalendarEventDragItem } from "@/components/calendar/calendar-event-dnd"

interface DragSession {
  land: () => void
  dispose: () => void
}

/** Move the captured event at display refresh rate without rerendering the calendar. */
export function CalendarEventDragLayer() {
  const manager = useDragDropManager()
  const session = useRef<DragSession | null>(null)
  const { active, item } = useDragLayer(monitor => ({
    active: monitor.isDragging() && monitor.getItemType() === CALENDAR_EVENT_DND_TYPE,
    item: monitor.getItem() as CalendarEventDragItem | null,
  }))

  useLayoutEffect(() => {
    if (!active || !item) {
      session.current?.land()
      return
    }

    session.current?.dispose()
    const monitor = manager.getMonitor()
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const layer = document.createElement("div")
    const card = item.preview
    layer.className = "calendar-event-drag-layer"
    layer.setAttribute("aria-hidden", "true")
    layer.inert = true
    layer.style.width = `${item.rect.width}px`
    layer.style.height = `${item.rect.height}px`
    layer.style.borderRadius = "10px"
    card.classList.add("calendar-event-drag-preview")
    card.style.width = "100%"
    card.style.height = "100%"
    layer.appendChild(card)

    let pointer = monitor.getClientOffset()
    const initialPointer = monitor.getInitialClientOffset()
    const initialSource = monitor.getInitialSourceClientOffset()
    const grab = initialPointer && initialSource
      ? { x: initialPointer.x - initialSource.x, y: initialPointer.y - initialSource.y }
      : { x: item.rect.width / 2, y: 24 }
    card.style.transformOrigin = `${grab.x}px ${grab.y}px`
    let position = { x: item.rect.x, y: item.rect.y }
    let frame = 0
    let disposed = false
    let landing = false
    let landingTarget: HTMLElement | null = null
    let landingAnimation: Animation | null = null
    const transform = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0)`
    layer.style.transform = transform(position.x, position.y)
    document.body.appendChild(layer)
    document.body.classList.add("calendar-event-drag-active")

    const liftAnimation = card.animate(
      [{ transform: "scale(1)", boxShadow: "0 1px 2px rgb(0 0 0 / 0.08)" },
        { transform: "scale(1.025)", boxShadow: "0 24px 64px rgb(0 0 0 / 0.24), 0 4px 12px rgb(0 0 0 / 0.12)" }],
      { duration: reducedMotion ? 0 : 113, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" },
    )

    const unsubscribe = monitor.subscribeToOffsetChange(() => { pointer = monitor.getClientOffset() ?? pointer })
    const onDragOver = (event: DragEvent) => { pointer = { x: event.clientX, y: event.clientY } }
    document.addEventListener("dragover", onDragOver, true)

    const followPointer = () => {
      if (disposed || landing) return
      if (pointer) {
        position = { x: pointer.x - grab.x, y: pointer.y - grab.y }
        layer.style.transform = transform(position.x, position.y)

        // Keep the calendar usable while an event is held near the viewport edge.
        const scroller = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("#main-content")
        if (scroller) {
          const bounds = scroller.getBoundingClientRect()
          const edge = 48
          const distance = pointer.y < bounds.top + edge ? pointer.y - bounds.top - edge
            : pointer.y > bounds.bottom - edge ? pointer.y - bounds.bottom + edge : 0
          if (distance) scroller.scrollTop += Math.max(-14, Math.min(14, distance / 3))
        }
      }
      frame = requestAnimationFrame(followPointer)
    }
    frame = requestAnimationFrame(followPointer)

    const stopFollowing = () => {
      cancelAnimationFrame(frame)
      unsubscribe()
      document.removeEventListener("dragover", onDragOver, true)
      document.body.classList.remove("calendar-event-drag-active")
    }
    const dispose = () => {
      if (disposed) return
      disposed = true
      stopFollowing()
      landingTarget?.removeAttribute("data-calendar-drag-landing")
      landingAnimation?.cancel()
      liftAnimation.cancel()
      layer.remove()
    }
    const land = () => {
      if (disposed || landing) return
      landing = true
      stopFollowing()

      const findTarget = () => {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-calendar-event-id]"))
          .filter(node => node.dataset.calendarEventId === item.id && node.getBoundingClientRect().width > 0)
        if (item.dropDate) {
          const exact = candidates.find(node => node.dataset.calendarAnchorDate === item.dropDate)
          if (exact) return exact
        }
        return candidates.sort((a, b) => {
          const aRect = a.getBoundingClientRect()
          const bRect = b.getBoundingClientRect()
          return Math.hypot(aRect.x-position.x,aRect.y-position.y)-Math.hypot(bRect.x-position.x,bRect.y-position.y)
        })[0] ?? null
      }
      landingTarget = findTarget()
      if (landingTarget) landingTarget.setAttribute("data-calendar-drag-landing", "true")

      frame = requestAnimationFrame(() => {
        if (disposed) return
        // A move to another day may mount a new event in the same render batch.
        const committedTarget = findTarget()
        if (committedTarget !== landingTarget) {
          landingTarget?.removeAttribute("data-calendar-drag-landing")
          landingTarget = committedTarget
          landingTarget?.setAttribute("data-calendar-drag-landing", "true")
        }
        const targetRect = landingTarget?.getBoundingClientRect()
        const target = targetRect && targetRect.width > 0 ? targetRect : null
        const mobileTarget = !target && item.dropDate
          ? document.querySelector<HTMLElement>(`[data-calendar-drop-date="${item.dropDate}"]`)?.getBoundingClientRect() : null
        const x = target?.x ?? (mobileTarget ? mobileTarget.x + mobileTarget.width / 2 - item.rect.width / 2 : position.x)
        const y = target?.y ?? (mobileTarget ? mobileTarget.y : position.y)
        const scale = target ? target.width / item.rect.width : 0.94
        const currentStyle = getComputedStyle(card)
        const currentScale = currentStyle.transform
        const currentShadow = currentStyle.boxShadow
        liftAnimation.cancel()
        card.animate([{ transform: currentScale, boxShadow: currentShadow }, { transform: "scale(1)", boxShadow: "0 1px 2px rgb(0 0 0 / 0.04)" }],
          { duration: reducedMotion ? 0 : 147, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" })
        landingAnimation = layer.animate([
          { transform: transform(position.x, position.y), opacity: 1 },
          { transform: `${transform(x, y)} scale(${scale})`, opacity: 1 },
        ], { duration: reducedMotion ? 0 : 160, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" })
        void landingAnimation.finished.then(dispose, dispose)
      })
    }

    session.current = { land, dispose }
  }, [active, item, manager])

  useEffect(() => () => session.current?.dispose(), [])
  return null
}
