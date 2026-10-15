"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { track, trackStateChange } from "@/lib/activity"
import { createDefaultState } from "@/lib/tasks/model"
import { createHistory, recordHistory, undoHistory, redoHistory, type History, type StateProducer } from "@/lib/tasks/history"
import type { AppState } from "@/lib/tasks/types"

export function useTaskHistory() {
  const [history, setHistory] = useState(() => createHistory(createDefaultState()))
  // Commit the ref synchronously: consecutive commands must see each other's changes before rendering.
  const historyRef = useRef(history)
  const commit = useCallback((next: History) => {
    historyRef.current = next
    setHistory(next)
  }, [])
  const resetState = useCallback((state: AppState) => commit(createHistory(state)), [commit])
  const recordChange = useCallback((state: AppState) => {
    const current = historyRef.current
    const next = recordHistory(current, state)
    if (next === current) return
    trackStateChange(current.present, next.present)
    commit(next)
  }, [commit])
  const update = useCallback((producer: StateProducer) => {
    const current = historyRef.current.present
    const next = producer(current)
    if (next && next !== current) recordChange(next)
  }, [recordChange])
  const undo = useCallback(() => {
    const current = historyRef.current
    const next = undoHistory(current)
    if (next === current) return
    track("history.undo")
    trackStateChange(current.present, next.present)
    commit(next)
  }, [commit])
  const redo = useCallback(() => {
    const current = historyRef.current
    const next = redoHistory(current)
    if (next === current) return
    track("history.redo")
    trackStateChange(current.present, next.present)
    commit(next)
  }, [commit])

  // Configurar atajos de teclado para undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Solo activar si no se está escribiendo en un campo
      const target = e.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return

      const hasModifier = e.ctrlKey || e.metaKey
      if (!hasModifier || e.altKey) return
      const key = e.key.toLowerCase()

      if (key === "z" && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [undo, redo])

  return {
    present: history.present, historyRef, resetState, update, recordChange,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0, undo, redo,
  }
}
