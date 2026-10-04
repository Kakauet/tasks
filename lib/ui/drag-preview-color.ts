/** Composite the source and ancestor backgrounds into one opaque drag color. */
export function opaqueDragBackground(colors: string[]): string {
  let foreground = { r: 0, g: 0, b: 0, a: 0 }
  for (const color of colors) {
    if (!/^rgba?\(/i.test(color)) continue
    const channels = color.slice(color.indexOf("(") + 1, color.lastIndexOf(")"))
      .split(/[\s,/]+/).filter(Boolean).map(Number)
    if (channels.length < 3 || channels.some(value => !Number.isFinite(value))) continue
    const [r, g, b] = channels
    const alpha = Math.max(0, Math.min(1, channels[3] ?? 1))
    const nextAlpha = foreground.a + alpha * (1 - foreground.a)
    if (nextAlpha === 0) continue
    foreground = {
      r: (foreground.r * foreground.a + r * alpha * (1 - foreground.a)) / nextAlpha,
      g: (foreground.g * foreground.a + g * alpha * (1 - foreground.a)) / nextAlpha,
      b: (foreground.b * foreground.a + b * alpha * (1 - foreground.a)) / nextAlpha,
      a: nextAlpha,
    }
    if (nextAlpha >= 0.999) break
  }
  return `rgb(${Math.round(foreground.r)} ${Math.round(foreground.g)} ${Math.round(foreground.b)})`
}

export function calendarEventPreviewColor(source: Element): string {
  const colors: string[] = []
  for (let node: Element | null = source; node; node = node.parentElement) {
    colors.push(getComputedStyle(node).backgroundColor)
  }
  return opaqueDragBackground(colors)
}
