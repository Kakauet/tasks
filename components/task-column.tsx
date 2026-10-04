"use client"

import { TASK_DND_TYPE, TaskCard, type TaskDragItem } from "@/components/task-card"
import { TaskDialog } from "@/components/task-dialog"
import { TaskPriorityCounts } from "@/components/task-priority-counts"
import { TaskColumnSort } from "@/components/task-column-sort"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import { useTaskContext, type Task } from "@/context/task-context"
import type { TaskSort } from "@/lib/tasks/view"
import { cn } from "@/lib/utils"
import { CheckCircle2, Circle, Clock, PlusCircle } from "lucide-react"
import { memo, useCallback, useEffect, useState, type CSSProperties } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useDrop } from "react-dnd"
import { toast } from "sonner"

interface TaskColumnProps {
  title: string
  tasks: Task[]
  status: "todo" | "inProgress" | "done"
  emptyMessage: string
  selectedTasks?: string[]
  onTaskSelect?: (taskId: string, selected: boolean) => void
  showBulkSelect?: boolean
  manualOrdering?: boolean
  onMoveStatus?: (status: Task["status"]) => void
  sort: TaskSort
  onSortChange: (status: Task["status"], sort: TaskSort) => void
}

export const TaskColumn = memo(function TaskColumn({
  title,
  tasks,
  status,
  emptyMessage,
  selectedTasks = [],
  onTaskSelect,
  showBulkSelect = false,
  manualOrdering = true,
  onMoveStatus,
  sort,
  onSortChange,
}: TaskColumnProps) {
  const reducedMotion = useReducedMotion()
  const [settlingTaskId, setSettlingTaskId] = useState<string | null>(null)
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  const [isDeletingTask, setIsDeletingTask] = useState(false)
  const { tasks: allTasks, moveTask, deleteTask, undo } = useTaskContext()

  const getStatusColorVariable = () => {
    switch (status) {
      case "todo":
        return "--board-todo-color"
      case "inProgress":
        return "--board-in-progress-color"
      case "done":
        return "--board-done-color"
    }
  }

  const statusColorVariable = getStatusColorVariable()
  const statusColor = `hsl(var(${statusColorVariable}))`
  const columnStyle: CSSProperties = { borderTopColor: `hsl(var(${statusColorVariable}) / 0.6)` }
  const columnHeaderStyle: CSSProperties = {
    backgroundImage: `linear-gradient(to bottom, hsl(var(${statusColorVariable}) / 0.055), transparent)`,
  }

  const getStatusIcon = () => {
    switch (status) {
      case "todo":
        return <Circle className="h-5 w-5" style={{ color: statusColor }} />
      case "inProgress":
        return <Clock className="h-5 w-5" style={{ color: statusColor }} />
      case "done":
        return <CheckCircle2 className="h-5 w-5" style={{ color: statusColor }} />
    }
  }

  const handleMoveTask = useCallback(
    (taskId: string, targetStatus: Task["status"], targetTaskId?: string, placeAfter = false, placeAtTop = false) => {
      if (showBulkSelect) return

      const movingTask = allTasks.find((task) => task.id === taskId)
      if (!manualOrdering) {
        // A sorted view has no meaningful insertion index. Keep its sort and allow status changes.
        if (movingTask?.status !== targetStatus) { moveTask(taskId, targetStatus); onMoveStatus?.(targetStatus) }
        return
      }

      const tasksInTargetStatus = allTasks.filter((task) => task.status === targetStatus && task.id !== taskId)
      let targetIndex = placeAtTop ? 0 : tasksInTargetStatus.length

      if (targetTaskId) {
        const targetTaskIndex = tasksInTargetStatus.findIndex((task) => task.id === targetTaskId)
        if (targetTaskIndex !== -1) {
          targetIndex = targetTaskIndex + (placeAfter ? 1 : 0)
        }
      }

      moveTask(taskId, targetStatus, targetIndex)
      onMoveStatus?.(targetStatus)
    },
    [allTasks, manualOrdering, moveTask, onMoveStatus, showBulkSelect],
  )

  const [{ isOverColumn, isOverBackground, canDropColumn, draggedId }, dropColumn] = useDrop<
    TaskDragItem,
    void,
    { isOverColumn: boolean; isOverBackground: boolean; canDropColumn: boolean; draggedId: string | null }
  >(
    () => ({
      accept: TASK_DND_TYPE,
      canDrop: (item) => !showBulkSelect && (manualOrdering || item.status !== status),
      drop: (item, monitor) => {
        if (showBulkSelect || monitor.didDrop() || !monitor.isOver({ shallow: true })) {
          return
        }

        handleMoveTask(item.id, status)
        item.dropStatus = status
      },
      collect: (monitor) => ({
        isOverColumn: monitor.isOver(),
        isOverBackground: monitor.isOver({ shallow: true }),
        canDropColumn: monitor.canDrop(),
        draggedId: (monitor.getItem() as TaskDragItem | null)?.id ?? null,
      }),
    }),
    [handleMoveTask, manualOrdering, showBulkSelect, status],
  )

  useEffect(() => {
    if (draggedId) {
      setSettlingTaskId(draggedId)
      return
    }
    const timeout = window.setTimeout(() => setSettlingTaskId(null), 280)
    return () => window.clearTimeout(timeout)
  }, [draggedId])

  const EmptyState = () => (
    <div className="flex h-full min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/35 px-4 py-10 text-center transition-colors hover:border-muted-foreground/40">
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">{isOverColumn && canDropColumn ? `Suelta aquí para mover a ${title.toLowerCase()}` : emptyMessage || "No hay tareas en esta columna"}</p>
      {allTasks.length === 0 && status === "todo" && (
        <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
          Empieza con un título. Después podrás marcar pasos y cambiar la prioridad directamente en la tarjeta.
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        data-action="create-task"
        className="mt-4 bg-transparent"
        onClick={() => setIsTaskDialogOpen(true)}
      >
        <PlusCircle className="mr-2 h-4 w-4" />
        Añadir tarea
      </Button>
    </div>
  )

  const handleDeleteTask = () => {
    if (!taskToDelete) return
    setIsDeletingTask(true)
    deleteTask(taskToDelete.id)
    setTaskToDelete(null)
    setIsDeletingTask(false)
    toast.success("Tarea eliminada.", { action: { label: "Deshacer", onClick: undo }, duration: 8000 })
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl task-column",
        "border border-border/70 bg-muted/25 shadow-sm transition-colors [transition-duration:133ms]",
        "border-t-2",
        isOverColumn && canDropColumn && "ring-2 ring-primary/50 border-primary/50",
      )}
      style={columnStyle}
      role="region"
      aria-label={`${title} - ${tasks.length} tareas`}
    >
      <div
        data-column-header
        className="task-column-header relative z-10 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 md:min-h-12 md:px-4 md:pb-2 md:pt-4"
        style={columnHeaderStyle}
      >
        <div className="hidden shrink-0 items-center gap-2.5 md:flex">
          {getStatusIcon()}
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="secondary" className="rounded-full px-2 py-1 text-xs font-medium">
            {tasks.length}
          </Badge>
        </div>
        <TaskPriorityCounts tasks={tasks} title={title} className="hidden md:flex" />
        <div className="ml-auto hidden shrink-0 items-center gap-0.5 md:flex">
          <TaskColumnSort status={status} title={title} value={sort} onChange={onSortChange} />
          <Button
            variant="ghost"
            size="sm"
            data-action="create-task"
            className="hidden h-8 w-8 p-0 hover:bg-background/80 md:inline-flex"
            onClick={() => setIsTaskDialogOpen(true)}
            aria-label={`Añadir nueva tarea a ${title}`}
          >
            <PlusCircle className="h-4 w-4" />
          </Button>
        </div>
        <div className="task-column-fade" aria-hidden="true" />
      </div>

      <motion.div
        layoutScroll
        ref={(node) => {
          dropColumn(node)
        }}
        className="task-column-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3"
        role="list"
        aria-label={`Lista de tareas ${title}`}
      >
        {tasks.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2 pb-1 sm:space-y-3">
            {tasks.map((task) => (
              <motion.div key={task.id} className="relative" role="listitem"
                layout={task.id !== (draggedId ?? settlingTaskId) ? "position" : false}
                initial={false} transition={{ layout: reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 1080, damping: 57, mass: 0.6 } }}>
                <TaskCard
                  task={task}
                  isSelected={selectedTasks.includes(task.id)}
                  onSelect={onTaskSelect}
                  showBulkSelect={showBulkSelect}
                  onEditTask={setEditingTask}
                  onRequestDeleteTask={setTaskToDelete}
                  onMoveTask={handleMoveTask}
                  isDragDisabled={showBulkSelect}
                  manualOrdering={manualOrdering}
                />
              </motion.div>
            ))}
          </div>
        )}
        {tasks.length > 0 && <motion.div aria-hidden="true" initial={false}
          animate={{ height: isOverBackground && canDropColumn ? 64 : 0, opacity: isOverBackground && canDropColumn ? 1 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.107 }} className="overflow-hidden">
          <div className="mt-2 flex h-12 items-center justify-center rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 text-xs font-medium text-primary">
            {manualOrdering ? "Soltar al final" : "Soltar en esta columna"}
          </div>
        </motion.div>}
      </motion.div>

      <TaskDialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen} initialStatus={status} />
      <TaskDialog
        open={editingTask !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null)
        }}
        defaultValues={editingTask ?? undefined}
        mode="edit"
      />
      <ConfirmationDialog
        open={taskToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingTask) setTaskToDelete(null)
        }}
        title="Eliminar tarea"
        description={`Se eliminará «${taskToDelete?.title ?? "esta tarea"}». Podrás deshacerlo justo después.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={handleDeleteTask}
        isProcessing={isDeletingTask}
        variant="destructive"
      />
    </div>
  )
})
