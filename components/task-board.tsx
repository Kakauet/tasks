"use client"

import { track, entityKey } from "@/lib/activity"
import { useTaskContext, type TaskStatus } from "@/context/task-context"
import { cn } from "@/lib/utils"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTaskColumnTarget } from "@/hooks/use-task-column-target"
import { useColumnSorts } from "@/hooks/use-column-sorts"
import { MOBILE_COLUMN_DWELL_MS } from "@/lib/ui/dnd"

// Hooks personalizados
import { useDialogState } from "@/hooks/use-dialog-state"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Componentes
import { BulkOperations } from "@/components/bulk-operations"
import { MobileTaskDndUi } from "@/components/mobile-task-dnd"
import { TaskDragLayer } from "@/components/task-drag-layer"
import { ImportExport } from "@/components/import-export"
import { TagsDialog } from "@/components/tags-dialog"
import { TaskColumn } from "@/components/task-column"
import { TaskBoardSort } from "@/components/task-column-sort"
import { TaskDialog } from "@/components/task-dialog"
import { TagBadge } from "@/components/ui/tag-badge"
import type { TaskPriority } from "@/lib/tasks/types"
import { getSortedTaskGroups, updateColumnSorts, type TaskSort } from "@/lib/tasks/view"

// UI Components
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Icons
import { Filter, PlusCircle, Search, X, MoreHorizontal, Tags, CheckSquare, ArrowUpRight, Timer } from "lucide-react"
import { useFocusTimer } from "@/components/focus-timer"

const priorities: { value: TaskPriority; label: string; color: string }[] = [
  { value: "high", label: "Alta", color: "hsl(var(--status-danger))" },
  { value: "medium", label: "Media", color: "hsl(var(--status-caution))" },
  { value: "low", label: "Baja", color: "hsl(var(--status-success))" },
]

function MobileColumnTab({ status, label, count, active, onSelect }: {
  status: TaskStatus
  label: string
  count: number
  active: boolean
  onSelect: (status: TaskStatus) => void
}) {
  const { drop, highlighted, dwelling } = useTaskColumnTarget(status, active, onSelect)

  return (
    <button ref={(node) => { drop(node) }} type="button" data-mobile-column-status={status}
      aria-pressed={active} onClick={() => onSelect(status)}
      className={cn("relative flex h-8 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden rounded-lg px-1 text-sm font-medium transition-colors", active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground", highlighted && "ring-2 ring-primary/50") }>
      <span className="truncate">{label}</span> <span className="tabular-nums text-[12px] opacity-80">{count}</span>
      {dwelling && <span className="mobile-column-dwell-progress pointer-events-none absolute inset-x-1 bottom-0 h-0.5 origin-left bg-primary"
        style={{ animationDuration: `${MOBILE_COLUMN_DWELL_MS}ms` }} />}
    </button>
  )
}

export const TaskBoard = () => {
  const { tasks, tags, searchTasks } = useTaskContext()
  const taskDialog = useDialogState(false)
  const tagsDialog = useDialogState(false)
  const [mobileStatus, setMobileStatus] = useState<"todo" | "inProgress" | "done">("todo")

  // Local state for filters
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedPriorities, setSelectedPriorities] = useState<TaskPriority[]>([])
  const [columnSorts, setColumnSorts] = useColumnSorts()
  const [showFilters, setShowFilters] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const { openTimer } = useFocusTimer()
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])
  const [showBulkOps, setShowBulkOps] = useState(false)

  const filteredTasks = useMemo(() => {
    let result = tasks

    // Apply search filter
    if (searchTerm.trim()) {
      result = searchTasks(searchTerm)
    }

    // Apply tag filter
    if (selectedTags.length > 0) {
      result = result.filter((task) => task.tags.some((tagId) => selectedTags.includes(tagId)))
    }

    if (selectedPriorities.length > 0) {
      result = result.filter((task) => selectedPriorities.includes(task.priority))
    }

    return result
  }, [tasks, searchTerm, selectedTags, selectedPriorities, searchTasks])

  useEffect(() => {
    // A bulk operation must never act on tasks hidden by the current filters.
    setSelectedTasks(previous => {
      const visible = new Set(filteredTasks.map(task => task.id))
      const next = previous.filter(id => visible.has(id))
      return next.length === previous.length ? previous : next
    })
  }, [filteredTasks])

  useEffect(() => {
    const timer=window.setTimeout(()=>track("board.filter",{searchLength:searchTerm.length,tags:selectedTags.slice(0,100).map(entityKey),tagCount:selectedTags.length,priorities:selectedPriorities,results:filteredTasks.length}),600)
    return () => window.clearTimeout(timer)
  },[searchTerm,selectedTags,selectedPriorities,filteredTasks.length])
  useEffect(()=>{track("board.selection",{count:selectedTasks.length,enabled:showBulkOps})},[selectedTasks.length,showBulkOps])
  useEffect(()=>{track("board.mobile_column",{status:mobileStatus})},[mobileStatus])

  const taskGroups = useMemo(
    () => getSortedTaskGroups(filteredTasks, columnSorts),
    [filteredTasks, columnSorts],
  )

  const handleColumnSort = useCallback((status: TaskStatus, sort: TaskSort) => {
    track("board.sort", { scope: status, order: sort })
    setColumnSorts(current => updateColumnSorts(current, status, sort))
  }, [setColumnSorts])

  const handleBoardSort = useCallback((sort: TaskSort) => {
    track("board.sort", { scope: "all", order: sort })
    setColumnSorts(current => updateColumnSorts(current, "all", sort))
  }, [setColumnSorts])

  const boardSort = columnSorts.todo === columnSorts.inProgress && columnSorts.todo === columnSorts.done
    ? columnSorts.todo : null

  const toggleTagFilter = useCallback((tagId: string) => {
    setSelectedTags((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]))
  }, [])

  const togglePriorityFilter = useCallback((priority: TaskPriority) => {
    setSelectedPriorities((prev) => prev.includes(priority) ? prev.filter((value) => value !== priority) : [...prev, priority])
  }, [])

  const clearFilters = useCallback(() => {
    setSearchTerm("")
    setSelectedTags([])
    setSelectedPriorities([])
  }, [])

  const hasActiveFilters = Boolean(searchTerm.trim() || selectedTags.length > 0 || selectedPriorities.length > 0)
  const activeFilterCount = selectedTags.length + selectedPriorities.length

  const handleTaskSelect = useCallback((taskId: string, selected: boolean) => {
    if (selected) {
      setSelectedTasks((prev) => [...prev, taskId])
    } else {
      setSelectedTasks((prev) => prev.filter((id) => id !== taskId))
    }
  }, [])

  const renderFilterPanel = useCallback(() => {
    if (!showFilters) return null

    return (
      <div className="glass flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl p-4 filter-panel-enter">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <h3 className="mr-1 shrink-0 text-toolbar-label">Prioridad</h3>
          <div className="flex flex-wrap gap-2" aria-label="Filtrar por prioridad">
            {priorities.map(({ value, label, color }) => (
              <button key={value} type="button" aria-pressed={selectedPriorities.includes(value)} onClick={() => togglePriorityFilter(value)}
                className={cn("flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selectedPriorities.includes(value) ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted/60")}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <h3 className="mr-1 shrink-0 text-toolbar-label">Etiquetas</h3>
          {tags.length === 0 && <p className="text-sm text-muted-foreground">Crea etiquetas desde Herramientas para organizar y filtrar tus tareas.</p>}
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <TagBadge key={tag.id} id={tag.id} name={tag.name} color={tag.color}
                selected={selectedTags.includes(tag.id)} onClick={toggleTagFilter} />
            ))}
          </div>
        </div>
      </div>
    )
  }, [showFilters, tags, selectedTags, selectedPriorities, toggleTagFilter, togglePriorityFilter])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 sm:gap-3">
      <h1 className="sr-only">Tareas</h1>
      <div className="flex shrink-0 flex-row items-center gap-1.5 rounded-2xl border border-border/70 bg-card/70 p-2 shadow-sm sm:gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input type="search" aria-label="Buscar tareas" placeholder="Buscar…" value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} className="h-8 border-transparent bg-muted/45 pl-9 pr-9 text-[14px] shadow-none hover:border-border focus-visible:bg-background sm:h-9 sm:pl-10 sm:pr-10" />
          {searchTerm && <Button variant="ghost" size="icon" aria-label="Borrar búsqueda" onClick={() => setSearchTerm("")}
            className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2"><X className="h-4 w-4" /></Button>}
        </div>
        <div className="flex flex-none items-center gap-1.5 sm:gap-2">
          <div className="flex md:hidden">
            <TaskBoardSort value={boardSort} onChange={handleBoardSort} />
          </div>
          <Button variant={showFilters ? "secondary" : "ghost"} size="sm" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="task-filters" aria-label="Filtros" className="relative h-8 w-8 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-3">
            <Filter className="h-3.5 w-3.5" />
            {activeFilterCount > 0 && <Badge variant="secondary" className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums">{activeFilterCount}</Badge>}
          </Button>
          <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
            <PopoverTrigger asChild><Button variant="ghost" size="sm" aria-label="Herramientas" className="h-8 w-8 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-3"><MoreHorizontal className="h-4 w-4" /> <span className="hidden sm:inline">Herramientas</span></Button></PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-2 rounded-2xl p-2">
              <Button variant="ghost" onClick={() => { setToolsOpen(false); openTimer() }} className="w-full justify-start"><Timer className="h-4 w-4" /> Pomodoro</Button>
              <Button variant="ghost" onClick={tagsDialog.open} className="w-full justify-start"><Tags className="h-4 w-4" /> Gestionar etiquetas</Button>
              <Button variant="ghost" aria-pressed={showBulkOps} onClick={() => { setShowBulkOps(!showBulkOps); setSelectedTasks([]) }} className="w-full justify-start"><CheckSquare className="h-4 w-4" /> {showBulkOps ? "Salir de selección" : "Seleccionar tareas"}</Button>
              <div className="border-t pt-2"><ImportExport /></div>
            </PopoverContent>
          </Popover>
          <Button variant="primary" size="sm" data-action="create-task" onClick={taskDialog.open} className="h-8 w-auto flex-none whitespace-nowrap px-3 sm:h-9">
            <PlusCircle className="h-3.5 w-3.5" /> <span className="md:hidden">Nueva</span><span className="hidden md:inline">Nueva tarea</span>
          </Button>
        </div>
      </div>
      {hasActiveFilters && <div role="status" className="flex shrink-0 items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{filteredTasks.length} de {tasks.length} tareas</span>
        <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-3.5 w-3.5" /> Limpiar filtros</Button>
      </div>}

      {/* Panel de filtros */}
      <div id="task-filters" className="max-h-[35dvh] shrink-0 overflow-y-auto" hidden={!showFilters}>{renderFilterPanel()}</div>

      {showBulkOps && (
        <BulkOperations
          tasks={filteredTasks}
          selectedTasks={selectedTasks}
          onSelectionChange={setSelectedTasks}
          onOperationComplete={() => {
            setSelectedTasks([])
            setShowBulkOps(false)
          }}
        />
      )}

      <div className="flex shrink-0 gap-0.5 rounded-xl border border-border/60 bg-muted/60 p-1 md:hidden" aria-label="Columnas del tablero">
        {([ ["todo", "Por hacer"], ["inProgress", "En progreso"], ["done", "Hechas"] ] as const).map(([status, label]) => (
          <MobileColumnTab key={status} status={status} label={label} count={taskGroups[status].length}
            active={mobileStatus === status} onSelect={setMobileStatus} />
        ))}
      </div>
      {hasActiveFilters && filteredTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <Search className="mx-auto mb-4 h-7 w-7 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No encontramos esas tareas</h2>
          <p className="mt-2 text-sm text-muted-foreground">Prueba otra búsqueda o elimina los filtros para ver todo tu tablero.</p>
          <Button variant="outline" className="mt-5" onClick={clearFilters}>Ver todas las tareas <ArrowUpRight className="h-4 w-4" /></Button>
        </div>
      ) : <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 sm:gap-3 md:grid-cols-3">
        {([ ["todo", "Por hacer", "No hay tareas pendientes."], ["inProgress", "En progreso", "No hay tareas en progreso."], ["done", "Completadas", "No hay tareas completadas."] ] as const).map(([status, title, message]) => (
          <div key={status} className={cn("h-full min-h-0 min-w-0", mobileStatus !== status && "hidden md:block")}>
            <TaskColumn title={title} tasks={taskGroups[status]} status={status}
              sort={columnSorts[status]} onSortChange={handleColumnSort}
              onMoveStatus={setMobileStatus}
              emptyMessage={hasActiveFilters ? "No hay coincidencias en este estado." : message}
              selectedTasks={selectedTasks} onTaskSelect={handleTaskSelect} showBulkSelect={showBulkOps} manualOrdering={columnSorts[status] === "manual"}
              />
          </div>
        ))}
      </div>}

      {!showBulkOps && <><TaskDragLayer /><MobileTaskDndUi onHoverStatus={setMobileStatus} /></>}

      {/* Diálogos */}
      <TaskDialog open={taskDialog.isOpen} onOpenChange={taskDialog.setIsOpen} initialStatus={mobileStatus} />
      <TagsDialog open={tagsDialog.isOpen} onOpenChange={tagsDialog.setIsOpen} />
    </div>
  )
}
