import { differenceInCalendarDays, format, parseISO } from "date-fns"
import type { AppState, Event, Subject, Task } from "./types"

export type SubjectStatus = "pending" | "upToDate"

/**
 * Qué tareas pendientes impiden estar al día: solo las de prioridad alta, de media para arriba o
 * todas. Con «manual» no se calcula nada: cada asignatura está como la marque el usuario.
 */
export type PendingThreshold = "high" | "medium" | "any" | "manual"
export const DEFAULT_THRESHOLD: PendingThreshold = "medium"
export const THRESHOLDS: PendingThreshold[] = ["high", "medium", "any", "manual"]
/** Completa la frase «Una asignatura está al día cuando…». */
export const THRESHOLD_LABEL: Record<PendingThreshold, string> = {
  high: "No le quedan tareas de prioridad alta",
  medium: "No le quedan tareas de prioridad media ni alta",
  any: "No le queda ninguna tarea",
  manual: "Lo marco yo en cada una",
}
/** Estado de una asignatura sin marcar cuando el estado se marca a mano. */
export const MANUAL_DEFAULT: SubjectStatus = "upToDate"

export const isThreshold = (value: unknown): value is PendingThreshold => THRESHOLDS.includes(value as PendingThreshold)

/** En modo manual el recuento sigue el umbral por defecto, solo como dato. */
export const countsAsPending = (task: Pick<Task, "priority">, threshold: PendingThreshold) =>
  threshold === "any" || (threshold === "high" ? task.priority === "high" : task.priority !== "low")

export interface SubjectUpcoming {
  kind: "task" | "event"
  title: string
  date: string
  daysAway: number
}

export interface SubjectSummary {
  status: SubjectStatus
  /** Estado fijado a mano en la asignatura; manda sobre el cálculo. */
  manual?: Subject["manual"]
  /** Estado que daría el cálculo; sin cálculo (modo manual), `undefined`. */
  computed?: SubjectStatus
  /** Fijado a mano mientras las demás se calculan: se marca con una chincheta. */
  pinned: boolean
  /** Tareas pendientes que impiden estar al día según el umbral. */
  blocking: number
  /** Tareas pendientes de menor prioridad: se muestran como «sin prisa» y no cuentan. */
  relaxed: number
  /** Todas las tareas pendientes de la asignatura. */
  pending: number
  /** Tareas pendientes con fecha pasada; solo informativo, no cambia el estado. */
  overdue: number
  next?: SubjectUpcoming
  averageGrade?: number
}

/** Valor del filtro de la barra lateral: todo, solo lo que no tiene asignatura, o una asignatura. */
export type SubjectScope = "all" | "none" | (string & {})

export const todayString = (now = new Date()) => format(now, "yyyy-MM-dd")

/** Una asignatura archivada o borrada deja de actuar como tal: sus elementos se leen como «sin asignatura». */
export const subjectIdOf = (item: { subjectId?: string }, subjects: Subject[]) =>
  item.subjectId && subjects.some((subject) => subject.id === item.subjectId) ? item.subjectId : undefined

export function inScope(item: { subjectId?: string }, scope: SubjectScope, subjects: Subject[]): boolean {
  if (scope === "all") return true
  const id = subjectIdOf(item, subjects)
  return scope === "none" ? id === undefined : id === scope
}

/** «7,5», «7.5» y «15/20» son notas; el resto de textos («Notable») no se pueden promediar. */
export function parseGrade(grade?: string): number | null {
  const match = grade?.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+(?:[.,]\d+)?))?$/)
  if (!match) return null
  const value = Number(match[1].replace(",", "."))
  const max = match[2] ? Number(match[2].replace(",", ".")) : 10
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value > max) return null
  return (value / max) * 10
}

export function averageGrade(events: Event[]): number | undefined {
  const grades = events.filter((event) => event.isGraded).map((event) => parseGrade(event.grade)).filter((value): value is number => value !== null)
  if (grades.length === 0) return undefined
  return grades.reduce((total, value) => total + value, 0) / grades.length
}

/**
 * Estar al día depende solo de la prioridad: no queda ninguna tarea pendiente
 * que alcance el umbral (por defecto media o alta). Las fechas no intervienen;
 * las vencidas solo se cuentan como dato. Se puede fijar a mano en la asignatura.
 */
export function summarizeSubject(
  subject: Pick<Subject, "id" | "manual">,
  tasks: Task[],
  events: Event[],
  today = todayString(),
  threshold: PendingThreshold = DEFAULT_THRESHOLD,
): SubjectSummary {
  const pendingTasks = tasks.filter((task) => task.subjectId === subject.id && task.status !== "done")
  const subjectEvents = events.filter((event) => event.subjectId === subject.id)
  const blocking = pendingTasks.filter((task) => countsAsPending(task, threshold)).length

  const upcoming: SubjectUpcoming[] = [
    ...pendingTasks.filter((task) => task.dueDate && task.dueDate >= today).map((task) => ({ kind: "task" as const, title: task.title, date: task.dueDate as string })),
    ...subjectEvents.filter((event) => event.date >= today).map((event) => ({ kind: "event" as const, title: event.title, date: event.date })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
    .map((item) => ({ ...item, daysAway: differenceInCalendarDays(parseISO(item.date), parseISO(today)) }))

  const computed: SubjectStatus | undefined = threshold === "manual" ? undefined : blocking > 0 ? "pending" : "upToDate"
  return {
    status: subject.manual ?? computed ?? MANUAL_DEFAULT,
    manual: subject.manual,
    computed,
    pinned: !!subject.manual && threshold !== "manual",
    blocking,
    relaxed: pendingTasks.length - blocking,
    pending: pendingTasks.length,
    overdue: pendingTasks.filter((task) => task.dueDate && task.dueDate < today).length,
    next: upcoming[0],
    averageGrade: averageGrade(subjectEvents),
  }
}

export const STATUS_LABEL: Record<SubjectStatus, string> = {
  pending: "Pendiente",
  upToDate: "Al día",
}

const plain = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

/** «Examen Castellano», «examen final»… se pueden calificar sin pedirlo. */
export const looksLikeExam = (title: string) => /\bexam(en|enes)?\b/.test(plain(title))

/** Nombre y apodos de una asignatura, en el orden en que se muestran. */
export const subjectNames = (subject: Pick<Subject, "name" | "aliases">) => [subject.name, ...(subject.aliases ?? [])]

/** Asignatura (no archivada) cuyo nombre o algún apodo aparece completo en el título; gana el texto más largo. */
export function findSubjectInTitle(title: string, subjects: Subject[]): Subject | undefined {
  const text = plain(title)
  let best: Subject | undefined
  let bestLength = 0
  for (const subject of subjects) {
    if (subject.archived) continue
    for (const candidate of subjectNames(subject)) {
      const name = plain(candidate).trim()
      if (name.length > bestLength && containsWord(text, name)) {
        best = subject
        bestLength = name.length
      }
    }
  }
  return best
}

function containsWord(text: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return !!name && new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text)
}

export interface TitleDetection {
  state: AppState
  /** Tareas y eventos que han recibido asignatura. */
  tasks: number
  events: number
  /** Eventos que han pasado a ser calificables. */
  exams: number
}

/**
 * Aplica lo que el título deja claro y nadie ha decidido aún: lo que no tiene asignatura pasa a la
 * que aparece en su título y, con `exams`, los eventos llamados «examen» pasan a ser calificables.
 * Nunca cambia una asignatura ya elegida. Con `only`, solo asigna esas asignaturas (la recién creada
 * o renombrada), aunque el título se compara con todas para que gane siempre el nombre más largo.
 */
export function applyTitleDetection(
  state: AppState,
  { only, exams = false, now = new Date().toISOString() }: { only?: string[]; exams?: boolean; now?: string } = {},
): TitleDetection {
  const allowed = only && new Set(only)
  const match = (record: { title: string; subjectId?: string }) => {
    if (subjectIdOf(record, state.subjects)) return undefined
    const subject = findSubjectInTitle(record.title, state.subjects)
    return subject && (!allowed || allowed.has(subject.id)) ? subject.id : undefined
  }
  let taskCount = 0
  let eventCount = 0
  let examCount = 0
  const tasks = state.tasks.map((task) => {
    const subjectId = match(task)
    if (!subjectId) return task
    taskCount++
    return { ...task, subjectId, updatedAt: now }
  })
  const events = state.events.map((event) => {
    const subjectId = match(event)
    const graded = exams && !event.isGraded && looksLikeExam(event.title)
    if (!subjectId && !graded) return event
    if (subjectId) eventCount++
    if (graded) examCount++
    return { ...event, ...(subjectId && { subjectId }), ...(graded && { isGraded: true }) }
  })
  if (!taskCount && !eventCount && !examCount) return { state, tasks: 0, events: 0, exams: 0 }
  return { state: { ...state, tasks, events }, tasks: taskCount, events: eventCount, exams: examCount }
}

/** «3 tareas y 1 evento», para avisar de lo que se ha asignado solo. */
export function describeDetection({ tasks, events }: Pick<TitleDetection, "tasks" | "events">): string {
  const parts = [tasks && `${tasks} ${tasks === 1 ? "tarea" : "tareas"}`, events && `${events} ${events === 1 ? "evento" : "eventos"}`].filter(Boolean)
  return parts.join(" y ")
}

export type GradeState = "graded" | "text" | "missing" | "upcoming"
export interface GradeEntry { event: Event; value: number | null; state: GradeState }
export interface GradeGroup { subject?: Subject; entries: GradeEntry[]; average?: number }
export interface GradeReport { groups: GradeGroup[]; average?: number }

/**
 * Notas agrupadas por asignatura, con la media de cada una y la media de las
 * medias (cada asignatura pesa igual). Solo promedian las notas numéricas.
 */
export function buildGradeReport(subjects: Subject[], events: Event[], today = todayString()): GradeReport {
  const graded = events.filter((event) => event.isGraded)
  const entryOf = (event: Event): GradeEntry => {
    const value = parseGrade(event.grade)
    const state: GradeState = value !== null ? "graded" : event.grade?.trim() ? "text" : event.date < today ? "missing" : "upcoming"
    return { event, value, state }
  }
  const byDate = (a: GradeEntry, b: GradeEntry) => b.event.date.localeCompare(a.event.date)
  const known = new Set(subjects.map((subject) => subject.id))
  const make = (subject: Subject | undefined, list: Event[]): GradeGroup => {
    const entries = list.map(entryOf).sort(byDate)
    return { subject, entries, average: averageGrade(list) }
  }
  const groups: GradeGroup[] = [
    ...[...subjects.filter((subject) => !subject.archived), ...subjects.filter((subject) => subject.archived)].map((subject) =>
      make(subject, graded.filter((event) => event.subjectId === subject.id))),
    make(undefined, graded.filter((event) => !event.subjectId || !known.has(event.subjectId))),
  ].filter((group) => group.entries.length > 0)
  const averages = groups.map((group) => group.average).filter((value): value is number => value !== undefined)
  return { groups, average: averages.length ? averages.reduce((total, value) => total + value, 0) / averages.length : undefined }
}

export const formatDaysAway = (days: number) => (days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`)

export const formatAverage = (value: number) => value.toLocaleString("es", { maximumFractionDigits: 1 })

/** Colores sugeridos para asignaturas nuevas; se elige el primero que aún no está en uso. */
export const SUBJECT_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"]

export const nextSubjectColor = (subjects: Subject[]) =>
  SUBJECT_COLORS.find((color) => !subjects.some((subject) => subject.color.toLowerCase() === color)) ?? SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length]
