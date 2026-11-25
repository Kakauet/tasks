export const TIMETABLE_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"] as const
export const TIMETABLE_LABEL_LIMIT = 80
export const TIMETABLE_ROW_LIMIT = 30
export const TIMETABLE_ENABLED_KEY = "taskmaster-timetable-enabled"

export type TimetableRow = { id: string; start: string; end: string } & (
  { kind: "lesson"; lessons: string[] } | { kind: "break"; label: string }
)

export interface TimetableDraft {
  title: string
  rows: TimetableRow[]
}

export interface Timetable extends TimetableDraft {
  updatedAt: string
}

const lesson = (start: string, end: string, ...lessons: string[]): TimetableRow =>
  ({ id: start, start, end, kind: "lesson", lessons })

export const DEFAULT_TIMETABLE: TimetableDraft = {
  title: "Horario 26–27",
  rows: [
    lesson("08:00", "08:55", "Valenciano", "Valenciano", "Inglés", "Esp / Filo", "Esp / Filo"),
    lesson("08:55", "09:50", "Mates", "Castellano", "DT/Geo/Quím", "Optativa", "Bio / Fís"),
    lesson("09:50", "10:45", "Optativa", "Mates", "Optativa", "Mates", "DT/Geo/Quím"),
    { id: "10:45", start: "10:45", end: "11:15", kind: "break", label: "Patio" },
    lesson("11:15", "12:10", "Bio / Fís", "Optativa", "Esp / Filo", "Inglés", "Valenciano"),
    lesson("12:10", "13:05", "Esp / Filo", "Bio / Fís", "Castellano", "Esp / Filo", "Castellano"),
    lesson("13:05", "14:00", "Inglés", "DT/Geo/Quím", "Mates", "Bio / Fís", "Esp / Filo"),
    lesson("14:10", "15:05", "DT/Geo/Quím", "Reli / Val", "", "Tutoría", ""),
  ],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)
const isLabel = (value: unknown): value is string =>
  typeof value === "string" && value.length <= TIMETABLE_LABEL_LIMIT
const isTime = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)

export function validateTimetable(draft: TimetableDraft): string | null {
  if (!draft.title.trim()) return "Escribe un nombre para el horario."
  if (draft.rows.some(({ start, end }) => !isTime(start) || !isTime(end) || start >= end)) {
    return "Indica una hora de inicio y una de fin posterior en cada franja."
  }
  if (draft.rows.some((row) => row.kind === "break" && !row.label.trim())) {
    return "Escribe un nombre para cada descanso."
  }
  const rows = [...draft.rows].sort((a, b) => a.start.localeCompare(b.start))
  const overlapping = rows.find((row, index) => index > 0 && rows[index - 1].end > row.start)
  return overlapping ? `La franja de las ${overlapping.start} coincide con la anterior.` : null
}

export function parseTimetable(value: unknown): Timetable | undefined {
  if (!isRecord(value) || !isLabel(value.title) || typeof value.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.updatedAt)) || !Array.isArray(value.rows) ||
      value.rows.length > TIMETABLE_ROW_LIMIT) return undefined

  const rows: TimetableRow[] = []
  const ids = new Set<string>()
  for (const row of value.rows) {
    if (!isRecord(row) || !isLabel(row.id) || !row.id.trim() || ids.has(row.id) ||
        !isTime(row.start) || !isTime(row.end)) return undefined
    ids.add(row.id)
    const time = { id: row.id, start: row.start, end: row.end }
    if (row.kind === "break" && isLabel(row.label)) {
      rows.push({ ...time, kind: "break", label: row.label.trim() })
    } else if (row.kind === "lesson" && Array.isArray(row.lessons) &&
               row.lessons.length === TIMETABLE_DAYS.length && row.lessons.every(isLabel)) {
      rows.push({ ...time, kind: "lesson", lessons: row.lessons.map((label) => label.trim()) })
    } else {
      return undefined
    }
  }

  const draft = { title: value.title.trim(), rows }
  if (validateTimetable(draft)) return undefined
  rows.sort((a, b) => a.start.localeCompare(b.start))
  return { ...draft, updatedAt: new Date(value.updatedAt).toISOString() }
}
