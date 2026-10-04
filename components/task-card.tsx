"use client"

import { track, entityKey } from "@/lib/activity"
import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { LinkifiedText } from "@/components/ui/linkified-text"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { TagBadge } from "@/components/ui/tag-badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { type Task, useTaskContext } from "@/context/task-context"
import { cn } from "@/lib/utils"
import { dropSide } from "@/lib/ui/dnd"
import { differenceInCalendarDays, format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { ArrowRight, Check, ChevronDown, Edit3, RotateCcw, Timer, Trash2 } from "lucide-react"
import { formatStudyTime } from "@/lib/focus"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDrag, useDrop, type DragSourceMonitor } from "react-dnd"

export const TASK_DND_TYPE = "TASK_CARD"

export interface TaskDragItem {
  type: typeof TASK_DND_TYPE
  id: string
  status: Task["status"]
  title: string
  priority: Task["priority"]
  preview: HTMLElement
  rect: { x: number; y: number; width: number; height: number }
  dropStatus?: Task["status"]
  input?: "touch" | "mouse"
  hasSubtitle?: boolean
  hasStepProgress?: boolean
}

interface TaskCardProps {
  task: Task
  isSelected?: boolean
  onSelect?: (taskId: string, selected: boolean) => void
  showBulkSelect?: boolean
  onEditTask?: (task: Task) => void
  onRequestDeleteTask?: (task: Task) => void
  onMoveTask?: (taskId: string, targetStatus: Task["status"], targetTaskId?: string, placeAfter?: boolean, placeAtTop?: boolean) => void
  isDragDisabled?: boolean
  manualOrdering?: boolean
}

const PRIORITY_MAP = {
  low: { text: "Baja", color: "hsl(var(--status-success))", dots: 1 },
  medium: { text: "Media", color: "hsl(var(--status-caution))", dots: 2 },
  high: { text: "Alta", color: "hsl(var(--status-danger))", dots: 3 },
}

export const TaskCard = memo(function TaskCard({
  task,
  isSelected = false,
  onSelect,
  showBulkSelect = false,
  onEditTask,
  onRequestDeleteTask,
  onMoveTask,
  isDragDisabled = false,
  manualOrdering = true,
}: TaskCardProps) {
  const { tags, updateTask } = useTaskContext()
  const [dropPlacement, setDropPlacement] = useState<"before" | "after" | null>(null)
  const [stepsExpanded, setStepsExpanded] = useState(true)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const suppressClickUntil = useRef(0)
  const isInteractive = (target: EventTarget | null) => target instanceof Element &&
    !!target.closest('button, a, input, textarea, select, [role="checkbox"], [role="combobox"], [contenteditable="true"], [data-no-drag]')
  const cardRef = useRef<HTMLDivElement | null>(null)

  const taskTags = useMemo(() => tags.filter((tag) => task.tags.includes(tag.id)), [tags, task.tags])
  const completedSteps = task.steps.filter((step) => step.completed).length
  const totalSteps = task.steps.length
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
  const priorityConfig = PRIORITY_MAP[task.priority]
  const nextStatus: Task["status"] = task.status === "todo" ? "inProgress" : task.status === "inProgress" ? "done" : "todo"
  const nextStatusLabel = nextStatus === "todo" ? "Por hacer" : nextStatus === "inProgress" ? "En progreso" : "Completadas"
  const nextActionLabel = task.status === "todo" ? "Empezar" : task.status === "inProgress" ? "Completar" : "Reabrir"

  const toggleTaskStep = (stepId: string) => {
    updateTask(task.id, {
      steps: task.steps.map((step) => step.id === stepId ? { ...step, completed: !step.completed } : step),
    })
  }

  const dueDateInfo = useMemo(() => {
    if (!task.dueDate) return null

    const today = new Date()
    const dueDate = parseISO(task.dueDate)
    const diffDays = differenceInCalendarDays(dueDate, today)

    let color = "hsl(var(--muted-foreground))"
    let urgency = "normal"

    if (diffDays < 0) {
      color = "hsl(var(--status-danger))"
      urgency = "overdue"
    } else if (diffDays === 0) {
      color = "hsl(var(--status-warning))"
      urgency = "today"
    } else if (diffDays <= 3) {
      color = "hsl(var(--status-caution))"
      urgency = "soon"
    } else if (diffDays <= 7) {
      color = "hsl(var(--status-info))"
      urgency = "upcoming"
    }

    if (task.status === "done") {
      color = "hsl(var(--muted-foreground))"
      urgency = "done"
    }

    return {
      color,
      urgency,
      text:
        diffDays === 0
          ? "Hoy"
          : diffDays === 1
            ? "Mañana"
            : diffDays === -1
              ? "Ayer"
              : diffDays > 1
                ? `En ${diffDays} días`
                : `Hace ${Math.abs(diffDays)} días`,
      shortText: diffDays === 1 ? "1 día" : diffDays > 1 ? `${diffDays} días` : diffDays === 0 ? "Hoy" : diffDays === -1 ? "Ayer" : `Hace ${Math.abs(diffDays)} días`,
      fullDate: format(dueDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: es }),
    }
  }, [task.dueDate, task.status])

  const [isTouchMode, setIsTouchMode] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)")
    const update = () => setIsTouchMode(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const dragStartedAt = useRef(0)
  const buildDragItem = useCallback(
    (): TaskDragItem | null => {
      const node = cardRef.current
      if (!node) return null
      dragStartedAt.current = performance.now()
      track("task.drag_start",{entity:entityKey(task.id),status:task.status,priority:task.priority})
      const rect = node.getBoundingClientRect()
      const preview = node.cloneNode(true) as HTMLElement
      preview.removeAttribute("data-drag-press")
      preview.removeAttribute("data-task-id")
      preview.removeAttribute("data-dragging")
      preview.removeAttribute("data-drop-placement")
      preview.removeAttribute("id")
      preview.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"))
      preview.querySelectorAll("[draggable]").forEach(element => element.removeAttribute("draggable"))
      preview.removeAttribute("draggable")
      preview.inert = true
      return { type: TASK_DND_TYPE, id: task.id, status: task.status, title: task.title, priority: task.priority,
        input: node.hasAttribute("data-drag-press") ? "touch" : "mouse",
        preview, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        hasSubtitle: Boolean(task.description), hasStepProgress: task.steps.length > 0 }
    },
    [task.id, task.status, task.title, task.priority, task.description, task.steps.length],
  )

  const endDrag = useCallback((item:TaskDragItem, monitor:DragSourceMonitor) => {
    track("task.drag_end",{entity:entityKey(item.id),from:item.status,to:item.dropStatus??item.status,dropped:monitor.didDrop(),durationMs:Math.round(performance.now()-dragStartedAt.current)})
    suppressClickUntil.current = Date.now() + 250
  }, [])

  // Touch drags start after a long press; the title surface still allows vertical scrolling.
  const [{ isDragging }, dragCard, previewCard] = useDrag(
    () => ({
      type: TASK_DND_TYPE,
      // The browser distinguishes a click from a drag by movement. Buttons
      // keep their normal click action until an actual drag begins.
      canDrag: () => !isDragDisabled,
      end: endDrag,
      item: buildDragItem,
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [isDragDisabled, buildDragItem, endDrag],
  )

  // Use the same opaque drag layer on mouse and touch instead of the browser's
  // translucent snapshot (see TaskDragLayer).
  useEffect(() => {
    void import("react-dnd-html5-backend").then(({ getEmptyImage }) => {
      previewCard(getEmptyImage(), { captureDraggingState: true })
    })
  }, [previewCard])

  const [{ isOverCurrent, canDropCurrent }, drop] = useDrop<TaskDragItem, { handled: true }, { isOverCurrent: boolean; canDropCurrent: boolean }>(
    () => ({
      accept: TASK_DND_TYPE,
      canDrop: (item) => !isDragDisabled && item.id !== task.id && (manualOrdering || item.status !== task.status),
      hover: (item, monitor) => {
        if (!cardRef.current || !onMoveTask || isDragDisabled || item.id === task.id) return

        const clientOffset = monitor.getClientOffset()
        if (!clientOffset) return

        const hoverRect = cardRef.current.getBoundingClientRect()
        if (manualOrdering) setDropPlacement(previous => dropSide(clientOffset.y, hoverRect.top, hoverRect.height, previous))

      },
      drop: (item, monitor) => {
        if (!cardRef.current || !onMoveTask || isDragDisabled) return { handled: true }
        const offset = monitor.getClientOffset()
        const rect = cardRef.current.getBoundingClientRect()
        onMoveTask(item.id, task.status, task.id, !!offset && dropSide(offset.y, rect.top, rect.height, dropPlacement) === "after")
        item.dropStatus = task.status
        return { handled: true }
      },
      collect: (monitor) => ({
        isOverCurrent: monitor.isOver({ shallow: true }),
        canDropCurrent: monitor.canDrop(),
      }),
    }),
    [isDragDisabled, manualOrdering, onMoveTask, task.id, task.status, dropPlacement],
  )

  useEffect(() => {
    if (!isOverCurrent) {
      setDropPlacement(null)
    }
  }, [isOverCurrent])

  const setCardNode = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node
      drop(node)
      if (!isTouchMode) dragCard(node)
    },
    [dragCard, drop, isTouchMode],
  )
  const setTouchDragNode = useCallback((node: HTMLDivElement | null) => {
    if (isTouchMode && !isDragDisabled) dragCard(node)
  }, [dragCard, isTouchMode, isDragDisabled])

  const toggleSelection = (nextState?: boolean) => {
    if (!onSelect) return
    onSelect(task.id, typeof nextState === "boolean" ? nextState : !isSelected)
  }

  return (
    <TooltipProvider>
      <Card
        ref={setCardNode}
        data-task-id={task.id}
        data-task-drag-surface={!isDragDisabled ? true : undefined}
        data-dragging={isDragging || undefined}
        data-drop-placement={manualOrdering && isOverCurrent && canDropCurrent ? dropPlacement : undefined}
        className={cn(
          "group relative task-card w-full",
          isSelected && "ring-2 ring-primary bg-primary/5",
          !isDragDisabled && !isTouchMode && "cursor-grab active:cursor-grabbing",
          "border border-border/80 hover:border-border",
          "bg-card",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          task.status === "done" && "opacity-90",
          dueDateInfo?.urgency === "overdue" && "task-card-overdue",
          dueDateInfo?.urgency === "today" && "task-card-due-today",
        )}
        onClickCapture={(e) => {
          if (isDragging || Date.now() < suppressClickUntil.current) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onClick={(e) => {
          if (isInteractive(e.target) || Date.now() < suppressClickUntil.current) return
          const selection = window.getSelection()
          const selectionBelongsToCard =
            selection &&
            !selection.isCollapsed &&
            cardRef.current &&
            ((selection.anchorNode && cardRef.current.contains(selection.anchorNode)) ||
              (selection.focusNode && cardRef.current.contains(selection.focusNode)))

          if (selectionBelongsToCard) {
            return
          }
          if (showBulkSelect && onSelect) {
            toggleSelection()
            return
          }
          onEditTask?.(task)
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            if (showBulkSelect && onSelect) {
              toggleSelection()
            } else {
              onEditTask?.(task)
            }
          }
          if ((e.key === "Delete" || e.key === "Backspace") && onRequestDeleteTask) {
            e.preventDefault()
            onRequestDeleteTask(task)
          }
        }}
        tabIndex={0}
        role="group"
        aria-roledescription="tarjeta de tarea"
        aria-label={`Tarea: ${task.title}. Prioridad ${PRIORITY_MAP[task.priority].text}. ${dueDateInfo ? `Vence ${dueDateInfo.text}` : "Sin fecha límite"}.${showBulkSelect ? " Enter o espacio para seleccionar." : " Enter para editar."} Delete para eliminar.`}
      >
        {showBulkSelect && (
          <div
            className="absolute left-3 top-3 z-10"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => toggleSelection(checked === true)}
              aria-label={`Seleccionar tarea ${task.title}`}
            />
          </div>
        )}

        <CardContent data-task-card-content className={cn("px-3 py-2 sm:px-4 sm:py-2.5", showBulkSelect && "pl-10 sm:pl-10")}>
          <div data-task-card-summary className="flex items-start gap-2">
            <div ref={setTouchDragNode}
              className={cn("flex min-w-0 flex-1 items-center gap-2", isTouchMode && !showBulkSelect && "task-drag-surface")}
              onContextMenu={(event) => { if (isTouchMode) event.preventDefault() }}
>
            {/* Metadata stays beside the title while it fits and wraps below it in narrow columns. */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
              <h3 className={cn("min-w-0 flex-1 basis-36 break-words text-card-title", task.status === "done" && "line-through text-muted-foreground")}>
                {task.title}
              </h3>
              {(dueDateInfo || taskTags.length > 0 || !!task.focusSeconds) && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
              {dueDateInfo && (
                <div data-task-card-due-date className="shrink-0">
                  <MetadataItem
                    text={dueDateInfo.shortText}
                    tooltip={`Fecha límite: ${dueDateInfo.fullDate}`}
                    style={{ color: dueDateInfo.color }}
                    className={cn(
                      "whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium",
                      dueDateInfo.urgency === "overdue" ? "bg-[hsl(var(--status-danger-soft))] font-semibold"
                        : dueDateInfo.urgency === "today" ? "bg-[hsl(var(--status-warning-soft))]"
                          : "bg-muted/70",
                    )}
                  />
                </div>
              )}
              {taskTags.length > 0 && (
                <div data-task-card-tags className="flex min-w-0 max-w-full flex-wrap gap-1">
                  {taskTags.slice(0, 2).map((tag) => (
                    <TagBadge key={tag.id} id={tag.id} name={tag.name} color={tag.color} size="sm" className="block max-w-[9rem] truncate" />
                  ))}
                  {taskTags.length > 2 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label={`${taskTags.length - 2} etiquetas más`} className="h-5 rounded-full bg-muted px-1.5 text-xs text-muted-foreground hover:text-foreground">
                          +{taskTags.length - 2}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1">
                          {taskTags.slice(2).map((tag) => (
                            <div key={tag.id} className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                              <span>{tag.name}</span>
                            </div>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
              {!!task.focusSeconds && task.focusSeconds >= 60 && (
                <MetadataItem
                  icon={<Timer className="h-3 w-3" aria-hidden="true" />}
                  text={formatStudyTime(task.focusSeconds)}
                  tooltip={`Tiempo de estudio: ${formatStudyTime(task.focusSeconds)}${task.focusSessions ? ` · ${task.focusSessions} pomodoro${task.focusSessions > 1 ? "s" : ""}` : ""}`}
                  className="gap-1 whitespace-nowrap text-muted-foreground"
                />
              )}
              </div>}
            </div>
            </div>
            <div data-task-card-priority className="-mr-1.5 flex shrink-0 items-center gap-1 pt-0.5">
              <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={showBulkSelect}
                    aria-label={`Prioridad de ${task.title}: ${priorityConfig.text}. Cambiar prioridad`}
                    title={`Prioridad ${priorityConfig.text}`}
                    className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md bg-transparent transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                  >
                    <PriorityDots priority={task.priority} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-40 rounded-lg p-1" aria-label="Cambiar prioridad">
                  {(["low", "medium", "high"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={task.priority === value}
                      onClick={() => {
                        updateTask(task.id, { priority: value })
                        setPriorityOpen(false)
                      }}
                      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted", task.priority === value && "bg-muted font-semibold")}
                    >
                      <PriorityDots priority={value} />
                      {PRIORITY_MAP[value].text}
                      {task.priority === value && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {task.description && (
              <div data-task-card-subtitle>
              <LinkifiedText
                text={task.description}
                as="p"
                className="mt-1 whitespace-pre-wrap break-words text-card-body"
                maxLinkLength={34}
              />
            </div>
          )}

          {totalSteps > 0 && (
            <div data-task-card-steps className="mt-1">
              <div data-task-card-progress className="flex items-center gap-3">
                <Progress value={progress} aria-label={`${completedSteps} de ${totalSteps} pasos completados`}
                  className="h-1.5 flex-1" indicatorClassName={progress === 100 ? "bg-[hsl(var(--status-success))]" : "bg-primary"} />
                <button
                  type="button"
                  aria-expanded={stepsExpanded}
                  aria-label={`${stepsExpanded ? "Plegar" : "Desplegar"} los pasos de ${task.title}`}
                  onClick={() => setStepsExpanded((expanded) => !expanded)}
                  className="flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1 text-xs tabular-nums text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {completedSteps}/{totalSteps} pasos
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", stepsExpanded && "rotate-180")} aria-hidden="true" />
                </button>
              </div>
              {stepsExpanded && (
                <div data-task-card-checklist className="space-y-0.5">
                  {task.steps.map((step) => (
                    <button key={step.id} type="button" disabled={showBulkSelect} onClick={() => toggleTaskStep(step.id)}
                      aria-label={`${step.completed ? "Desmarcar" : "Completar"} paso: ${step.text}`}
                      className="flex min-h-8 w-full items-start gap-2 rounded-md px-1 py-1.5 text-left text-xs text-foreground/85 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                    >
                      <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border", step.completed ? "border-primary bg-primary text-primary-foreground" : "border-primary/70")}>
                        {step.completed && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                      <span className={cn("min-w-0 flex-1 break-words", step.completed && "text-muted-foreground line-through")}>{step.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div data-task-card-detail className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 sm:mt-3.5 sm:pt-2.5">
            <div className="task-card-actions flex items-center gap-0.5 sm:gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-lg hover:bg-primary/10 sm:h-8 sm:w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditTask?.(task)
                    }}
                  >
                    <Edit3 className="h-3.5 w-3.5 text-primary" />
                    <span className="sr-only">Editar tarea</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" align="center">
                  <p>Editar tarea</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 rounded-lg p-0 hover:bg-transparent sm:h-8 sm:w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRequestDeleteTask?.(task)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--status-danger))]" />
                    <span className="sr-only">Eliminar tarea</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" align="center">
                  <p>Eliminar tarea</p>
                </TooltipContent>
              </Tooltip>

            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={isDragDisabled || !onMoveTask}
                  aria-label={`Mover ${task.title} a ${nextStatusLabel}`}
                  className="h-8 gap-1.5 rounded-lg border border-primary/20 bg-primary/10 pl-3 pr-2.5 text-xs font-semibold text-primary hover:bg-primary/15 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveTask?.(task.id, nextStatus, undefined, false, true)
                  }}
                >
                  <span>{nextActionLabel}</span>
                  {task.status === "done" ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" align="center">
                <p>Mover a {nextStatusLabel}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
})

function PriorityDots({ priority }: { priority: Task["priority"] }) {
  const config = PRIORITY_MAP[priority]
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn("h-2 w-2 rounded-full", index >= config.dots && "bg-muted-foreground/25")}
          style={index < config.dots ? { backgroundColor: config.color } : undefined}
        />
      ))}
    </span>
  )
}

function MetadataItem({
  icon,
  text,
  tooltip,
  className = "",
  style,
}: {
  icon?: React.ReactNode
  text: string
  tooltip: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-1.5 text-xs", className)} style={style}>
          {icon}
          <span>{text}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  )
}
