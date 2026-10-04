import type { BackendFactory, Identifier, XYCoord } from "dnd-core"
import { HTML5Backend } from "react-dnd-html5-backend"
import { TouchBackend } from "react-dnd-touch-backend"
import { exceedsTouchSlop, scrollTaskColumnAtPoint, TOUCH_DRAG_HOLD_MS } from "./dnd"

/** Task touches have one owner from press through drop. Other DnD types retain their backend. */
export const TaskTouchBackend: BackendFactory = (manager, context, options) => {
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  const delegate = (coarse ? TouchBackend : HTML5Backend)(manager, context, coarse
    ? { ...options, enableMouseEvents: true, enableKeyboardEvents: true, delayTouchStart: TOUCH_DRAG_HOLD_MS, touchSlop: 5 }
    : options)
  const sources = new Map<Identifier, HTMLElement>()
  const targets = new Map<Identifier, HTMLElement>()
  const monitor = manager.getMonitor()
  const actions = manager.getActions()
  let gesture: { id: number; source: Identifier; node: HTMLElement; start: XYCoord; point: XYCoord; active: boolean } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let frame = 0
  let lastTime = 0
  let suppressClickUntil = 0
  let scroller: HTMLElement | null = null

  const hitTest = () => {
    if (!gesture) return
    const { point } = gesture
    const hit = document.elementFromPoint(point.x, point.y)
    // The source is a neutral zone: lifting and releasing it must not reorder it.
    const ownCard = hit?.closest<HTMLElement>("[data-task-id]")?.dataset.taskId === monitor.getItem()?.id
    const ids = !hit || ownCard ? [] : [...targets]
      .filter(([, node]) => node.isConnected && node.contains(hit))
      .sort(([, a], [, b]) => a === b ? 0 : a.contains(b) ? -1 : 1)
      .map(([id]) => id)
    actions.hover(ids, { clientOffset: point })
  }

  const tick = (now: number) => {
    if (!gesture?.active) return
    const delta = now - lastTime
    lastTime = now
    const { point } = gesture
    scroller = scrollTaskColumnAtPoint(point, delta, scroller)
    // Recompute even with a stationary finger after auto-scroll or a column switch.
    hitTest()
    frame = requestAnimationFrame(tick)
  }

  const finish = (commit: boolean) => {
    clearTimeout(timer)
    cancelAnimationFrame(frame)
    scroller?.removeAttribute("data-drag-scroll")
    scroller = null
    if (!gesture) return
    const current = gesture
    current.node.closest("[data-task-id]")?.removeAttribute("data-drag-press")
    if (current.active && monitor.isDragging()) {
      if (commit) hitTest()
      gesture = null
      suppressClickUntil = Date.now() + 500
      try {
        if (commit) actions.drop()
      } finally {
        actions.endDrag()
      }
    } else {
      gesture = null
    }
  }

  const start = (event: TouchEvent) => {
    if (gesture) {
      event.stopPropagation()
      finish(false)
      return
    }
    if (event.touches.length !== 1 || monitor.isDragging() || !(event.target instanceof Element)) return
    const surface = event.target.closest("[data-task-drag-surface]")
    if (!surface) return
    const source = [...sources].find(([id, node]) => manager.getRegistry().getSourceType(id) === "TASK_CARD" &&
      node.closest("[data-task-id]") === surface)
    if (!source || !monitor.canDragSource(source[0])) return
    // Leave default scrolling intact until the hold has completed.
    event.stopPropagation()
    const touch = event.touches[0]
    const point = { x: touch.clientX, y: touch.clientY }
    gesture = { id: touch.identifier, source: source[0], node: source[1], start: point, point, active: false }
    source[1].closest("[data-task-id]")?.setAttribute("data-drag-press", "true")
    timer = setTimeout(() => {
      if (!gesture || !gesture.node.isConnected || !monitor.canDragSource(gesture.source)) return finish(false)
      const rect = gesture.node.getBoundingClientRect()
      actions.beginDrag([gesture.source], { clientOffset: gesture.point, getSourceClientOffset: () => ({ x: rect.x, y: rect.y }) })
      if (!monitor.isDragging()) return finish(false)
      gesture.active = true
      const item = monitor.getItem()
      item.input = "touch"
      gesture.node.closest("[data-task-id]")?.removeAttribute("data-drag-press")
      window.getSelection()?.removeAllRanges()
      try { navigator.vibrate?.(12) } catch { /* Haptics are optional. */ }
      hitTest()
      lastTime = performance.now()
      frame = requestAnimationFrame(tick)
    }, TOUCH_DRAG_HOLD_MS)
  }

  const move = (event: TouchEvent) => {
    if (!gesture) return
    event.stopPropagation()
    const touch = Array.from(event.touches).find(touch => touch.identifier === gesture!.id)
    if (!touch || event.touches.length !== 1) return finish(false)
    gesture.point = { x: touch.clientX, y: touch.clientY }
    if (!gesture.active) {
      if (exceedsTouchSlop(gesture.start, gesture.point)) finish(false)
      return
    }
    if (event.cancelable) event.preventDefault()
  }
  const end = (event: TouchEvent) => {
    if (!gesture) return
    event.stopPropagation()
    if (gesture.active && event.cancelable) event.preventDefault()
    const touch = Array.from(event.changedTouches).find(touch => touch.identifier === gesture!.id)
    if (touch) gesture.point = { x: touch.clientX, y: touch.clientY }
    finish(event.type === "touchend" && !!touch)
  }
  const cancel = () => finish(false)
  const visibility = () => { if (document.hidden) cancel() }
  const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") cancel() }
  const click = (event: MouseEvent) => {
    if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation() }
  }
  const contextMenu = (event: MouseEvent) => {
    if (gesture) { event.preventDefault(); event.stopPropagation() }
  }

  return {
    setup() {
      window.addEventListener("touchstart", start, { capture: true, passive: false })
      window.addEventListener("touchmove", move, { capture: true, passive: false })
      window.addEventListener("touchend", end, { capture: true, passive: false })
      window.addEventListener("touchcancel", end, { capture: true, passive: false })
      window.addEventListener("blur", cancel)
      window.addEventListener("resize", cancel)
      window.addEventListener("keydown", keydown, true)
      window.addEventListener("click", click, true)
      window.addEventListener("contextmenu", contextMenu, true)
      document.addEventListener("visibilitychange", visibility)
      delegate.setup()
    },
    teardown() {
      cancel()
      window.removeEventListener("touchstart", start, true)
      window.removeEventListener("touchmove", move, true)
      window.removeEventListener("touchend", end, true)
      window.removeEventListener("touchcancel", end, true)
      window.removeEventListener("blur", cancel)
      window.removeEventListener("resize", cancel)
      window.removeEventListener("keydown", keydown, true)
      window.removeEventListener("click", click, true)
      window.removeEventListener("contextmenu", contextMenu, true)
      document.removeEventListener("visibilitychange", visibility)
      delegate.teardown()
    },
    connectDragSource(id, node, config) {
      sources.set(id, node)
      const disconnect = delegate.connectDragSource(id, node, config)
      return () => {
        sources.delete(id)
        if (gesture?.source === id) finish(false)
        disconnect()
      }
    },
    connectDropTarget(id, node, config) {
      targets.set(id, node)
      const disconnect = delegate.connectDropTarget(id, node, config)
      return () => { targets.delete(id); disconnect() }
    },
    connectDragPreview: (id, node, config) => delegate.connectDragPreview(id, node, config),
    profile: () => delegate.profile(),
  }
}
