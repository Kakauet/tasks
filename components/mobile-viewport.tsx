"use client"

import { useEffect } from "react"

// Mobile keyboards can resize the visual viewport without resizing the layout.
export function MobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    const update = () => {
      root.style.setProperty("--visible-height", `${viewport.height}px`)
      root.style.setProperty("--visible-top", `${viewport.offsetTop}px`)
    }
    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
      root.style.removeProperty("--visible-height")
      root.style.removeProperty("--visible-top")
    }
  }, [])
  return null
}
