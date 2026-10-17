"use client"

import { useCallback, useMemo } from "react"
import { v4 as uuidv4 } from "uuid"
import { addDays, differenceInCalendarDays, format, isAfter, isBefore, isSameDay, parseISO } from "date-fns"
import {
  cleanAliases,
  hasOwn,
  normalizeDateOnlyString,
  normalizeEventPatch,
  normalizeEventRecord,
  normalizeTaskPatch,
  normalizeTaskRecord,
  parsePersistedState,
  validateEvent,
  validateSubject,
  validateTag,
  validateTask,
} from "@/lib/tasks/model"
import { insertTask } from "@/lib/tasks/order"
import { generateRecurringEvents } from "@/lib/tasks/recurrence"
import type { AppState, Event, Subject, Task, TaskStatus, TaskStep, TaskTag } from "@/lib/tasks/types"
import type { StateProducer } from "@/lib/tasks/history"
import { applyTitleDetection, type TitleDetection } from "@/lib/tasks/subjects"

/** What a subject change assigned on its own, so the caller can tell the user and offer undo. */
export type SubjectDetection = Pick<TitleDetection, "tasks" | "events">

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

/** Domain commands use the history writer to read the latest state, even before React renders. */
export function useTaskOperations(
  present: AppState,
  update: (producer: StateProducer) => void,
  recordChange: (state: AppState) => void,
) {
  const { tasks, events, tags, subjects } = present
  const tasksByStatus = useMemo(
    () => ({
      todo: tasks.filter((task) => task.status === "todo"),
      inProgress: tasks.filter((task) => task.status === "inProgress"),
      done: tasks.filter((task) => task.status === "done"),
    }),
    [tasks],
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
          ...state,
          tasks: state.tasks.map((task) => (task.tags.includes(id) ? { ...task, tags: task.tags.filter((tagId) => tagId !== id) } : task)),
          events: state.events.map((event) => (event.tags.includes(id) ? { ...event, tags: event.tags.filter((tagId) => tagId !== id) } : event)),
          tags: state.tags.filter((t) => t.id !== id),
        }
      })
    },
    [update],
  )

  // Asignaturas: una por tarea o evento. Borrarla nunca borra su contenido.
  /** Its own history step, so «Deshacer» takes back the assignments and keeps the subject. */
  const detectSubject = useCallback(
    (id: string): SubjectDetection => {
      let detected: SubjectDetection = { tasks: 0, events: 0 }
      update((state) => {
        const result = applyTitleDetection(state, { only: [id] })
        detected = result
        return result.state === state ? null : result.state
      })
      return { tasks: detected.tasks, events: detected.events }
    },
    [update],
  )

  const addSubject = useCallback(
    (subject: Omit<Subject, "id">): ({ id: string } & SubjectDetection) | undefined => {
      if (!validateSubject(subject)) {
        console.error("Invalid subject data:", subject)
        return undefined
      }
      const name = subject.name.trim()
      const newSubject: Subject = { ...subject, name, aliases: cleanAliases(subject.aliases, name), id: uuidv4() }
      if (!newSubject.aliases) delete newSubject.aliases
      update((state) => ({ ...state, subjects: [...state.subjects, newSubject] }))
      return { id: newSubject.id, ...detectSubject(newSubject.id) }
    },
    [update, detectSubject],
  )

  const updateSubject = useCallback(
    (id: string, subject: Partial<Subject>): SubjectDetection => {
      let detect = false
      update((state) => {
        const current = state.subjects.find((s) => s.id === id)
        if (!current) return null
        const patch: Partial<Subject> = { ...subject, id }
        if (hasOwn(patch, "name")) {
          const name = trimmedTitle(patch.name)
          if (name) patch.name = name
          else delete patch.name
        }
        if (hasOwn(patch, "color") && !trimmedTitle(patch.color)) delete patch.color
        // A new name may repeat a nickname, so both are cleaned together.
        if (hasOwn(patch, "aliases") || patch.name !== undefined) patch.aliases = cleanAliases(hasOwn(patch, "aliases") ? patch.aliases : current.aliases, patch.name ?? current.name)
        if (!changesRecord(current, patch)) return null
        const next = { ...state, subjects: state.subjects.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
        // A new name or nickname, or coming back from the archive, may match titles nobody has assigned yet.
        const renamed = patch.name !== undefined && patch.name !== current.name
        const restored = hasOwn(patch, "archived") && !patch.archived && !!current.archived
        const newAliases = (patch.aliases ?? []).some((alias) => !current.aliases?.includes(alias))
        detect = renamed || restored || newAliases
        return next
      })
      return detect ? detectSubject(id) : { tasks: 0, events: 0 }
    },
    [update, detectSubject],
  )

  const deleteSubject = useCallback(
    (id: string) => {
      update((state) => {
        if (!state.subjects.some((s) => s.id === id)) return null
        const now = new Date().toISOString()
        const withoutSubject = <T extends { subjectId?: string }>(record: T): T => {
          if (record.subjectId !== id) return record
          const { subjectId: _removed, ...rest } = record
          return rest as T
        }
        return {
          ...state,
          tasks: state.tasks.map((task) => (task.subjectId === id ? { ...withoutSubject(task), updatedAt: now } : task)),
          events: state.events.map(withoutSubject),
          subjects: state.subjects.filter((s) => s.id !== id),
        }
      })
    },
    [update],
  )

  const moveSubject = useCallback(
    (id: string, targetIndex: number) => {
      update((state) => {
        const from = state.subjects.findIndex((s) => s.id === id)
        if (from === -1 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= state.subjects.length || targetIndex === from) return null
        const next = [...state.subjects]
        const [moved] = next.splice(from, 1)
        next.splice(targetIndex, 0, moved)
        return { ...state, subjects: next }
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
      subjects,
      exportDate: new Date().toISOString(),
      version: "2.0",
    }
  }, [tasks, events, tags, subjects])

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

  return { importData, exportData, addTask, updateTask, deleteTask, addEvent, updateEvent, deleteEvent, addTag, updateTag, deleteTag, addSubject, updateSubject, deleteSubject, moveSubject, moveTask, reorderTasks, moveEvent, addStep, updateStep, deleteStep, addTagToTask, removeTagFromTask, addFocusTime, getEventsForDateRange, getEventsForDate, reorderSteps, bulkUpdateTasks, bulkDeleteTasks, searchTasks, filterTasksByTag, getTasksByStatus }
}
