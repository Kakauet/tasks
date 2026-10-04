"use client"

import { useEffect, useRef, useState } from "react"
import { useDragLayer } from "react-dnd"
import { TASK_DND_TYPE, type TaskDragItem } from "@/components/task-card"
import type { TaskStatus } from "@/context/task-context"

const statusLabels: Record<TaskStatus, string> = {
  todo: "Por hacer",
  inProgress: "En progreso",
  done: "Hechas",
}

/** Keep drag feedback accessible and restore the source tab after cancellation. */
export function MobileTaskDndUi({ onHoverStatus }: { onHoverStatus: (status: TaskStatus) => void }) {
  const lastItem = useRef<TaskDragItem | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const { active, item } = useDragLayer(monitor => ({
    active: monitor.isDragging() && monitor.getItemType() === TASK_DND_TYPE && (monitor.getItem() as TaskDragItem)?.input === "touch",
    item: monitor.getItem() as TaskDragItem | null,
  }))
  useEffect(() => {
    if (active && item) {
      lastItem.current = item
      setAnnouncement(`Moviendo ${item.title}. Acerca el dedo a los bordes para recorrer la lista o arrastra a otra pestaña.`)
    } else if (lastItem.current) {
      const previous = lastItem.current
      setAnnouncement(previous.dropStatus
        ? `${previous.title}, movida a ${statusLabels[previous.dropStatus]}.`
        : "Movimiento cancelado.")
      onHoverStatus(previous.dropStatus ?? previous.status)
      lastItem.current = null
    }
  }, [active, item, onHoverStatus])
  return <span className="sr-only" role="status">{announcement}</span>
}
