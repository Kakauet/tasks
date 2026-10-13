"use client"

import { track, trackStateChange } from "@/lib/activity"
import { useAuth } from "@/context/auth-context"
import { createBackup, saveRecovery } from "@/lib/data/backup"
import { isBlankState, mergeStates, sameState } from "@/lib/sync/merge"
import type { SupabaseClient } from "@supabase/supabase-js"
import { addDays, differenceInCalendarDays, format, isAfter, isBefore, isSameDay, parseISO } from "date-fns"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"

// Tipos y interfaces
import {
  createDefaultState,
  hasOwn,
  normalizeDateOnlyString,
  normalizeEventPatch,
  normalizeEventRecord,
  normalizeTaskPatch,
  normalizeTaskRecord,
  parsePersistedState,
  repairPersistedState,
  validateEvent,
  validateTag,
  validateTask,
} from "@/lib/tasks/model"
import { insertTask } from "@/lib/tasks/order"
import { generateRecurringEvents } from "@/lib/tasks/recurrence"
import { loadLocalState, saveLocalState, type SyncBase } from "@/lib/tasks/storage"
import type { AppState, Event, Task, TaskStatus, TaskStep, TaskTag } from "@/lib/tasks/types"
export type {
  AppState,
  Event,
  EventRecurrence,
  RecurrenceType,
  Task,
  TaskPriority,
  TaskStatus,
  TaskStep,
  TaskTag,
} from "@/lib/tasks/types"

const REMOTE_STATE_TABLE = "user_state"
const HISTORY_LIMIT = 50
const SYNC_DEBOUNCE_MS = 800
const POLL_INTERVAL = 30_000
const MIN_RETRY_DELAY = 2_000
const MAX_RETRY_DELAY = 60_000
const MAX_SYNC_ATTEMPTS = 5
let lastStorageWarning = 0

export type SyncStatus = "disabled" | "pending" | "synced" | "offline" | "error"
export interface SyncState {
  status: SyncStatus
  error: string | null
}

/** Each upload gets a later version than the copy it replaces, even if this device's clock is behind. */
const nextVersion = (previous: string | null) => {
  const previousTime = previous ? Date.parse(previous) : Number.NaN
  return new Date(Number.isFinite(previousTime) ? Math.max(Date.now(), previousTime + 1) : Date.now()).toISOString()
}

const syncErrorMessage = (error: unknown) => {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
  if (code === "42P01" || code === "PGRST205") return "Falta la tabla user_state en Supabase. Sigue docs/SUPABASE_SETUP.md."
  if (code === "42501") return "Supabase ha denegado el acceso a tus datos. Revisa las políticas de la tabla user_state."
  if (typeof message !== "string" || /fetch|network|load failed/i.test(message)) {
    return "No se puede conectar con la nube. Se reintentará automáticamente."
  }
  return message
}

interface History {
  past: AppState[]
  present: AppState
  future: AppState[]
}

// Interfaz del contexto
interface TaskContextType {
  isLoading: boolean
  syncState: SyncState
  syncNow: () => void
  tasks: Task[]
  events: Event[]
  tags: TaskTag[]
  importData: (data: unknown) => void
  exportData: () => {
    tasks: Task[]
    events: Event[]
    tags: TaskTag[]
    exportDate: string
    version: string
  }
  addTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void
  updateTask: (id: string, task: Partial<Task>) => void
  deleteTask: (id: string) => void
  addEvent: (event: Omit<Event, "id">) => void
  updateEvent: (id: string, event: Partial<Event>) => void
  deleteEvent: (id: string) => void
  addTag: (tag: Omit<TaskTag, "id">) => void
  updateTag: (id: string, tag: Partial<TaskTag>) => void
  deleteTag: (id: string) => void
  moveTask: (id: string, status: TaskStatus, targetIndex?: number) => void
  reorderTasks: (status: TaskStatus, sourceIndex: number, targetIndex: number) => void
  moveEvent: (id: string, newDate: string) => void
  addStep: (taskId: string, step: Omit<TaskStep, "id">) => void
  updateStep: (taskId: string, stepId: string, step: Partial<TaskStep>) => void
  deleteStep: (taskId: string, stepId: string) => void
  addTagToTask: (taskId: string, tagId: string) => void
  removeTagFromTask: (taskId: string, tagId: string) => void
  addFocusTime: (taskId: string, seconds: number, sessions: number) => void
  getEventsForDateRange: (startDate: Date, endDate: Date) => Event[]
  getEventsForDate: (date: Date) => Event[]
  reorderSteps: (taskId: string, sourceIndex: number, targetIndex: number) => void
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  bulkUpdateTasks: (updates: Array<{ id: string; updates: Partial<Task> }>) => void
  bulkDeleteTasks: (ids: string[]) => void
  searchTasks: (query: string) => Task[]
  filterTasksByTag: (tagIds: string[]) => Task[]
  getTasksByStatus: (status: TaskStatus) => Task[]
}

const TaskContext = createContext<TaskContextType | undefined>(undefined)

// Absent, false and empty values mean the same thing in a saved record.
const comparable = (value: unknown) => (value === undefined || value === false || value === "" ? null : value)
const sameValue = (a: unknown, b: unknown) => JSON.stringify(comparable(a)) === JSON.stringify(comparable(b))

/** True when applying `patch` would change at least one field of `record`. */
const changesRecord = <T extends object>(record: T, patch: Partial<T>) =>
  (Object.keys(patch) as Array<keyof T>).some((key) => !sameValue(record[key], patch[key]))

const trimmedTitle = (value: unknown) => (typeof value === "string" ? value.trim() : "")

/** Fields that decide where the occurrences of a recurring series fall. */
const SCHEDULE_FIELDS: Array<keyof Event> = ["date", "endDate", "isMultiDay", "recurrence"]
/** Fields that belong to one occurrence and survive edits to the whole series. */
const OCCURRENCE_FIELDS = new Set<keyof Event>(["id", "parentEventId", "date", "endDate", "isMultiDay", "recurrence", "grade"])

const startTimeRank = (event: Event) => (event.isAllDay || !event.startTime ? "" : event.startTime)
/** All-day and multi-day events first, then by start time. */
const compareEventsInDay = (a: Event, b: Event) =>
  Number(!a.isMultiDay) - Number(!b.isMultiDay) || startTimeRank(a).localeCompare(startTimeRank(b))

export function TaskProvider({ children }: { children: ReactNode }) {
  const [history, setHistoryState] = useState<History>(() => ({ past: [], present: createDefaultState(), future: [] }))
  // Mutations read the latest history synchronously, so several operations in
  // the same event handler build on each other instead of on a stale render.
  const historyRef = useRef(history)
  const [isLoading, setIsLoading] = useState(true)
  const { user, supabase, cloudStatus } = useAuth()
  // Depend on the account, not on the user object that changes with every token refresh.
  const userId = user?.id ?? null
  // Cloud sync runs only for a signed-in account on a reachable project, once local data is on screen.
  const cloudUserId = !isLoading && userId && supabase && cloudStatus === "available" ? userId : null
  const cloudUserRef = useRef<string | null>(null)
  const syncBaseRef = useRef<SyncBase | null>(null)
  /** The state a sync last put on screen or uploaded; any other state has changes to upload. */
  const appliedStateRef = useRef<AppState | null>(null)
  const syncRunningRef = useRef(false)
  const syncAgainRef = useRef(false)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const retryDelayRef = useRef(0)
  const runSyncRef = useRef<() => Promise<void>>(async () => {})
  const [syncState, setSyncStateValue] = useState<SyncState>({ status: "disabled", error: null })

  const setSyncState = useCallback((status: SyncStatus, error: string | null = null) => {
    setSyncStateValue((current) => (current.status === status && current.error === error ? current : { status, error }))
  }, [])

  const scheduleSync = useCallback((delay: number) => {
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => void runSyncRef.current(), delay)
  }, [])

  const commitHistory = useCallback((next: History) => {
    historyRef.current = next
    setHistoryState(next)
  }, [])

  /** Replace the state without an undo entry (loading, remote updates). */
  const resetState = useCallback((state: AppState) => {
    commitHistory({ past: [], present: state, future: [] })
  }, [commitHistory])

  // Estados derivados
  const { past, present, future } = history
  const canUndo = past.length > 0
  const canRedo = future.length > 0
  const { tasks, events, tags } = present

  const tasksByStatus = useMemo(
    () => ({
      todo: tasks.filter((task) => task.status === "todo"),
      inProgress: tasks.filter((task) => task.status === "inProgress"),
      done: tasks.filter((task) => task.status === "done"),
    }),
    [tasks],
  )

  useEffect(() => {
    let cancelled = false
    // Local data renders immediately; the cloud copy is merged in afterwards.
    void loadLocalState()
      .then(({ state, syncBase }) => {
        if (cancelled) return
        syncBaseRef.current = syncBase ?? null
        appliedStateRef.current = state
        resetState(state)
      })
      .catch((error) => console.error("Error loading initial state:", error))
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [resetState])

  useEffect(() => {
    if (isLoading) return

    void saveLocalState(present, syncBaseRef.current).catch(error => {
      console.error("Error saving local state:", error)
      if (Date.now() - lastStorageWarning > 30000) {
        lastStorageWarning = Date.now()
        toast.error(error instanceof Error && error.message.startsWith("No queda espacio")
          ? error.message
          : "No se pudo usar el almacenamiento comprimido. Exporta una copia de seguridad.")
      }
    })
  }, [present, isLoading])

  /**
   * One pull-merge-push round. The write only succeeds if the cloud copy is
   * still the one that was merged, so two devices saving at once never
   * overwrite each other: the loser gets "conflict" and merges again.
   */
  const syncOnce = useCallback(
    async (client: SupabaseClient, uid: string): Promise<"done" | "conflict" | "aborted"> => {
      const active = () => cloudUserRef.current === uid
      const known = syncBaseRef.current?.userId === uid ? syncBaseRef.current : null

      // Cheap check first: nothing changed on this device and the cloud copy is the one last merged.
      if (known?.version && sameState(historyRef.current.present, known.state)) {
        const { data, error } = await client.from(REMOTE_STATE_TABLE).select("updated_at").eq("user_id", uid).maybeSingle()
        if (error) throw error
        if (!active()) return "aborted"
        if (data?.updated_at === known.version) {
          appliedStateRef.current = historyRef.current.present
          return "done"
        }
      }

      const { data: row, error } = await client
        .from(REMOTE_STATE_TABLE)
        .select("data, updated_at")
        .eq("user_id", uid)
        .maybeSingle()
      if (error) throw error
      if (!active()) return "aborted"
      const remote = row ? repairPersistedState(row.data) : null
      if (row && !remote) throw new Error("La copia de la nube no tiene un formato válido y no se ha modificado.")

      const base = syncBaseRef.current
      if (base && base.userId !== uid && !isBlankState(historyRef.current.present)) {
        // This device holds the data of another account: keep it aside before switching to this account's data.
        await saveRecovery(await createBackup(historyRef.current.present)).catch((recoveryError) => {
          console.error("Error saving recovery before switching account:", recoveryError)
          throw new Error("No se pudo guardar una copia de los datos de la cuenta anterior. Exporta una copia de seguridad y vuelve a intentarlo.")
        })
        if (!active()) return "aborted"
        toast.info("Los datos que había en este dispositivo se han guardado como copia de recuperación.")
      }

      // Merge synchronously against the latest local state, so edits made while waiting are included.
      const local = historyRef.current.present
      const merged =
        base?.userId === uid
          ? remote ? mergeStates(base.state, local, remote) : local
          : base
            ? remote ?? createDefaultState()
            : remote ? mergeStates(null, local, remote) : local
      let onScreen = local
      if (!sameState(merged, local)) {
        appliedStateRef.current = merged
        onScreen = merged
        resetState(merged)
      }

      let version: string | null = row?.updated_at ?? null
      if (!remote || !sameState(merged, remote)) {
        const updatedAt = nextVersion(version)
        const request = row
          ? client
              .from(REMOTE_STATE_TABLE)
              .update({ data: merged, updated_at: updatedAt })
              .eq("user_id", uid)
              .eq("updated_at", row.updated_at)
          : client.from(REMOTE_STATE_TABLE).insert({ user_id: uid, data: merged, updated_at: updatedAt })
        const { data: written, error: writeError } = await request.select("updated_at")
        // Another device wrote (or created the row) since it was read.
        if (writeError?.code === "23505") return "conflict"
        if (writeError) throw writeError
        if (!written?.length) return "conflict"
        version = written[0].updated_at
      }
      if (!active()) return "aborted"

      const nextBase: SyncBase = { userId: uid, version, state: merged }
      syncBaseRef.current = nextBase
      const current = historyRef.current.present
      if (current === onScreen) appliedStateRef.current = current
      // Store the new base together with the state it belongs to.
      void saveLocalState(current, nextBase).catch((saveError) => console.error("Error saving local state:", saveError))
      return "done"
    },
    [resetState],
  )

  const runSync = useCallback(async () => {
    const uid = cloudUserRef.current
    if (!uid || !supabase) return
    if (syncRunningRef.current) {
      syncAgainRef.current = true
      return
    }

    syncRunningRef.current = true
    clearTimeout(syncTimerRef.current)
    try {
      for (let attempt = 1; ; attempt++) {
        syncAgainRef.current = false
        const result = await syncOnce(supabase, uid)
        if (result === "aborted") return
        if (result === "conflict") {
          if (attempt >= MAX_SYNC_ATTEMPTS) throw new Error("La nube no ha aceptado los cambios tras varios intentos.")
          continue
        }
        if (!syncAgainRef.current) break
      }
      retryDelayRef.current = 0
      const base = syncBaseRef.current
      setSyncState(base && sameState(historyRef.current.present, base.state) ? "synced" : "pending")
    } catch (error) {
      if (cloudUserRef.current !== uid) return
      console.error("Error syncing with the cloud:", error)
      const offline = typeof navigator !== "undefined" && navigator.onLine === false
      setSyncState(offline ? "offline" : "error", offline ? null : syncErrorMessage(error))
      retryDelayRef.current = Math.min(MAX_RETRY_DELAY, Math.max(MIN_RETRY_DELAY, retryDelayRef.current * 2))
      scheduleSync(retryDelayRef.current)
    } finally {
      syncRunningRef.current = false
    }
  }, [supabase, syncOnce, setSyncState, scheduleSync])
  runSyncRef.current = runSync

  const syncNow = useCallback(() => {
    retryDelayRef.current = 0
    void runSyncRef.current()
  }, [])

  // Start syncing when an account is signed in; stop (keeping local data) when it signs out.
  useEffect(() => {
    cloudUserRef.current = cloudUserId
    retryDelayRef.current = 0
    clearTimeout(syncTimerRef.current)
    if (!cloudUserId) {
      setSyncState("disabled")
      return
    }
    setSyncState("pending")
    void runSyncRef.current()
    return () => clearTimeout(syncTimerRef.current)
  }, [cloudUserId, setSyncState])

  // Upload local changes shortly after they happen.
  useEffect(() => {
    if (!cloudUserId || present === appliedStateRef.current) return
    setSyncStateValue((current) => (current.status === "synced" ? { status: "pending", error: null } : current))
    scheduleSync(SYNC_DEBOUNCE_MS)
  }, [present, cloudUserId, scheduleSync])

  // Catch up after being offline or in the background, and upload pending changes before the page is hidden.
  useEffect(() => {
    if (!cloudUserId) return
    const handleVisibility = () => {
      if (document.visibilityState === "visible" || historyRef.current.present !== appliedStateRef.current) void runSyncRef.current()
    }
    const poll = () => {
      if (document.visibilityState === "visible") void runSyncRef.current()
    }
    window.addEventListener("online", syncNow)
    document.addEventListener("visibilitychange", handleVisibility)
    // Polling only asks for the version, and covers projects without Realtime enabled.
    const intervalId = setInterval(poll, POLL_INTERVAL)
    return () => {
      window.removeEventListener("online", syncNow)
      document.removeEventListener("visibilitychange", handleVisibility)
      clearInterval(intervalId)
    }
  }, [cloudUserId, syncNow])

  useEffect(() => {
    if (!cloudUserId || !supabase) return

    // A unique topic: a channel with the same name may still be closing, and
    // Supabase would hand back that channel instead of a new one.
    const channel = supabase
      .channel(`taskmaster-user-state-${cloudUserId}-${uuidv4()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: REMOTE_STATE_TABLE,
          filter: `user_id=eq.${cloudUserId}`,
        },
        (payload) => {
          // The payload may be truncated for large states, so it only signals that there is something to fetch.
          const incomingUpdatedAt = (payload.new as { updated_at?: string } | null)?.updated_at
          if (incomingUpdatedAt && incomingUpdatedAt === syncBaseRef.current?.version) return
          void runSyncRef.current()
        },
      )
      .subscribe((status) => {
        // Also fires after reconnecting: fetch whatever changed while disconnected.
        if (status === "SUBSCRIBED") void runSyncRef.current()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [cloudUserId, supabase])

  // Registrar un cambio de estado con historial de deshacer
  const recordChange = useCallback(
    (newState: AppState) => {
      const { past: previousPast, present: current } = historyRef.current
      if (current.tasks === newState.tasks && current.events === newState.events && current.tags === newState.tags) {
        return
      }

      trackStateChange(current, newState)
      commitHistory({ past: [...previousPast, current].slice(-HISTORY_LIMIT), present: newState, future: [] })
    },
    [commitHistory],
  )

  /** Apply a change to the latest state; returning null or the same state is a no-op. */
  const update = useCallback(
    (producer: (state: AppState) => AppState | null) => {
      const current = historyRef.current.present
      const next = producer(current)
      if (next && next !== current) recordChange(next)
    },
    [recordChange],
  )

  /** Update one task; skips the history entry when nothing actually changes. */
  const updateTaskWith = useCallback(
    (id: string, change: (task: Task) => Partial<Task> | null) => {
      update((state) => {
        const index = state.tasks.findIndex((task) => task.id === id)
        if (index === -1) return null
        const current = state.tasks[index]
        const patch = change(current)
        if (!patch) return null
        const normalizedPatch = normalizeTaskPatch(patch)
        if (!changesRecord(current, normalizedPatch)) return null
        const nextTasks = [...state.tasks]
        nextTasks[index] = normalizeTaskRecord({ ...current, ...normalizedPatch, updatedAt: new Date().toISOString() })
        return { ...state, tasks: nextTasks }
      })
    },
    [update],
  )

  const undo = useCallback(() => {
    const { past: previousPast, present: current, future: previousFuture } = historyRef.current
    if (previousPast.length === 0) return

    const previous = previousPast[previousPast.length - 1]
    track("history.undo")
    trackStateChange(current, previous)
    commitHistory({ past: previousPast.slice(0, -1), present: previous, future: [current, ...previousFuture] })
  }, [commitHistory])

  const redo = useCallback(() => {
    const { past: previousPast, present: current, future: previousFuture } = historyRef.current
    if (previousFuture.length === 0) return

    const next = previousFuture[0]
    track("history.redo")
    trackStateChange(current, next)
    commitHistory({ past: [...previousPast, current].slice(-HISTORY_LIMIT), present: next, future: previousFuture.slice(1) })
  }, [commitHistory])

  // Configurar atajos de teclado para undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Solo activar si no se está escribiendo en un campo
      const target = e.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return

      const hasModifier = e.ctrlKey || e.metaKey
      if (!hasModifier || e.altKey) return
      const key = e.key.toLowerCase()

      if (key === "z" && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [undo, redo])

  const searchTasks = useCallback(
    (query: string): Task[] => {
      const normalizedQuery = query.trim().toLocaleLowerCase("es")
      if (!normalizedQuery) return tasks

      return tasks.filter(
        (task) =>
          task.title.toLocaleLowerCase("es").includes(normalizedQuery) ||
          task.description.toLocaleLowerCase("es").includes(normalizedQuery) ||
          task.steps.some((step) => step.text.toLocaleLowerCase("es").includes(normalizedQuery)),
      )
    },
    [tasks],
  )

  const filterTasksByTag = useCallback(
    (tagIds: string[]): Task[] => {
      if (tagIds.length === 0) return tasks
      return tasks.filter((task) => task.tags.some((tagId) => tagIds.includes(tagId)))
    },
    [tasks],
  )

  const getTasksByStatus = useCallback(
    (status: TaskStatus): Task[] => {
      return tasksByStatus[status] || []
    },
    [tasksByStatus],
  )

  const bulkUpdateTasks = useCallback(
    (updates: Array<{ id: string; updates: Partial<Task> }>) => {
      if (updates.length === 0) return

      update((state) => {
        const updatesById = new Map(updates.map((item) => [item.id, normalizeTaskPatch(item.updates)]))
        const now = new Date().toISOString()
        let hasChanges = false

        const newTasks = state.tasks.map((task) => {
          const patch = updatesById.get(task.id)
          if (!patch || !changesRecord(task, patch)) return task
          hasChanges = true
          return normalizeTaskRecord({ ...task, ...patch, updatedAt: now })
        })

        return hasChanges ? { ...state, tasks: newTasks } : null
      })
    },
    [update],
  )

  const bulkDeleteTasks = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      const idsSet = new Set(ids)
      update((state) => {
        const newTasks = state.tasks.filter((task) => !idsSet.has(task.id))
        return newTasks.length === state.tasks.length ? null : { ...state, tasks: newTasks }
      })
    },
    [update],
  )

  const addTask = useCallback(
    (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
      if (!validateTask(task)) {
        console.error("Invalid task data:", task)
        return
      }

      const now = new Date().toISOString()
      const newTask: Task = {
        ...task,
        title: task.title.trim(),
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      }

      update((state) => ({ ...state, tasks: insertTask(state.tasks, normalizeTaskRecord(newTask), task.status, 0) }))
    },
    [update],
  )

  const updateTask = useCallback(
    (id: string, task: Partial<Task>) => {
      if (Object.keys(task).length === 0) return
      updateTaskWith(id, () => {
        if (!hasOwn(task, "title")) return task
        const title = trimmedTitle(task.title)
        // A task always keeps a title; an empty one would make the saved data invalid.
        if (title) return { ...task, title }
        const rest = { ...task }
        delete rest.title
        return rest
      })
    },
    [updateTaskWith],
  )

  const deleteTask = useCallback(
    (id: string) => {
      update((state) => {
        const newTasks = state.tasks.filter((t) => t.id !== id)
        return newTasks.length === state.tasks.length ? null : { ...state, tasks: newTasks }
      })
    },
    [update],
  )

  const addEvent = useCallback(
    (event: Omit<Event, "id">) => {
      if (!validateEvent(event)) {
        console.error("Invalid event data:", event)
        return
      }

      const normalizedEvent = normalizeEventRecord({ ...event, title: event.title.trim(), id: uuidv4() })
      const newEvents = [normalizedEvent]

      // Si el evento tiene recurrencia, generar los eventos recurrentes
      if (normalizedEvent.recurrence) {
        try {
          newEvents.push(...generateRecurringEvents(normalizedEvent, normalizedEvent.recurrence))
        } catch (error) {
          console.error("Error generating recurring events:", error)
        }
      }

      update((state) => ({ ...state, events: [...state.events, ...newEvents] }))
    },
    [update],
  )

  const updateEvent = useCallback(
    (id: string, event: Partial<Event>) => {
      update((state) => {
        const currentEvent = state.events.find((existingEvent) => existingEvent.id === id)
        if (!currentEvent) return null

        const patch: Partial<Event> = { ...event }
        if (hasOwn(patch, "title")) {
          const title = trimmedTitle(patch.title)
          if (title) patch.title = title
          else delete patch.title
        }
        if (hasOwn(patch, "date") && !validateEvent({ title: "x", date: patch.date })) delete patch.date
        const normalizedPatch = normalizeEventPatch(patch)
        if (!changesRecord(currentEvent, normalizedPatch)) return null

        if (currentEvent.parentEventId) {
          const updatedChildEvent = normalizeEventRecord({
            ...currentEvent,
            ...normalizedPatch,
            recurrence: undefined,
          })
          return {
            ...state,
            events: state.events.map((existingEvent) => (existingEvent.id === id ? updatedChildEvent : existingEvent)),
          }
        }

        const hasRecurrenceUpdate = hasOwn(normalizedPatch, "recurrence")
        const updatedParentEvent = normalizeEventRecord({
          ...currentEvent,
          ...normalizedPatch,
          recurrence: hasRecurrenceUpdate ? normalizedPatch.recurrence : currentEvent.recurrence,
        })

        const scheduleChanged = SCHEDULE_FIELDS.some((key) => !sameValue(currentEvent[key], updatedParentEvent[key]))
        if (!scheduleChanged) {
          // Same dates: update every occurrence in place so per-occurrence data (grades, moved dates) survives.
          const seriesPatch = Object.fromEntries(
            Object.entries(normalizedPatch).filter(([key]) => !OCCURRENCE_FIELDS.has(key as keyof Event)),
          ) as Partial<Event>
          return {
            ...state,
            events: state.events.map((existingEvent) => {
              if (existingEvent.id === id) return updatedParentEvent
              if (existingEvent.parentEventId !== id) return existingEvent
              return normalizeEventRecord({ ...existingEvent, ...seriesPatch, recurrence: undefined })
            }),
          }
        }

        const updatedEvents: Event[] = []
        for (const existingEvent of state.events) {
          if (existingEvent.id === id) updatedEvents.push(updatedParentEvent)
          else if (existingEvent.parentEventId !== id) updatedEvents.push(existingEvent)
        }

        if (updatedParentEvent.recurrence) {
          try {
            updatedEvents.push(...generateRecurringEvents(updatedParentEvent, updatedParentEvent.recurrence))
          } catch (error) {
            console.error("Error updating recurring events:", error)
          }
        }

        return { ...state, events: updatedEvents }
      })
    },
    [update],
  )

  const deleteEvent = useCallback(
    (id: string) => {
      // Eliminar el evento principal y todas sus instancias recurrentes
      update((state) => {
        const newEvents = state.events.filter((e) => e.id !== id && e.parentEventId !== id)
        return newEvents.length === state.events.length ? null : { ...state, events: newEvents }
      })
    },
    [update],
  )

  // Funciones de gestión de etiquetas
  const addTag = useCallback(
    (tag: Omit<TaskTag, "id">) => {
      if (!validateTag(tag)) {
        console.error("Invalid tag data:", tag)
        return
      }
      const newTag: TaskTag = { ...tag, name: tag.name.trim(), id: uuidv4() }
      update((state) => ({ ...state, tags: [...state.tags, newTag] }))
    },
    [update],
  )

  const updateTag = useCallback(
    (id: string, tag: Partial<TaskTag>) => {
      update((state) => {
        const current = state.tags.find((t) => t.id === id)
        if (!current) return null
        const patch: Partial<TaskTag> = { ...tag, id }
        if (hasOwn(patch, "name")) {
          const name = trimmedTitle(patch.name)
          if (name) patch.name = name
          else delete patch.name
        }
        if (hasOwn(patch, "color") && !trimmedTitle(patch.color)) delete patch.color
        if (!changesRecord(current, patch)) return null
        return { ...state, tags: state.tags.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
      })
    },
    [update],
  )

  const deleteTag = useCallback(
    (id: string) => {
      update((state) => {
        if (!state.tags.some((t) => t.id === id)) return null
        // Eliminar la etiqueta de todas las tareas y eventos
        return {
          tasks: state.tasks.map((task) => (task.tags.includes(id) ? { ...task, tags: task.tags.filter((tagId) => tagId !== id) } : task)),
          events: state.events.map((event) => (event.tags.includes(id) ? { ...event, tags: event.tags.filter((tagId) => tagId !== id) } : event)),
          tags: state.tags.filter((t) => t.id !== id),
        }
      })
    },
    [update],
  )

  // Funciones de movimiento y reordenamiento
  const moveTask = useCallback(
    (id: string, status: TaskStatus, targetIndex?: number) => {
      update((state) => {
        const taskToMove = state.tasks.find((t) => t.id === id)
        if (!taskToMove) return null
        const nextTasks = insertTask(state.tasks, taskToMove, status, targetIndex)
        return nextTasks === state.tasks ? null : { ...state, tasks: nextTasks }
      })
    },
    [update],
  )

  const reorderTasks = useCallback(
    (status: TaskStatus, sourceIndex: number, targetIndex: number) => {
      update((state) => {
        const tasksInStatus = state.tasks.filter((t) => t.status === status)

        // Asegurar que los índices sean válidos
        if (sourceIndex < 0 || sourceIndex >= tasksInStatus.length || targetIndex < 0 || targetIndex > tasksInStatus.length) {
          return null
        }
        if (sourceIndex === targetIndex || sourceIndex + 1 === targetIndex) return null

        const reorderedTasks = [...tasksInStatus]
        const [movedTask] = reorderedTasks.splice(sourceIndex, 1)
        const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
        reorderedTasks.splice(adjustedTargetIndex, 0, movedTask)

        return { ...state, tasks: [...state.tasks.filter((t) => t.status !== status), ...reorderedTasks] }
      })
    },
    [update],
  )

  const moveEvent = useCallback(
    (id: string, newDate: string) => {
      update((state) => {
        const eventToMove = state.events.find((e) => e.id === id)
        if (!eventToMove) return null
        const date = normalizeDateOnlyString(newDate) ?? newDate
        if (date === eventToMove.date) return null

        const durationInDays =
          eventToMove.isMultiDay && eventToMove.endDate
            ? differenceInCalendarDays(parseISO(eventToMove.endDate), parseISO(eventToMove.date))
            : 0

        const movedEvent = normalizeEventRecord({
          ...eventToMove,
          date,
          endDate:
            eventToMove.isMultiDay && eventToMove.endDate
              ? format(addDays(parseISO(date), durationInDays), "yyyy-MM-dd")
              : undefined,
        })

        if (eventToMove.parentEventId) {
          return { ...state, events: state.events.map((existingEvent) => (existingEvent.id === id ? movedEvent : existingEvent)) }
        }

        const movedEvents: Event[] = []
        for (const existingEvent of state.events) {
          if (existingEvent.id === id) movedEvents.push(movedEvent)
          else if (existingEvent.parentEventId !== id) movedEvents.push(existingEvent)
        }

        if (movedEvent.recurrence) {
          try {
            movedEvents.push(...generateRecurringEvents(movedEvent, movedEvent.recurrence))
          } catch (error) {
            console.error("Error moving recurring event:", error)
          }
        }

        return { ...state, events: movedEvents }
      })
    },
    [update],
  )

  // Funciones de gestión de pasos
  const addStep = useCallback(
    (taskId: string, step: Omit<TaskStep, "id">) => {
      updateTaskWith(taskId, (task) => ({ steps: [...task.steps, { ...step, id: uuidv4() }] }))
    },
    [updateTaskWith],
  )

  const updateStep = useCallback(
    (taskId: string, stepId: string, step: Partial<TaskStep>) => {
      updateTaskWith(taskId, (task) => ({ steps: task.steps.map((s) => (s.id === stepId ? { ...s, ...step, id: stepId } : s)) }))
    },
    [updateTaskWith],
  )

  const deleteStep = useCallback(
    (taskId: string, stepId: string) => {
      updateTaskWith(taskId, (task) => ({ steps: task.steps.filter((s) => s.id !== stepId) }))
    },
    [updateTaskWith],
  )

  const reorderSteps = useCallback(
    (taskId: string, sourceIndex: number, targetIndex: number) => {
      updateTaskWith(taskId, (task) => {
        if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) || sourceIndex < 0 || sourceIndex >= task.steps.length || targetIndex < 0 || targetIndex >= task.steps.length || sourceIndex === targetIndex) return null
        const steps = [...task.steps]
        const [movedStep] = steps.splice(sourceIndex, 1)
        steps.splice(targetIndex, 0, movedStep)
        return { steps }
      })
    },
    [updateTaskWith],
  )

  // Funciones de consulta de eventos
  const getEventsForDateRange = useCallback(
    (startDate: Date, endDate: Date): Event[] => {
      return events.filter((event) => {
        const eventStartDate = parseISO(event.date)

        // Para eventos de un solo día
        if (!event.isMultiDay || !event.endDate) {
          return eventStartDate >= startDate && eventStartDate <= endDate
        }

        // Para eventos de varios días: se solapa con el rango
        const eventEndDate = parseISO(event.endDate)
        return eventStartDate <= endDate && eventEndDate >= startDate
      })
    },
    [events],
  )

  const getEventsForDate = useCallback(
    (date: Date): Event[] => {
      return events
        .filter((event) => {
          // Para eventos de un solo día
          if (!event.isMultiDay || !event.endDate) {
            return isSameDay(parseISO(event.date), date)
          }

          // Para eventos de varios días: la fecha está entre inicio y fin (inclusive)
          const eventStartDate = parseISO(event.date)
          const eventEndDate = parseISO(event.endDate)
          return (
            (isSameDay(eventStartDate, date) || isAfter(date, eventStartDate)) &&
            (isSameDay(eventEndDate, date) || isBefore(date, eventEndDate))
          )
        })
        .sort(compareEventsInDay)
    },
    [events],
  )

  const importData = useCallback(
    (data: unknown) => {
      const parsedState = parsePersistedState(data)
      if (!parsedState) {
        throw new Error("Formato de importación inválido")
      }

      // Ensure imported state is propagated to remote sync immediately.
      recordChange(parsedState)
    },
    [recordChange],
  )

  const exportData = useCallback(() => {
    return {
      tasks,
      events,
      tags,
      exportDate: new Date().toISOString(),
      version: "2.0",
    }
  }, [tasks, events, tags])

  const addTagToTask = useCallback(
    (taskId: string, tagId: string) => {
      updateTaskWith(taskId, (task) => (task.tags.includes(tagId) ? null : { tags: [...task.tags, tagId] }))
    },
    [updateTaskWith],
  )

  const removeTagFromTask = useCallback(
    (taskId: string, tagId: string) => {
      updateTaskWith(taskId, (task) => (task.tags.includes(tagId) ? { tags: task.tags.filter((id) => id !== tagId) } : null))
    },
    [updateTaskWith],
  )

  const addFocusTime = useCallback(
    (taskId: string, seconds: number, sessions: number) => {
      if (!(seconds > 0)) return
      updateTaskWith(taskId, (task) => ({
        focusSeconds: Math.round((task.focusSeconds ?? 0) + seconds),
        focusSessions: (task.focusSessions ?? 0) + Math.max(0, sessions),
      }))
    },
    [updateTaskWith],
  )

  const contextValue = useMemo<TaskContextType>(
    () => ({
      isLoading,
      syncState,
      syncNow,
      tasks,
      events,
      tags,
      importData,
      exportData,
      addTask,
      updateTask,
      deleteTask,
      addEvent,
      updateEvent,
      deleteEvent,
      addTag,
      updateTag,
      deleteTag,
      moveTask,
      reorderTasks,
      moveEvent,
      addStep,
      updateStep,
      deleteStep,
      addTagToTask,
      removeTagFromTask,
      addFocusTime,
      getEventsForDateRange,
      getEventsForDate,
      reorderSteps,
      canUndo,
      canRedo,
      undo,
      redo,
      bulkUpdateTasks,
      bulkDeleteTasks,
      searchTasks,
      filterTasksByTag,
      getTasksByStatus,
    }),
    [
      isLoading,
      syncState,
      syncNow,
      tasks,
      events,
      tags,
      importData,
      exportData,
      addTask,
      updateTask,
      deleteTask,
      addEvent,
      updateEvent,
      deleteEvent,
      addTag,
      updateTag,
      deleteTag,
      moveTask,
      reorderTasks,
      moveEvent,
      addStep,
      updateStep,
      deleteStep,
      addTagToTask,
      removeTagFromTask,
      addFocusTime,
      getEventsForDateRange,
      getEventsForDate,
      reorderSteps,
      canUndo,
      canRedo,
      undo,
      redo,
      bulkUpdateTasks,
      bulkDeleteTasks,
      searchTasks,
      filterTasksByTag,
      getTasksByStatus,
    ],
  )

  return <TaskContext.Provider value={contextValue}>{children}</TaskContext.Provider>
}

export function useTaskContext() {
  const context = useContext(TaskContext)
  if (context === undefined) {
    throw new Error("useTaskContext must be used within a TaskProvider")
  }
  return context
}
