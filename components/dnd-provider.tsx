"use client"

import { useContext, type ReactNode } from "react"
import { DndContext, DndProvider } from "react-dnd"
import { TaskTouchBackend } from "@/lib/ui/task-touch-backend"

interface DragDropProviderProps {
  children: ReactNode
}

export function DragDropProvider({ children }: DragDropProviderProps) {
  const { dragDropManager } = useContext(DndContext)
  // Dialog portals retain React context; reuse the board's backend for steps.
  if (dragDropManager) return <>{children}</>
  return (
    <DndProvider backend={TaskTouchBackend}>
      {children}
    </DndProvider>
  )
}
