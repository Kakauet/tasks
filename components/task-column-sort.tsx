"use client"

import { useState } from "react"
import { ArrowDownUp, Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { TaskStatus } from "@/context/task-context"
import type { TaskSort } from "@/lib/tasks/view"
import { cn } from "@/lib/utils"

export const taskSortOptions: { value: TaskSort; label: string; shortLabel: string }[] = [
  { value: "manual", label: "Orden manual", shortLabel: "Manual" },
  { value: "priority", label: "Prioridad: alta primero", shortLabel: "Prioridad" },
  { value: "name", label: "Nombre: A a Z", shortLabel: "Nombre" },
  { value: "dueDate", label: "Fecha límite: próxima", shortLabel: "Fecha límite" },
  { value: "newest", label: "Creación: reciente", shortLabel: "Recientes" },
]

export function TaskColumnSort({ status, title, value, onChange }: {
  status: TaskStatus
  title: string
  value: TaskSort
  onChange: (status: TaskStatus, value: TaskSort) => void
}) {
  return <TaskSortMenu title={title} label={`Ordenar columna ${title}`} value={value}
    onChange={(sort) => onChange(status, sort)} />
}

export function TaskBoardSort({ value, onChange }: {
  value: TaskSort | null
  onChange: (value: TaskSort) => void
}) {
  return <TaskSortMenu title="Todas las columnas" label="Ordenar todas las columnas" value={value}
    onChange={onChange} className="sm:h-9 sm:w-9" />
}

function TaskSortMenu({ title, label, value, onChange, className }: {
  title: string
  label: string
  value: TaskSort | null
  onChange: (value: TaskSort) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const currentLabel = taskSortOptions.find(option => option.value === value)?.shortLabel ?? "Por columna"
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`${label}. Actual: ${currentLabel}`}
        title={`Ordenar: ${currentLabel}`}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value !== null && value !== "manual" && "bg-primary/10 text-primary",
          className,
        )}>
        <ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-56 rounded-xl p-1.5" aria-label={label}>
      <p className="px-3 py-2 text-xs font-medium text-muted-foreground">{title}</p>
      {taskSortOptions.map(option => (
        <button key={option.value} type="button" aria-pressed={value === option.value}
          onClick={() => { onChange(option.value); setOpen(false) }}
          className={cn("flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value === option.value && "bg-muted font-medium")}>
          {option.label}{value === option.value && <Check className="h-4 w-4 shrink-0 text-primary" />}
        </button>
      ))}
      <p className="border-t px-3 pb-1 pt-2 text-xs leading-relaxed text-muted-foreground">Orden manual permite arrastrar tarjetas.</p>
    </PopoverContent>
  </Popover>
}
