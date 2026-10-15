"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useTaskHistory } from "@/hooks/use-task-history"
import { useTaskOperations } from "@/hooks/use-task-operations"
import { useTaskSync, type SyncState } from "@/hooks/use-task-sync"
import type { Event, Task, TaskStatus, TaskStep, TaskTag } from "@/lib/tasks/types"
export type { SyncState, SyncStatus } from "@/hooks/use-task-sync"
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

export function TaskProvider({ children }: { children: ReactNode }) {
  const { present, historyRef, resetState, update, recordChange, canUndo, canRedo, undo, redo } = useTaskHistory()
  const { isLoading, syncState, syncNow } = useTaskSync(present, historyRef, resetState)
  const { tasks, events, tags } = present
  const {
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
    bulkUpdateTasks,
    bulkDeleteTasks,
    searchTasks,
    filterTasksByTag,
    getTasksByStatus,
  } = useTaskOperations(present, update, recordChange)

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
