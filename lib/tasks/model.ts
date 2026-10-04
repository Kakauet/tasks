import { format, isValid, parseISO } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import type { AppState, Event, EventRecurrence, Task, TaskTag } from "./types";

export const DEFAULT_TAG_TEMPLATES: Array<{ name: string; color: string }> = [
  { name: "Trabajo", color: "#3b82f6" },
  { name: "Personal", color: "#10b981" },
  { name: "Urgente", color: "#ef4444" },
  { name: "Estudio", color: "#8b5cf6" },
]

export const createDefaultTags = (): TaskTag[] => {
  return DEFAULT_TAG_TEMPLATES.map((tag) => ({
    id: uuidv4(),
    name: tag.name,
    color: tag.color,
  }))
}

export const createDefaultState = (): AppState => ({
  tasks: [],
  events: [],
  tags: createDefaultTags(),
})

export const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)

export const normalizeDateOnlyString = (value?: string): string | undefined => {
  if (!value) return undefined

  try {
    return format(parseISO(value), "yyyy-MM-dd")
  } catch {
    return value
  }
}

export const normalizeTaskRecord = (task: Task): Task => ({
  ...task,
  dueDate: normalizeDateOnlyString(task.dueDate),
})

export const normalizeTaskPatch = (task: Partial<Task>): Partial<Task> => {
  if (!hasOwn(task, "dueDate")) {
    return task
  }

  return {
    ...task,
    dueDate: normalizeDateOnlyString(task.dueDate),
  }
}

export const normalizeEventRecurrence = (recurrence?: EventRecurrence): EventRecurrence | undefined => {
  if (!recurrence || recurrence.type === "none") {
    return undefined
  }

  return {
    type: recurrence.type,
    interval: Math.max(1, recurrence.interval || 1),
    endDate: normalizeDateOnlyString(recurrence.endDate),
    occurrences: recurrence.occurrences ? Math.max(1, recurrence.occurrences) : undefined,
  }
}

export const normalizeEventRecord = (event: Event): Event => {
  const date = normalizeDateOnlyString(event.date) ?? event.date
  const endDate = event.isMultiDay ? normalizeDateOnlyString(event.endDate) : undefined
  // A multi-day event must end after it starts; otherwise it is a single-day event.
  const isMultiDay = !!event.isMultiDay && !!endDate && validDate(endDate) && endDate > date
  const normalizedEvent: Event = {
    ...event,
    date,
    isMultiDay: event.isMultiDay === undefined ? undefined : isMultiDay,
    endDate: isMultiDay ? endDate : undefined,
    recurrence: event.parentEventId ? undefined : normalizeEventRecurrence(event.recurrence),
    startTime: event.isAllDay ? undefined : event.startTime,
    endTime: event.isAllDay ? undefined : event.endTime,
    grade: event.isGraded ? event.grade : undefined,
  }

  return normalizedEvent
}

export const normalizeEventPatch = (event: Partial<Event>): Partial<Event> => {
  const normalizedEvent: Partial<Event> = { ...event }

  if (hasOwn(event, "date") && event.date) {
    normalizedEvent.date = normalizeDateOnlyString(event.date) ?? event.date
  }

  if (hasOwn(event, "endDate")) {
    normalizedEvent.endDate = normalizeDateOnlyString(event.endDate)
  }

  if (hasOwn(event, "recurrence")) {
    normalizedEvent.recurrence = normalizeEventRecurrence(event.recurrence)
  }

  if (hasOwn(event, "isMultiDay") && !event.isMultiDay) {
    normalizedEvent.endDate = undefined
  }

  if (hasOwn(event, "isAllDay") && event.isAllDay) {
    normalizedEvent.startTime = undefined
    normalizedEvent.endTime = undefined
  }

  if (hasOwn(event, "isGraded") && !event.isGraded) {
    normalizedEvent.grade = undefined
  }

  return normalizedEvent
}

export const parsePersistedState = (raw: unknown): AppState | null => {
  if (!raw || typeof raw !== "object") return null

  const candidate = raw as Partial<AppState>
  if (!Array.isArray(candidate.tasks) || !Array.isArray(candidate.events) || !Array.isArray(candidate.tags)) {
    return null
  }
  if (!candidate.tasks.every(isTask) || !candidate.events.every(isEvent) || !candidate.tags.every(isTag)) return null
  for (const records of [candidate.tasks, candidate.events, candidate.tags]) {
    if (new Set(records.map((record) => record.id)).size !== records.length) return null
  }

  return {
    tasks: (candidate.tasks as Task[]).map(normalizeTaskRecord),
    events: (candidate.events as Event[]).map(normalizeEventRecord),
    tags: candidate.tags,
  }
}

/**
 * Lenient variant for data this app already saved (locally or in the cloud).
 * One damaged record must never discard the whole workspace, so fields are
 * repaired and only records without an identifier are dropped. Imports keep
 * using the strict parser, which rejects the whole file instead.
 */
export const repairPersistedState = (raw: unknown): AppState | null => {
  const strict = parsePersistedState(raw)
  if (strict) return strict
  if (!record(raw) || (!Array.isArray(raw.tasks) && !Array.isArray(raw.events) && !Array.isArray(raw.tags))) return null

  const now = new Date().toISOString()
  const today = format(new Date(), "yyyy-MM-dd")
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(record) : [])
  const withId = (items: Record<string, unknown>[]) => {
    const seen = new Set<string>()
    return items.filter((item): item is Record<string, unknown> & { id: string } =>
      nonEmptyString(item.id) && !seen.has(item.id) && !!seen.add(item.id))
  }
  const text = (value: unknown, fallback: string) => (nonEmptyString(value) ? value : fallback)
  const optionalText = (value: unknown) => (typeof value === "string" ? value : undefined)
  const optionalBoolean = (value: unknown) => (typeof value === "boolean" ? value : undefined)
  const optionalValidDate = (value: unknown) => (validDate(value) ? value : undefined)
  const positiveInteger = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : undefined
  const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
    options.includes(value as T) ? (value as T) : fallback
  const tagIds = (value: unknown) => (Array.isArray(value) ? value.filter(nonEmptyString) : [])

  const tasks = withId(list(raw.tasks)).map((task) => normalizeTaskRecord({
    id: task.id,
    title: text(task.title, "Sin título"),
    description: optionalText(task.description) ?? "",
    status: pick(task.status, ["todo", "inProgress", "done"] as const, "todo"),
    priority: pick(task.priority, ["low", "medium", "high"] as const, "medium"),
    dueDate: optionalValidDate(task.dueDate),
    weeklyPlanDate: optionalValidDate(task.weeklyPlanDate),
    weeklyPlanOrder: typeof task.weeklyPlanOrder === "number" && Number.isFinite(task.weeklyPlanOrder) ? task.weeklyPlanOrder : undefined,
    steps: withId(list(task.steps)).map((step) => ({ id: step.id, text: optionalText(step.text) ?? "", completed: step.completed === true })),
    tags: tagIds(task.tags),
    focusSeconds: optionalCount(task.focusSeconds) ? (task.focusSeconds as number | undefined) : undefined,
    focusSessions: optionalCount(task.focusSessions) ? (task.focusSessions as number | undefined) : undefined,
    createdAt: optionalValidDate(task.createdAt) ?? now,
    updatedAt: optionalValidDate(task.updatedAt) ?? now,
  }))

  const events = withId(list(raw.events)).map((event) => {
    const recurrence = record(event.recurrence) ? event.recurrence : undefined
    return normalizeEventRecord({
      id: event.id,
      title: text(event.title, "Sin título"),
      description: optionalText(event.description) ?? "",
      date: optionalValidDate(event.date) ?? today,
      endDate: optionalValidDate(event.endDate),
      startTime: optionalText(event.startTime),
      endTime: optionalText(event.endTime),
      isAllDay: optionalBoolean(event.isAllDay),
      isMultiDay: optionalBoolean(event.isMultiDay),
      isGraded: event.isGraded === true,
      grade: optionalText(event.grade),
      tags: tagIds(event.tags),
      parentEventId: nonEmptyString(event.parentEventId) ? event.parentEventId : undefined,
      color: optionalText(event.color),
      recurrence: recurrence && {
        type: pick(recurrence.type, ["none", "daily", "weekly", "monthly", "yearly"] as const, "none"),
        interval: positiveInteger(recurrence.interval) ?? 1,
        endDate: optionalValidDate(recurrence.endDate),
        occurrences: positiveInteger(recurrence.occurrences),
      },
    })
  })

  const tags = withId(list(raw.tags)).map((tag) => ({
    id: tag.id,
    name: text(tag.name, "Etiqueta"),
    color: text(tag.color, "#6b7280"),
  }))

  return { tasks, events, tags }
}

export const validateTask = (task: Partial<Task>): boolean => {
  return nonEmptyString(task.title)
}

export const validateEvent = (event: Partial<Event>): boolean => {
  return nonEmptyString(event.title) && validDate(event.date)
}

export const validateTag = (tag: Partial<TaskTag>): boolean => {
  return nonEmptyString(tag.name) && nonEmptyString(tag.color)
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
const validDate = (value: unknown): value is string => typeof value === "string" && isValid(parseISO(value))
const optionalDate = (value: unknown) => value === undefined || value === "" || validDate(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonEmptyString)
const optionalString = (value: unknown) => value === undefined || typeof value === "string"
const optionalCount = (value: unknown) => value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0)

function isTag(value: unknown): value is TaskTag {
  return record(value) && nonEmptyString(value.id) && nonEmptyString(value.name) && nonEmptyString(value.color)
}

function isTask(value: unknown): value is Task {
  return record(value) && nonEmptyString(value.id) && nonEmptyString(value.title) &&
    typeof value.description === "string" && ["todo", "inProgress", "done"].includes(value.status as string) &&
    ["low", "medium", "high"].includes(value.priority as string) && strings(value.tags) &&
    optionalDate(value.dueDate) && optionalDate(value.weeklyPlanDate) &&
    (value.weeklyPlanOrder === undefined || (typeof value.weeklyPlanOrder === "number" && Number.isFinite(value.weeklyPlanOrder))) &&
    optionalCount(value.focusSeconds) && optionalCount(value.focusSessions) &&
    validDate(value.createdAt) && validDate(value.updatedAt) && Array.isArray(value.steps) &&
    value.steps.every((step) => record(step) && nonEmptyString(step.id) && typeof step.text === "string" && typeof step.completed === "boolean")
}

function isEvent(value: unknown): value is Event {
  if (!record(value) || !nonEmptyString(value.id) || !nonEmptyString(value.title) ||
    typeof value.description !== "string" || !validDate(value.date) || !strings(value.tags) ||
    !optionalDate(value.endDate) || typeof value.isGraded !== "boolean") return false
  if (["isAllDay", "isMultiDay"].some((key) => value[key] !== undefined && typeof value[key] !== "boolean")) return false
  if (["startTime", "endTime", "grade", "parentEventId", "color"].some((key) => !optionalString(value[key]))) return false
  if (value.isMultiDay && (!validDate(value.endDate) || parseISO(value.endDate) < parseISO(value.date))) return false
  if (value.recurrence !== undefined) {
    const r = value.recurrence
    if (!record(r) || !["none", "daily", "weekly", "monthly", "yearly"].includes(r.type as string) ||
      typeof r.interval !== "number" || !Number.isInteger(r.interval) || r.interval < 1 ||
      !optionalDate(r.endDate) || (r.occurrences !== undefined &&
        (typeof r.occurrences !== "number" || !Number.isInteger(r.occurrences) || r.occurrences < 1))) return false
  }
  return true
}
