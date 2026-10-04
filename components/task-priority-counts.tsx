import type { Task } from "@/lib/tasks/types"
import { cn } from "@/lib/utils"

export function TaskPriorityCounts({ tasks, title, className }: {
  tasks: Task[]
  title: string
  className?: string
}) {
  if (tasks.length === 0) return null

  return <div aria-label={`Resumen de ${title}`} className={cn("flex shrink-0 items-center gap-3 text-xs tabular-nums text-muted-foreground", className)}>
    {([
      ["high", "Alta", "--status-danger"],
      ["medium", "Media", "--status-caution"],
      ["low", "Baja", "--status-success"],
    ] as const).map(([priority, label, color]) => {
      const count = tasks.filter(task => task.priority === priority).length
      return count > 0 && <span key={priority} title={`${count} de prioridad ${label.toLowerCase()}`} aria-label={`${count} de prioridad ${label.toLowerCase()}`} className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(${color}))` }} />{count}
      </span>
    })}
  </div>
}
