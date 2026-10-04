"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTaskContext, type Task } from "@/context/task-context"
import { track, entityKey } from "@/lib/activity"
import {
  FOCUS_PRESETS,
  MIN_CREDITED_SECONDS,
  SESSIONS_PER_LONG_BREAK,
  advanceFocus,
  changePreset,
  createFocusState,
  elapsedFocusSeconds,
  formatClock,
  formatStudyTime,
  isLongBreak,
  parseFocusState,
  pauseFocus,
  phaseDuration,
  remainingMs,
  resumeFocus,
  skipPhase,
  type FocusAdvance,
  type FocusPresetId,
  type FocusTimerState,
} from "@/lib/focus"
import { readStorage, writeStorage } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { Minimize2, Pause, Play, SkipForward, X } from "lucide-react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

const TIMER_STORAGE_KEY = "taskmaster-focus-timer"
const PRESET_STORAGE_KEY = "taskmaster-focus-preset"
const NO_TASK = "none"

interface FocusTimerContextType {
  isOpen: boolean
  openTimer: () => void
}

const FocusTimerContext = createContext<FocusTimerContextType>({ isOpen: false, openTimer: () => {} })

export const useFocusTimer = () => useContext(FocusTimerContext)

/** Two soft sine tones; silently skipped where audio is unavailable. */
function playChime() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    ;[660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime + index * 0.18
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.75)
    })
    window.setTimeout(() => void context.close(), 1600)
  } catch {
    /* sound is optional */
  }
}

export function FocusTimerProvider({ children }: { children: ReactNode }) {
  const { tasks, isLoading, addFocusTime } = useTaskContext()
  const [timer, setTimer] = useState<FocusTimerState | null>(null)
  const [preset, setPreset] = useState<FocusPresetId>("25-5")
  const [minimized, setMinimized] = useState(false)
  const timerRef = useRef<FocusTimerState | null>(null)
  const restoredRef = useRef(false)

  const commit = useCallback((next: FocusTimerState | null) => {
    timerRef.current = next
    setTimer(next)
    writeStorage(TIMER_STORAGE_KEY, next ? JSON.stringify(next) : "")
  }, [])

  const taskTitle = useCallback((taskId: string | null) => tasks.find((task) => task.id === taskId)?.title, [tasks])

  /** Record study time and tell the student what just happened. */
  const applyAdvance = useCallback((result: FocusAdvance, taskId: string | null, silent = false) => {
    if (taskId && result.creditedSeconds > 0) addFocusTime(taskId, result.creditedSeconds, result.finishedFocus)
    commit(result.state)
    if (silent) return
    if (result.finishedFocus > 0 && result.state.phase === "break") {
      playChime()
      const title = taskTitle(taskId)
      toast.success(isLongBreak(result.state) ? "¡Cuatro pomodoros! Tómate un descanso largo." : "¡Buen trabajo! Toca descansar.", {
        description: title ? `${formatStudyTime(result.creditedSeconds)} sumados a «${title}».` : undefined,
      })
      track("focus.complete", { entity: taskId ? entityKey(taskId) : "none", seconds: result.creditedSeconds, sessions: result.state.completedSessions })
    } else if (result.finishedBreak) {
      playChime()
      toast("Descanso terminado", { description: "Cuando quieras, pulsa ▶ para el siguiente pomodoro." })
    }
  }, [addFocusTime, commit, taskTitle])

  // Restore a timer left running before a reload, crediting phases that ended meanwhile.
  useEffect(() => {
    if (isLoading || restoredRef.current) return
    restoredRef.current = true
    const savedPreset = readStorage(PRESET_STORAGE_KEY)
    if (savedPreset === "25-5" || savedPreset === "50-10") setPreset(savedPreset)
    const saved = parseFocusState(readStorage(TIMER_STORAGE_KEY))
    if (!saved) return
    const taskId = saved.taskId && tasks.some((task) => task.id === saved.taskId) ? saved.taskId : null
    applyAdvance(advanceFocus({ ...saved, taskId }, Date.now()), taskId, true)
  }, [isLoading, tasks, applyAdvance])

  // A deleted task can no longer receive time; the timer keeps running without it.
  useEffect(() => {
    if (!isLoading && timer?.taskId && !tasks.some((task) => task.id === timer.taskId)) commit({ ...timer, taskId: null })
  }, [isLoading, tasks, timer, commit])

  const stop = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    const seconds = elapsedFocusSeconds(current, Date.now())
    const title = taskTitle(current.taskId)
    if (current.taskId && title && seconds >= MIN_CREDITED_SECONDS) {
      addFocusTime(current.taskId, seconds, 0)
      toast.success(`${formatStudyTime(seconds)} de estudio guardados.`, { description: `En «${title}».` })
    }
    track("focus.stop", { seconds })
    commit(null)
  }, [addFocusTime, commit, taskTitle])

  const openTimer = useCallback(() => {
    setMinimized(false)
    if (!timerRef.current) {
      track("focus.open", { preset })
      commit(createFocusState(null, preset, Date.now(), false))
    }
  }, [commit, preset])

  const toggle = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    const now = Date.now()
    commit(current.endsAt === null ? resumeFocus(current, now) : pauseFocus(current, now))
  }, [commit])

  const skip = useCallback(() => {
    const current = timerRef.current
    if (current) applyAdvance(skipPhase(current, Date.now()), current.taskId)
  }, [applyAdvance])

  const selectPreset = useCallback((next: FocusPresetId) => {
    setPreset(next)
    writeStorage(PRESET_STORAGE_KEY, next)
    const current = timerRef.current
    if (current) commit(changePreset(current, next, Date.now()))
  }, [commit])

  const selectTask = useCallback((taskId: string | null) => {
    const current = timerRef.current
    if (current) commit({ ...current, taskId })
  }, [commit])

  const complete = useCallback(() => {
    const current = timerRef.current
    if (current) applyAdvance(advanceFocus(current, Date.now()), current.taskId)
  }, [applyAdvance])

  const contextValue = useMemo(() => ({ isOpen: timer !== null, openTimer }), [timer, openTimer])

  return (
    <FocusTimerContext.Provider value={contextValue}>
      {children}
      {timer && (
        <FocusTimerPanel
          timer={timer}
          tasks={tasks}
          minimized={minimized}
          onMinimizedChange={setMinimized}
          onToggle={toggle}
          onSkip={skip}
          onStop={stop}
          onPresetChange={selectPreset}
          onTaskChange={selectTask}
          onComplete={complete}
        />
      )}
    </FocusTimerContext.Provider>
  )
}

function ProgressRing({ progress, size, stroke }: { progress: number; size: number; stroke: number }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(1, Math.max(0, progress))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} stroke="currentColor" className="opacity-[0.13]" />
      {clamped > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-500 ease-linear motion-reduce:transition-none"
        />
      )}
    </svg>
  )
}

const iconButton =
  "flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function FocusTimerPanel({
  timer,
  tasks,
  minimized,
  onMinimizedChange,
  onToggle,
  onSkip,
  onStop,
  onPresetChange,
  onTaskChange,
  onComplete,
}: {
  timer: FocusTimerState
  tasks: Task[]
  minimized: boolean
  onMinimizedChange: (minimized: boolean) => void
  onToggle: () => void
  onSkip: () => void
  onStop: () => void
  onPresetChange: (preset: FocusPresetId) => void
  onTaskChange: (taskId: string | null) => void
  onComplete: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const running = timer.endsAt !== null

  useEffect(() => {
    setNow(Date.now())
    if (!running) return
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [running, timer])

  const remaining = remainingMs(timer, now)
  useEffect(() => {
    if (running && remaining <= 0) onComplete()
  }, [running, remaining, onComplete])

  const clock = formatClock(remaining)
  const isFocus = timer.phase === "focus"
  const duration = phaseDuration(timer)
  const notStarted = !running && remaining === duration
  const phaseLabel = isFocus ? "Concentración" : isLongBreak(timer) ? "Descanso largo" : "Descanso"
  const progress = 1 - remaining / duration
  const accent = isFocus ? "text-primary" : "text-[hsl(var(--status-success))]"
  const cycleNumber = (timer.completedSessions % SESSIONS_PER_LONG_BREAK) + (isFocus ? 1 : 0) || SESSIONS_PER_LONG_BREAK
  const activeTask = tasks.find((task) => task.id === timer.taskId)
  // Time already spent belongs to the chosen task, so it can only change before starting.
  const canChangeTask = !isFocus || notStarted
  const selectableTasks = tasks.filter((task) => task.status !== "done" || task.id === timer.taskId)

  // The tab title shows the countdown while the student works in another tab.
  const originalTitle = useRef<string | null>(null)
  useEffect(() => {
    if (originalTitle.current === null) originalTitle.current = document.title
    if (notStarted) document.title = originalTitle.current
    else document.title = `${running ? "" : "⏸ "}${clock} · ${phaseLabel}`
  }, [clock, phaseLabel, running, notStarted])
  useEffect(() => () => { if (originalTitle.current !== null) document.title = originalTitle.current }, [])

  const playLabel = running ? "Pausar" : notStarted ? (isFocus ? "Empezar pomodoro" : "Empezar descanso") : "Continuar"

  if (minimized) {
    return (
      <div className="focus-timer-dock fixed z-50 flex items-center gap-0.5 rounded-full border border-border/70 bg-popover/95 p-1 shadow-[var(--shadow-floating)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-200">
        <button
          type="button"
          onClick={() => onMinimizedChange(false)}
          aria-label={`Abrir pomodoro: ${phaseLabel}, quedan ${clock}`}
          className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn("flex", accent)}><ProgressRing progress={progress} size={28} stroke={3} /></span>
          <span className="text-sm font-semibold tabular-nums">{clock}</span>
        </button>
        <button type="button" onClick={onToggle} aria-label={playLabel} className={cn(iconButton, "h-8 w-8")}>
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
        </button>
      </div>
    )
  }

  return (
    <section
      aria-label="Pomodoro"
      className="focus-timer-dock fixed z-50 w-[calc(100vw-1.5rem)] max-w-[18.5rem] rounded-[22px] border border-border/70 bg-popover/95 px-5 pb-5 pt-3.5 shadow-[var(--shadow-floating)] backdrop-blur-xl animate-in fade-in-0 slide-in-from-bottom-3 duration-200"
    >
      <header className="flex items-center justify-between">
        <span className="text-[13px] font-semibold">Pomodoro</span>
        <div className="-mr-2 flex items-center">
          <button type="button" onClick={() => onMinimizedChange(true)} aria-label="Minimizar" title="Minimizar" className={cn(iconButton, "h-8 w-8")}>
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onStop} aria-label="Cerrar y guardar el tiempo" title="Cerrar y guardar el tiempo" className={cn(iconButton, "h-8 w-8")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mt-2 flex justify-center">
        <div className={cn("relative flex items-center justify-center", accent)}>
          <ProgressRing progress={progress} size={156} stroke={6} />
          <div className="absolute flex flex-col items-center">
            <span className="text-[34px] font-semibold leading-none tracking-tight text-foreground tabular-nums" role="timer" aria-live="off">
              {clock}
            </span>
            <span className={cn("mt-2 text-[11px] font-semibold uppercase tracking-[0.08em]", accent)}>{phaseLabel}</span>
            <span className="mt-1 text-[11px] text-muted-foreground tabular-nums">
              {isFocus ? `${cycleNumber} de ${SESSIONS_PER_LONG_BREAK}` : "Respira un poco"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {canChangeTask ? (
          <Select value={timer.taskId ?? NO_TASK} onValueChange={(value) => onTaskChange(value === NO_TASK ? null : value)}>
            <SelectTrigger aria-label="Tarea en la que vas a trabajar" className="h-10 rounded-xl border-border/70 bg-muted/40 text-left text-sm">
              <SelectValue placeholder="Elige una tarea" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NO_TASK}>Sin tarea</SelectItem>
              {selectableTasks.map((task) => (
                <SelectItem key={task.id} value={task.id}><span className="line-clamp-1">{task.title}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="flex h-10 items-center justify-center truncate rounded-xl bg-muted/40 px-3 text-sm font-medium" title={activeTask?.title}>
            <span className="truncate">{activeTask?.title ?? "Sin tarea"}</span>
          </p>
        )}
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          {activeTask
            ? activeTask.focusSeconds ? `${formatStudyTime(activeTask.focusSeconds)} estudiados` : "Se guardará el tiempo en esta tarea"
            : "Elige una tarea para guardar el tiempo"}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center">
        <div role="radiogroup" aria-label="Duración" className="flex w-fit flex-col gap-0.5">
          {(Object.keys(FOCUS_PRESETS) as FocusPresetId[]).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={timer.preset === id}
              aria-label={`${FOCUS_PRESETS[id].focus / 60_000} minutos de concentración y ${FOCUS_PRESETS[id].shortBreak / 60_000} de descanso`}
              onClick={() => onPresetChange(id)}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                timer.preset === id ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground",
              )}
            >
              {FOCUS_PRESETS[id].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={playLabel}
          title={playLabel}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full shadow-sm transition-[background-color,transform] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
            isFocus ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-[hsl(var(--status-success))] text-white hover:opacity-90",
          )}
        >
          {running ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
        </button>
        <button
          type="button"
          onClick={onSkip}
          aria-label={isFocus ? "Pasar al descanso" : "Saltar el descanso"}
          title={isFocus ? "Pasar al descanso" : "Saltar el descanso"}
          className={cn(iconButton, "h-10 w-10 justify-self-end")}
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>
    </section>
  )
}
