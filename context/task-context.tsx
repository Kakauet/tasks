"use client"

import { track, trackStateChange } from "@/lib/activity"
import { useAuth } from "@/context/auth-context"
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
import { loadLocalState, saveLocalState } from "@/lib/tasks/storage"
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
let lastStorageWarning = 0

interface History {
  past: AppState[]
  present: AppState
  future: AppState[]
}

// Interfaz del contexto
interface TaskContextType {
  isLoading: boolean
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
  const { user, supabase, isSupabaseConfigured, cloudStatus, isLoading: isAuthLoading } = useAuth()
  // Depend on the account, not on the user object that changes with every token refresh.
  const userId = user?.id ?? null
  const initialLoadDoneRef = useRef(false)
  const skipNextRemoteWriteRef = useRef(false)
  const lastSyncedAtRef = useRef<string | null>(null)

  const commitHistory = useCallback((next: History) => {
    historyRef.current = next
    setHistoryState(next)
  }, [])

  /** Replace the state without an undo entry (loading, remote updates). */
  const resetState = useCallback((state: AppState) => {
    skipNextRemoteWriteRef.current = true
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
    if (isAuthLoading) return
    let cancelled = false
    initialLoadDoneRef.current = false

    const loadInitialState = async () => {
      try {
        setIsLoading(true)
        const local = await loadLocalState()

        if (!userId || !supabase || !isSupabaseConfigured || cloudStatus !== "available") {
          if (!cancelled) {
            lastSyncedAtRef.current = null
            resetState(local.state)
          }
          return
        }

        const { data, error } = await supabase
          .from(REMOTE_STATE_TABLE)
          .select("data, updated_at")
          .eq("user_id", userId)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (cancelled) return
        const remoteState = repairPersistedState(data?.data)
        const remoteUpdatedAt = data?.updated_at ? Date.parse(data.updated_at) : Number.NaN
        const localSavedAt = local.savedAt ? Date.parse(local.savedAt) : Number.NaN
        // Changes made offline on this device are newer than the cloud copy: keep them and upload them.
        const localIsNewer = local.hasLocalData && Number.isFinite(localSavedAt) && Number.isFinite(remoteUpdatedAt) && localSavedAt > remoteUpdatedAt

        if (remoteState && !localIsNewer) {
          lastSyncedAtRef.current = data?.updated_at ?? null
          resetState(remoteState)
          return
        }

        resetState(local.state)

        if (local.hasLocalData) {
          const syncedAt = new Date().toISOString()
          const { error: upsertError } = await supabase.from(REMOTE_STATE_TABLE).upsert(
            {
              user_id: userId,
              data: local.state,
              updated_at: syncedAt,
            },
            { onConflict: "user_id" },
          )

          if (upsertError) {
            console.error("Error syncing initial local state to Supabase:", upsertError)
          } else {
            lastSyncedAtRef.current = syncedAt
          }
        }
      } catch (error) {
        console.error("Error loading initial state:", error)
        if (!cancelled) {
          const { state: localState } = await loadLocalState()
          resetState(localState)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          initialLoadDoneRef.current = true
        }
      }
    }

    void loadInitialState()

    return () => {
      cancelled = true
    }
  }, [userId, supabase, isSupabaseConfigured, cloudStatus, isAuthLoading, resetState])

  useEffect(() => {
    if (isLoading || !initialLoadDoneRef.current) return

    const stateToPersist: AppState = { tasks, events, tags }
    void saveLocalState(stateToPersist).catch(error => {
      console.error("Error saving local state:", error)
      if (Date.now() - lastStorageWarning > 30000) {
        lastStorageWarning = Date.now()
        toast.error(error instanceof Error && error.message.startsWith("No queda espacio")
          ? error.message
          : "No se pudo usar el almacenamiento comprimido. Exporta una copia de seguridad.")
      }
    })
    const timeoutId = setTimeout(() => {

      if (!userId || !supabase || !isSupabaseConfigured || cloudStatus !== "available") {
        return
      }

      if (skipNextRemoteWriteRef.current) {
        skipNextRemoteWriteRef.current = false
        return
      }

      const syncedAt = new Date().toISOString()
      lastSyncedAtRef.current = syncedAt
      void supabase
        .from(REMOTE_STATE_TABLE)
        .upsert(
          {
            user_id: userId,
            data: stateToPersist,
            updated_at: syncedAt,
          },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          if (error) {
            console.error("Error syncing state to Supabase:", error)
          }
        })
    }, 300) // Debounce by 300ms

    return () => clearTimeout(timeoutId)
  }, [tasks, events, tags, isLoading, userId, supabase, isSupabaseConfigured, cloudStatus])

  useEffect(() => {
    if (!userId || !supabase || !isSupabaseConfigured || cloudStatus !== "available") {
      return
    }

    const channel = supabase
      .channel(`taskmaster-user-state-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: REMOTE_STATE_TABLE,
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const payloadData = payload.new as { data?: unknown; updated_at?: string } | null
          const incomingUpdatedAt = payloadData?.updated_at ?? null
          if (incomingUpdatedAt && incomingUpdatedAt === lastSyncedAtRef.current) {
            return
          }

          const nextState = repairPersistedState(payloadData?.data)
          if (!nextState) return

          if (incomingUpdatedAt) {
            lastSyncedAtRef.current = incomingUpdatedAt
          }

          resetState(nextState)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, supabase, isSupabaseConfigured, cloudStatus, resetState])

  // Registrar un cambio de estado con historial de deshacer
  const recordChange = useCallback(
    (newState: AppState) => {
      const { past: previousPast, present: current } = historyRef.current
      if (current.tasks === newState.tasks && current.events === newState.events && current.tags === newState.tags) {
        return
      }

      skipNextRemoteWriteRef.current = false
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

    skipNextRemoteWriteRef.current = false
    const previous = previousPast[previousPast.length - 1]
    track("history.undo")
    trackStateChange(current, previous)
    commitHistory({ past: previousPast.slice(0, -1), present: previous, future: [current, ...previousFuture] })
  }, [commitHistory])

  const redo = useCallback(() => {
    const { past: previousPast, present: current, future: previousFuture } = historyRef.current
    if (previousFuture.length === 0) return

    skipNextRemoteWriteRef.current = false
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
