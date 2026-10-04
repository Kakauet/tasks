import { activityStats } from "@/lib/activity"
import { listRecovery } from "./backup"
import { storedStateBytes } from "@/lib/tasks/storage"

export interface DataUsage {
  stateBytes: number
  localBytes: number
  activityBytes: number
  dailyBytes: number
  activityCount: number
  days: number
  firstDay: string | null
  lastDay: string | null
  recoveryBytes: number
  recoveryCount: number
  knownBytes: number
  originUsed?: number
  originQuota?: number
  warnings: string[]
}

const localKeys = ["taskmaster-state", "taskmaster-state-recovery", "tasks", "events", "tags", "theme", "taskmaster-accent-id", "taskmaster-dark-mode-id", "taskmaster-board-colors", "taskmaster-activity-enabled"]

export async function getDataUsage(): Promise<DataUsage> {
  const warnings: string[] = []
  let localBytes = 0
  try {
    for (const key of localKeys) {
      const value = localStorage.getItem(key)
      if (value !== null) localBytes += new Blob([key, value]).size
    }
  } catch { warnings.push("No se pudo medir el almacenamiento local.") }

  const [state, activity, recoveries, estimate] = await Promise.allSettled([
    storedStateBytes(), activityStats(), listRecovery(),
    typeof navigator !== "undefined" && navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve(undefined),
  ])
  if (state.status === "rejected") warnings.push("No se pudo medir el espacio de tareas.")
  if (activity.status === "rejected") warnings.push("No se pudo medir el historial de actividad.")
  if (recoveries.status === "rejected") warnings.push("No se pudieron medir las copias de recuperación.")
  if (activity.status === "fulfilled" && activity.value.error) warnings.push(activity.value.error)

  const stateBytes = state.status === "fulfilled" ? state.value : 0
  const activityBytes = activity.status === "fulfilled" ? activity.value.bytes : 0
  const dailyBytes = activity.status === "fulfilled" ? activity.value.dailyBytes : 0
  const recoveryBytes = recoveries.status === "fulfilled" ? recoveries.value.reduce((total, item) => total + item.bytes, 0) : 0
  const storage = estimate.status === "fulfilled" ? estimate.value : undefined
  return {
    stateBytes, localBytes, activityBytes, dailyBytes,
    activityCount: activity.status === "fulfilled" ? activity.value.count : 0,
    days: activity.status === "fulfilled" ? activity.value.days : 0,
    firstDay: activity.status === "fulfilled" ? activity.value.firstDay : null,
    lastDay: activity.status === "fulfilled" ? activity.value.lastDay : null,
    recoveryBytes,
    recoveryCount: recoveries.status === "fulfilled" ? recoveries.value.length : 0,
    knownBytes: stateBytes + localBytes + activityBytes + dailyBytes + recoveryBytes,
    originUsed: storage?.usage,
    originQuota: storage?.quota,
    warnings,
  }
}
