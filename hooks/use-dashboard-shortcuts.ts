"use client"

import { useEffect, useState } from "react"

type View = "board" | "calendar"

/**
 * Single-key shortcuts, active only when the user is not typing or inside a dialog.
 * Browser-reserved combinations (Ctrl+N, Ctrl+H, Alt+Tab…) cannot be intercepted reliably.
 */
export function useDashboardShortcuts(activeView: View, setActiveView: (view: View) => void, showHelp: () => void) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingAction) return
    const trigger = () => {
      const button = document.querySelector<HTMLButtonElement>(`button[data-action="${pendingAction}"]`)
      if (!button || button.disabled) return false
      button.click()
      setPendingAction(null)
      return true
    }
    if (trigger()) return
    // Wait for the actual lazy-loaded view, not an arbitrary 70/100ms timeout.
    const observer = new MutationObserver(() => { if (trigger()) observer.disconnect() })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [pendingAction, activeView])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (event.defaultPrevented || event.repeat) return
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))) return
      if (event.ctrlKey || event.metaKey || event.altKey) return

      const key = event.key.toLowerCase()
      const run = (action: () => void) => { event.preventDefault(); action() }

      if (key === "?") run(showHelp)
      else if (key === "n") run(() => { setActiveView("board"); setPendingAction("create-task") })
      else if (key === "e") run(() => { setActiveView("calendar"); setPendingAction("create-event") })
      else if (key === "1") run(() => setActiveView("board"))
      else if (key === "2") run(() => setActiveView("calendar"))
      else if (key === "v") run(() => setActiveView(activeView === "board" ? "calendar" : "board"))
      else if (key === "t" && activeView === "calendar") run(() => window.dispatchEvent(new Event("goToToday")))
      else if (key === "/") {
        const input = document.querySelector<HTMLInputElement>('input[type="search"]')
        if (input) run(() => input.focus())
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeView, setActiveView, showHelp])
}
