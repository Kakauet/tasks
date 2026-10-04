import type { Task, TaskStatus } from "./types"

/** Column indices are relative to that column, not the interleaved backing array. */
export function insertTask(tasks: Task[], task: Task, status: TaskStatus, targetIndex?: number): Task[] {
  const remaining = tasks.filter((item) => item.id !== task.id)
  const updated = { ...task, status, updatedAt: new Date().toISOString() }
  const column = remaining.filter((item) => item.status === status)
  const index = targetIndex === undefined ? column.length : Math.max(0, Math.min(targetIndex, column.length))
  if (task.status === status && tasks.filter(item => item.status === status).findIndex(item => item.id === task.id) === index) return tasks
  const anchor = column[index]
  const last = column[column.length - 1]
  const insertion = anchor ? remaining.indexOf(anchor) : last ? remaining.indexOf(last) + 1 : remaining.length
  remaining.splice(insertion, 0, updated)
  return remaining
}
