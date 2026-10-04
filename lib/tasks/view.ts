import type { Task, TaskPriority, TaskStatus } from "./types"

export type TaskSort = "manual" | "priority" | "name" | "dueDate" | "newest"
export type ColumnSorts = Record<TaskStatus, TaskSort>
export type SortScope = "all" | TaskStatus

/** Recover each column independently if a saved preference is invalid. */
export function parseColumnSorts(serialized: string | null): ColumnSorts {
  const defaults: ColumnSorts = { todo: "manual", inProgress: "manual", done: "manual" }
  if (!serialized) return defaults
  try {
    const raw: unknown = JSON.parse(serialized)
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults
    const choices: TaskSort[] = ["manual", "priority", "name", "dueDate", "newest"]
    for (const status of ["todo", "inProgress", "done"] as const) {
      const value = (raw as Record<string, unknown>)[status]
      if (choices.includes(value as TaskSort)) defaults[status] = value as TaskSort
    }
    return defaults
  } catch {
    return defaults
  }
}

export function updateColumnSorts(current: ColumnSorts, scope: SortScope, sort: TaskSort): ColumnSorts {
  return scope === "all" ? { todo: sort, inProgress: sort, done: sort } : { ...current, [scope]: sort }
}

export function getSortedTaskGroups(tasks: Task[], sorts: ColumnSorts): Record<TaskStatus, Task[]> {
  return {
    todo: sortTasks(tasks.filter(task => task.status === "todo"), sorts.todo),
    inProgress: sortTasks(tasks.filter(task => task.status === "inProgress"), sorts.inProgress),
    done: sortTasks(tasks.filter(task => task.status === "done"), sorts.done),
  }
}

const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }
const nameCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true })

/** Sort a copy so the saved manual order is preserved when switching views. */
export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  if (sort === "manual") return tasks

  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      let result = 0
      if (sort === "priority") result = priorityRank[a.task.priority] - priorityRank[b.task.priority]
      if (sort === "name") result = nameCollator.compare(a.task.title, b.task.title)
      if (sort === "dueDate") result = (a.task.dueDate ?? "9999-12-31").localeCompare(b.task.dueDate ?? "9999-12-31")
      if (sort === "newest") result = b.task.createdAt.localeCompare(a.task.createdAt)
      return result || a.index - b.index
    })
    .map(({ task }) => task)
}
