"use client"

import { useEffect } from "react"

// Mobile keyboards can resize the visual viewport without resizing the layout.
export function MobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    let frame = 0
    let last = ""
    // Viewport scroll events fire on every frame of a scroll; each change to these
    // variables restyles the whole page, so write at most once a frame and only on change.
    const write = () => {
      frame = 0
      const next = `${viewport.height}|${viewport.offsetTop}`
      if (next === last) return
      last = next
      root.style.setProperty("--visible-height", `${viewport.height}px`)
      root.style.setProperty("--visible-top", `${viewport.offsetTop}px`)
    }
    const update = () => { if (!frame) frame = requestAnimationFrame(write) }
    write()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
      cancelAnimationFrame(frame)
      root.style.removeProperty("--visible-height")
      root.style.removeProperty("--visible-top")
    }
  }, [])
  return null
}
