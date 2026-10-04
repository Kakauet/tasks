"use client"

import { useEffect } from "react"
import { useDrop } from "react-dnd"
import { TASK_DND_TYPE, type TaskDragItem } from "@/components/task-card"
import { useTaskContext, type TaskStatus } from "@/context/task-context"
import { MOBILE_COLUMN_DWELL_MS } from "@/lib/ui/dnd"

/** Tabs and the dock share exactly the same destination and dwell semantics. */
export function useTaskColumnTarget(status: TaskStatus, active: boolean, onSelect: (status: TaskStatus) => void) {
  const { moveTask } = useTaskContext()
  const [{ isOver, canDrop }, drop] = useDrop<TaskDragItem, void, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: TASK_DND_TYPE,
    drop: item => {
      if (item.status !== status) {
        moveTask(item.id, status, 0)
        item.dropStatus = status
      }
      onSelect(status)
    },
    collect: monitor => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  }), [moveTask, onSelect, status])

  useEffect(() => {
    if (!isOver || !canDrop || active) return
    const timer = window.setTimeout(() => {
      onSelect(status)
      try { navigator.vibrate?.(6) } catch { /* Optional feedback. */ }
    }, MOBILE_COLUMN_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [active, canDrop, isOver, onSelect, status])

  return { drop, highlighted: isOver && canDrop, dwelling: isOver && canDrop && !active }
}
