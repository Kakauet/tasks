"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { useDragDropManager, useDragLayer } from "react-dnd"
import { TASK_DND_TYPE, type TaskDragItem } from "@/components/task-card"
import { scrollTaskColumnAtPoint } from "@/lib/ui/dnd"

interface DragSession { land: () => void; dispose: () => void }

/** The pointer uses transforms only; React never rerenders the board to move the preview. */
export function TaskDragLayer() {
  const manager = useDragDropManager()
  const session = useRef<DragSession | null>(null)
  const { active, item } = useDragLayer(monitor => ({
    active: monitor.isDragging() && monitor.getItemType() === TASK_DND_TYPE,
    item: monitor.getItem() as TaskDragItem | null,
  }))

  useLayoutEffect(() => {
    if (!active || !item) { session.current?.land(); return }
    session.current?.dispose()
    const monitor = manager.getMonitor()
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const touch = item.input === "touch"
    const layer = document.createElement("div")
    const card = item.preview
    const width = touch ? Math.min(320, item.rect.width - 16) : item.rect.width
    const height = touch ? 56 + (item.hasSubtitle ? 16 : 0) + (item.hasStepProgress ? 16 : 0) : item.rect.height
    layer.className = "task-drag-layer"
    layer.setAttribute("aria-hidden", "true")
    layer.inert = true
    layer.style.width = `${width}px`
    layer.style.height = `${height}px`
    card.classList.add("task-drag-preview")
    if (touch) card.classList.add("task-drag-preview-compact")
    card.style.width = card.style.height = "100%"
    layer.appendChild(card)
    document.body.appendChild(layer)
    document.body.classList.add("task-drag-active")
    if (touch) document.body.classList.add("task-touch-drag-active")

    let pointer = monitor.getClientOffset()
    const initial = monitor.getInitialClientOffset()
    const grab = initial ? { x: initial.x - item.rect.x, y: initial.y - item.rect.y } : { x: width / 2, y: 24 }
    const positionAt = () => {
      if (!pointer) return { x: item.rect.x, y: item.rect.y }
      const viewport = window.visualViewport
      const left = viewport?.offsetLeft ?? 0
      const top = viewport?.offsetTop ?? 0
      return touch ? {
        x: Math.max(left + 8, Math.min(left + (viewport?.width ?? innerWidth) - width - 8, pointer.x - width / 2)),
        y: Math.max(top + 8, Math.min(top + (viewport?.height ?? innerHeight) - height - 8, pointer.y - height - 28)),
      } : { x: pointer.x - grab.x, y: pointer.y - grab.y }
    }
    let position = positionAt()
    let frame = 0
    let disposed = false
    let landing = false
    let landingTarget: HTMLElement | null = null
    let lastScroll = performance.now()
    let scroller: HTMLElement | null = null
    const animations: Animation[] = []
    const transform = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0)`
    layer.style.transform = transform(position.x, position.y)
    animations.push(card.animate([
      { transform: "scale(0.96)", opacity: 0.65 }, { transform: "scale(1)", opacity: 1 },
    ], { duration: reducedMotion ? 0 : 160, easing: "cubic-bezier(.2,.8,.2,1)" }))
    const unsubscribe = monitor.subscribeToOffsetChange(() => { pointer = monitor.getClientOffset() ?? pointer })
    const scrollMouse = () => {
      if (touch || landing || disposed || !pointer) return
      const now = performance.now()
      scroller = scrollTaskColumnAtPoint(pointer, now - lastScroll, scroller)
      lastScroll = now
    }
    const dragover = (event: DragEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      scrollMouse()
    }
    document.addEventListener("dragover", dragover, true)
    // `dragover` stops firing when the cursor leaves the board. `drag` continues on the source.
    const nativeDrag = (event: DragEvent) => {
      if (event.clientX === 0 && event.clientY === 0) return
      pointer = { x: event.clientX, y: event.clientY }
      scrollMouse()
    }
    document.addEventListener("drag", nativeDrag, true)
    // Native HTML5 drag can throttle animation frames while the mouse is still.
    const scrollTimer = window.setInterval(scrollMouse, 16)

    const follow = (now: number) => {
      if (disposed || landing) return
      position = positionAt()
      layer.style.transform = transform(position.x, position.y)
      frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)
    const stop = () => {
      cancelAnimationFrame(frame)
      window.clearInterval(scrollTimer)
      scroller?.removeAttribute("data-drag-scroll")
      unsubscribe()
      document.removeEventListener("dragover", dragover, true)
      document.removeEventListener("drag", nativeDrag, true)
      document.body.classList.remove("task-drag-active", "task-touch-drag-active")
    }
    const dispose = () => {
      if (disposed) return
      disposed = true
      stop()
      landingTarget?.removeAttribute("data-drag-landing")
      animations.forEach(animation => animation.cancel())
      layer.remove()
    }
    const land = () => {
      if (disposed || landing) return
      landing = true
      stop()
      const findTarget = () => [...document.querySelectorAll<HTMLElement>("[data-task-id]")].find(node => {
        if (node.dataset.taskId !== item.id) return false
        const rect = node.getBoundingClientRect()
        const clip = node.closest(".task-column-scroll")?.getBoundingClientRect()
        return rect.width > 0 && rect.top >= (clip?.top ?? 0) && rect.bottom <= (clip?.bottom ?? innerHeight)
      })
      // Hide before the first paint; otherwise the committed card flashes under the preview.
      landingTarget = findTarget() ?? null
      landingTarget?.setAttribute("data-drag-landing", "true")
      // Wait for the committed move and the destination column to render.
      frame = requestAnimationFrame(() => {
        if (disposed) return
        const target = findTarget()
        if (target !== landingTarget) landingTarget?.removeAttribute("data-drag-landing")
        const tab = document.querySelector<HTMLElement>(`[data-mobile-column-status="${item.dropStatus ?? item.status}"]`)
        const targetRect = (target ?? tab)?.getBoundingClientRect()
        if (target) {
          landingTarget = target
          target.setAttribute("data-drag-landing", "true")
          const full = target.cloneNode(true) as HTMLElement
          full.removeAttribute("data-task-id")
          full.removeAttribute("data-drag-landing")
          full.removeAttribute("data-dragging")
          full.removeAttribute("data-drop-placement")
          full.removeAttribute("id")
          full.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"))
          full.classList.add("task-drag-preview")
          full.style.cssText = `position:absolute;inset:0;width:${targetRect!.width}px;height:${targetRect!.height}px;transform-origin:top left`
          layer.appendChild(full)
          animations.push(full.animate([
            { opacity: 0, transform: `scale(${width / targetRect!.width}, ${height / targetRect!.height})` },
            { opacity: 1, transform: "scale(1)", boxShadow: getComputedStyle(target).boxShadow },
          ], { duration: reducedMotion ? 0 : 180, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }))
        }
        animations.push(card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion ? 0 : 140, fill: "forwards" }))
        const destination = targetRect && targetRect.width > 0
          ? { x: target ? targetRect.x : targetRect.x + targetRect.width / 2 - width / 2, y: targetRect.y }
          : position
        const animation = layer.animate([
          { transform: transform(position.x, position.y) },
          { transform: transform(destination.x, destination.y) },
        ], { duration: reducedMotion ? 0 : 180, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" })
        animations.push(animation)
        void animation.finished.then(dispose, dispose)
      })
    }
    session.current = { land, dispose }
  }, [active, item, manager])

  useEffect(() => () => session.current?.dispose(), [])
  return null
}
