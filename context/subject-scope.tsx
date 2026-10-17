"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useTaskContext, type Event, type Subject, type Task } from "@/context/task-context"
import { GradesDialog } from "@/components/subjects/grades-dialog"
import { SubjectsDialog } from "@/components/subjects/subjects-dialog"
import { readStorage, writeStorage } from "@/lib/storage"
import { DEFAULT_THRESHOLD, inScope, isThreshold, subjectIdOf, summarizeSubject, todayString, type PendingThreshold, type SubjectScope, type SubjectSummary } from "@/lib/tasks/subjects"

const ENABLED_KEY = "taskmaster-subjects-enabled"
const COLLAPSED_KEY = "taskmaster-subjects-collapsed"
const THRESHOLD_KEY = "taskmaster-subjects-threshold"

interface SubjectScopeValue {
  /** Las asignaturas son opcionales: apagadas, la aplicación se comporta como antes. */
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  /** Filtro efectivo: siempre «all» al abrir, con la función apagada o si la asignatura ya no existe. */
  scope: SubjectScope
  setScope: (scope: SubjectScope) => void
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  /** Prioridad mínima de una tarea pendiente para que impida estar al día. */
  threshold: PendingThreshold
  setThreshold: (threshold: PendingThreshold) => void
  /** Asignaturas visibles en la barra lateral (las archivadas se gestionan aparte). */
  activeSubjects: Subject[]
  selectedSubject?: Subject
  summaries: ReadonlyMap<string, SubjectSummary>
  subjectOf: (item: { subjectId?: string }) => Subject | undefined
  scopeTasks: (tasks: Task[]) => Task[]
  scopeEvents: (events: Event[]) => Event[]
  /** Color propio del evento; si no tiene, el de su asignatura. */
  eventColor: (event: Event) => string | undefined
  /** Asignatura con la que debe empezar una tarea o evento nuevo. */
  defaultSubjectId?: string
  /** Abre la gestión de asignaturas, opcionalmente editando una concreta. */
  openManager: (editId?: string) => void
  openGrades: () => void
}

const SubjectScopeContext = createContext<SubjectScopeValue | undefined>(undefined)

export function SubjectScopeProvider({ children }: { children: ReactNode }) {
  const { tasks, events, subjects } = useTaskContext()
  const [storedEnabled, setStoredEnabled] = useState<boolean | null>(null)
  const [storedScope, setStoredScope] = useState<SubjectScope>("all")
  const [collapsed, setCollapsedState] = useState(false)
  const [threshold, setThresholdState] = useState<PendingThreshold>(DEFAULT_THRESHOLD)
  const [gradesOpen, setGradesOpen] = useState(false)
  const [today, setToday] = useState(() => todayString())
  const [manager, setManager] = useState<{ open: boolean; editId?: string }>({ open: false })

  useEffect(() => {
    const enabled = readStorage(ENABLED_KEY)
    setStoredEnabled(enabled === "1" ? true : enabled === "0" ? false : null)
    setCollapsedState(readStorage(COLLAPSED_KEY) === "1")
    const savedThreshold = readStorage(THRESHOLD_KEY)
    if (isThreshold(savedThreshold)) setThresholdState(savedThreshold)
  }, [])

  // El estado «al día» depende de la fecha: se recalcula al cambiar de día.
  useEffect(() => {
    const refresh = () => setToday(todayString())
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener("focus", refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  // Sin preferencia guardada, una cuenta que ya trae asignaturas (por ejemplo desde otro dispositivo) las muestra.
  const enabled = storedEnabled ?? subjects.length > 0
  const activeSubjects = useMemo(() => subjects.filter((subject) => !subject.archived), [subjects])
  const selectedSubject = enabled && storedScope !== "all" && storedScope !== "none" ? activeSubjects.find((subject) => subject.id === storedScope) : undefined
  const scope: SubjectScope = !enabled ? "all" : storedScope === "none" ? "none" : selectedSubject ? selectedSubject.id : "all"

  const setEnabled = useCallback((next: boolean) => {
    setStoredEnabled(next)
    // Al volver a activarlas se empieza otra vez por «Todas».
    if (!next) setStoredScope("all")
    writeStorage(ENABLED_KEY, next ? "1" : "0")
  }, [])
  // El filtro no se guarda: al abrir la aplicación siempre se empieza viendo todas las asignaturas.
  const setScope = useCallback((next: SubjectScope) => setStoredScope(next), [])
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next)
    writeStorage(COLLAPSED_KEY, next ? "1" : "0")
  }, [])

  const setThreshold = useCallback((next: PendingThreshold) => {
    setThresholdState(next)
    writeStorage(THRESHOLD_KEY, next)
  }, [])

  const summaries = useMemo(() => {
    const result = new Map<string, SubjectSummary>()
    if (enabled) for (const subject of subjects) result.set(subject.id, summarizeSubject(subject, tasks, events, today, threshold))
    return result
  }, [enabled, subjects, tasks, events, today, threshold])

  const subjectOf = useCallback(
    (item: { subjectId?: string }) => {
      const id = enabled ? subjectIdOf(item, subjects) : undefined
      return id ? subjects.find((subject) => subject.id === id) : undefined
    },
    [enabled, subjects],
  )
  const scopeTasks = useCallback((list: Task[]) => (scope === "all" ? list : list.filter((task) => inScope(task, scope, subjects))), [scope, subjects])
  const scopeEvents = useCallback((list: Event[]) => (scope === "all" ? list : list.filter((event) => inScope(event, scope, subjects))), [scope, subjects])
  const eventColor = useCallback((event: Event) => event.color ?? subjectOf(event)?.color, [subjectOf])

  const openManager = useCallback((editId?: string) => setManager({ open: true, editId }), [])
  const openGrades = useCallback(() => setGradesOpen(true), [])

  const value = useMemo<SubjectScopeValue>(
    () => ({
      enabled,
      setEnabled,
      scope,
      setScope,
      collapsed,
      setCollapsed,
      threshold,
      setThreshold,
      activeSubjects,
      selectedSubject,
      summaries,
      subjectOf,
      scopeTasks,
      scopeEvents,
      eventColor,
      defaultSubjectId: selectedSubject?.id,
      openManager,
      openGrades,
    }),
    [openManager, openGrades, threshold, setThreshold, enabled, setEnabled, scope, setScope, collapsed, setCollapsed, activeSubjects, selectedSubject, summaries, subjectOf, scopeTasks, scopeEvents, eventColor],
  )

  return (
    <SubjectScopeContext.Provider value={value}>
      {children}
      {manager.open && <SubjectsDialog open editId={manager.editId} threshold={threshold} onThresholdChange={setThreshold} onOpenChange={(open) => !open && setManager({ open: false })} />}
      {gradesOpen && <GradesDialog open onOpenChange={setGradesOpen} />}
    </SubjectScopeContext.Provider>
  )
}

export function useSubjectScope() {
  const context = useContext(SubjectScopeContext)
  if (context === undefined) throw new Error("useSubjectScope must be used within a SubjectScopeProvider")
  return context
}

