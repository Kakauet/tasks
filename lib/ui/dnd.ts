export const TOUCH_DRAG_HOLD_MS = 320
export const MOBILE_COLUMN_DWELL_MS = 450
export const TOUCH_DRAG_SLOP = 10

export function exceedsTouchSlop(start: { x: number; y: number }, point: { x: number; y: number }) {
  return Math.hypot(point.x - start.x, point.y - start.y) > TOUCH_DRAG_SLOP
}

/** Pixels per second. Outside the list, keep scrolling at full speed. */
export function dragScrollVelocity(y: number, top: number, bottom: number) {
  if (bottom <= top) return 0
  const edge = Math.min(80, (bottom - top) / 3)
  const proximity = y < top + edge ? -Math.min(1, (top + edge - y) / edge)
    : y > bottom - edge ? Math.min(1, (y - bottom + edge) / edge) : 0
  return Math.sign(proximity) * Math.abs(proximity) ** 1.7 * 780
}

/** Horizontal position chooses the column; vertical position controls its scroll. */
export function nearestColumnIndex(x: number, bounds: Array<{ left: number; right: number }>, previous = -1) {
  let winner = -1
  let distance = Infinity
  bounds.forEach((bound, index) => {
    const gap = Math.max(bound.left - x, x - bound.right, 0)
    if (gap < distance || (gap === distance && index === previous)) {
      distance = gap
      winner = index
    }
  })
  return winner
}

/** Resolve only visible lists, even when the pointer is over a header or outside the board. */
export function scrollTaskColumnAtPoint(point: { x: number; y: number }, elapsedMs: number, previous?: HTMLElement | null) {
  const columns = [...document.querySelectorAll<HTMLElement>(".task-column-scroll")]
    .map(node => ({ node, rect: node.getBoundingClientRect() }))
    .filter(({ node, rect }) => node.isConnected && rect.width > 0 && rect.height > 0)
  const previousIndex = columns.findIndex(({ node }) => node === previous)
  const index = nearestColumnIndex(point.x, columns.map(({ rect }) => ({ left: rect.left, right: rect.right })), previousIndex)
  const selected = columns[index]
  if (previous && previous !== selected?.node) previous.removeAttribute("data-drag-scroll")
  if (!selected) return null
  const velocity = dragScrollVelocity(point.y, selected.rect.top, selected.rect.bottom)
  const canScroll = velocity < 0 ? selected.node.scrollTop > 0
    : velocity > 0 ? selected.node.scrollTop + selected.node.clientHeight < selected.node.scrollHeight - 1 : false
  if (canScroll) {
    selected.node.scrollTop += velocity * Math.min(elapsedMs, 48) / 1000
    selected.node.dataset.dragScroll = velocity < 0 ? "up" : "down"
  } else {
    selected.node.removeAttribute("data-drag-scroll")
  }
  return selected.node
}

/** A dead band around the midpoint prevents flicker from small finger movements. */
export function dropSide(y: number, top: number, height: number, previous: "before" | "after" | null) {
  const middle = top + height / 2
  if (previous && Math.abs(y - middle) < Math.min(12, height / 5)) return previous
  return y > middle ? "after" : "before"
}
