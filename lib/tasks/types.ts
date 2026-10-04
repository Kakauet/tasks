export type TaskStatus = "todo" | "inProgress" | "done"
export type TaskPriority = "low" | "medium" | "high"
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "yearly"

export interface TaskStep {
  id: string
  text: string
  completed: boolean
}

export interface TaskTag {
  id: string
  name: string
  color: string
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string
  weeklyPlanDate?: string
  weeklyPlanOrder?: number
  steps: TaskStep[]
  tags: string[] // IDs de tags
  focusSeconds?: number // Tiempo de estudio acumulado con el Pomodoro
  focusSessions?: number // Pomodoros completados
  createdAt: string
  updatedAt: string
}

export interface EventRecurrence {
  type: RecurrenceType
  interval: number // Cada cuántos días/semanas/meses/años
  endDate?: string // Fecha de finalización opcional
  occurrences?: number // Número de ocurrencias opcional
}

export interface Event {
  id: string
  title: string
  description: string
  date: string // Fecha de inicio
  endDate?: string // Fecha de fin para eventos de varios días
  startTime?: string // Add start time
  endTime?: string // Add end time
  isAllDay?: boolean // Add all-day flag
  isMultiDay?: boolean // Flag para eventos de varios días
  isGraded: boolean
  grade?: string
  tags: string[] // IDs of tags
  recurrence?: EventRecurrence
  parentEventId?: string // Para eventos recurrentes generados
  color?: string // Color personalizado para el evento
}

// Define the application state type
export interface AppState {
  tasks: Task[]
  events: Event[]
  tags: TaskTag[]
}

