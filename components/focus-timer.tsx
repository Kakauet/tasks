"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
  hasStarted,
  isLongBreak,
  parseFocusState,
  pauseFocus,
  phaseDuration,
  remainingMs,
  resumeFocus,
  skipPhase,
  switchTask,
  type FocusAdvance,
  type FocusPresetId,
  type FocusTimerState,
} from "@/lib/focus"
import { readStorage, writeStorage } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { CheckCircle2, Circle, CircleDashed, Clock, Minimize2, Pause, Play, SkipForward, X } from "lucide-react"
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

const TIMER_STORAGE_KEY = "taskmaster-focus-timer"
const PRESET_STORAGE_KEY = "taskmaster-focus-preset"
const MINIMIZED_STORAGE_KEY = "taskmaster-focus-minimized"
const NO_TASK = "none"

interface FocusTimerContextType {
  isOpen: boolean
  /** Task receiving the time while the timer is open. */
  taskId: string | null
  running: boolean
  /** Open or expand the timer, optionally handing it to a task. */
  openTimer: (taskId?: string) => void
}

const FocusTimerContext = createContext<FocusTimerContextType>({ isOpen: false, taskId: null, running: false, openTimer: () => {} })

export const useFocusTimer = () => useContext(FocusTimerContext)

let audioContext: AudioContext | null = null

/** Browsers only allow sound after a gesture, so every click on the timer unlocks it for the chime. */
function unlockAudio() {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return null
      audioContext = new AudioContextClass()
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {})
    return audioContext
  } catch {
    return null
  }
}

/** Two soft sine tones; silently skipped where audio is unavailable. */
function playChime() {
  const context = unlockAudio()
  if (!context) return
  try {
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
  } catch {
    /* sound is optional */
  }
}

export function FocusTimerProvider({ children }: { children: ReactNode }) {
  const { tasks, isLoading, addFocusTime } = useTaskContext()
  const [timer, setTimer] = useState<FocusTimerState | null>(null)
  const [preset, setPreset] = useState<FocusPresetId>("25-5")
  const [minimized, setMinimizedState] = useState(false)
  const timerRef = useRef<FocusTimerState | null>(null)
  const restoredRef = useRef(false)

  const commit = useCallback((next: FocusTimerState | null) => {
    timerRef.current = next
    setTimer(next)
    writeStorage(TIMER_STORAGE_KEY, next ? JSON.stringify(next) : "")
  }, [])

  const setMinimized = useCallback((next: boolean) => {
    setMinimizedState(next)
    writeStorage(MINIMIZED_STORAGE_KEY, next ? "1" : "")
  }, [])

  const taskTitle = useCallback((taskId: string | null) => tasks.find((task) => task.id === taskId)?.title, [tasks])

  /** Record study time and tell the student what just happened. */
  const applyAdvance = useCallback((result: FocusAdvance, taskId: string | null, silent = false) => {
    if (taskId && result.creditedSeconds > 0) addFocusTime(taskId, result.creditedSeconds, result.finishedFocus)
    commit(result.state)
    const title = taskTitle(taskId)
    if (silent) {
      // The pomodoro ended while the app was closed: still say where the time went.
      if (title && result.creditedSeconds > 0) {
        toast.success(`${formatStudyTime(result.creditedSeconds)} sumados a «${title}».`, { description: "El pomodoro terminó mientras la app estaba cerrada." })
      }
      return
    }
    if (result.finishedFocus > 0 && result.state.phase === "break") {
      playChime()
      toast.success(isLongBreak(result.state) ? "¡Cuatro pomodoros! Tómate un descanso largo." : "¡Buen trabajo! Toca descansar.", {
        description: title ? `${formatStudyTime(result.creditedSeconds)} sumados a «${title}».` : undefined,
      })
      track("focus.complete", { entity: taskId ? entityKey(taskId) : "none", seconds: result.creditedSeconds, sessions: result.state.completedSessions })
    } else if (result.finishedBreak) {
      playChime()
      toast("Descanso terminado", { description: "Cuando quieras, empieza el siguiente pomodoro." })
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
    setMinimizedState(readStorage(MINIMIZED_STORAGE_KEY) === "1")
    const taskId = saved.taskId && tasks.some((task) => task.id === saved.taskId) ? saved.taskId : null
    applyAdvance(advanceFocus({ ...saved, taskId }, Date.now()), taskId, true)
  }, [isLoading, tasks, applyAdvance])

  // A deleted task can no longer receive time; the timer keeps running without it.
  useEffect(() => {
    if (!isLoading && timer?.taskId && !tasks.some((task) => task.id === timer.taskId)) commit({ ...timer, taskId: null })
  }, [isLoading, tasks, timer, commit])

  const complete = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    const result = advanceFocus(current, Date.now())
    if (result.state !== current) applyAdvance(result, current.taskId)
  }, [applyAdvance])

  // One timeout per phase: unlike a ticking interval, background tabs do not hold it back for up to a minute.
  useEffect(() => {
    if (!timer || timer.endsAt === null) return
    const timeout = window.setTimeout(complete, Math.max(0, timer.endsAt - Date.now()) + 20)
    return () => window.clearTimeout(timeout)
  }, [timer, complete])

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

  const selectTask = useCallback((taskId: string | null) => {
    const current = timerRef.current
    if (!current) return
    const result = switchTask(current, taskId, Date.now())
    applyAdvance(result, current.taskId)
    const title = taskTitle(current.taskId)
    if (title && result.creditedSeconds > 0) toast.success(`${formatStudyTime(result.creditedSeconds)} guardados en «${title}».`)
  }, [applyAdvance, taskTitle])

  const openTimer = useCallback((taskId?: string) => {
    setMinimized(false)
    if (!timerRef.current) {
      track("focus.open", { preset, entity: taskId ? entityKey(taskId) : "none" })
      commit(createFocusState(taskId ?? null, preset, Date.now(), false))
    } else if (taskId !== undefined) {
      selectTask(taskId)
    }
  }, [commit, preset, selectTask, setMinimized])

  const toggle = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    unlockAudio()
    const now = Date.now()
    commit(current.endsAt === null ? resumeFocus(current, now) : pauseFocus(current, now))
  }, [commit])

  const skip = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    unlockAudio()
    applyAdvance(skipPhase(current, Date.now()), current.taskId)
  }, [applyAdvance])

  const selectPreset = useCallback((next: FocusPresetId) => {
    setPreset(next)
    writeStorage(PRESET_STORAGE_KEY, next)
    const current = timerRef.current
    if (current) commit(changePreset(current, next, Date.now()))
  }, [commit])

  const contextValue = useMemo(
    () => ({ isOpen: timer !== null, taskId: timer?.taskId ?? null, running: !!timer && timer.endsAt !== null, openTimer }),
    [timer, openTimer],
  )

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
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-border" />
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

/** Where the student is in the cycle of four, in the same dots the cards use for priority. */
function SessionDots({ timer }: { timer: FocusTimerState }) {
  const isFocus = timer.phase === "focus"
  const inCycle = timer.completedSessions % SESSIONS_PER_LONG_BREAK
  const done = isFocus ? inCycle : inCycle || SESSIONS_PER_LONG_BREAK
  const label = isFocus ? `Pomodoro ${done + 1} de ${SESSIONS_PER_LONG_BREAK}` : `${done} de ${SESSIONS_PER_LONG_BREAK} pomodoros hechos`
  return (
    <span role="img" aria-label={label} title={label} className="flex items-center gap-1">
      {Array.from({ length: SESSIONS_PER_LONG_BREAK }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            index < done ? "bg-current" : index === done && isFocus ? "bg-current opacity-40" : "bg-muted-foreground/25",
          )}
        />
      ))}
    </span>
  )
}

function TaskStatusIcon({ status }: { status?: Task["status"] }) {
  if (status === "inProgress") return <Clock className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--board-in-progress-color))" }} aria-hidden="true" />
  if (status === "todo") return <Circle className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--board-todo-color))" }} aria-hidden="true" />
  if (status === "done") return <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--board-done-color))" }} aria-hidden="true" />
  return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
}

/** Memoised so the clock ticking four times a second does not re-render every task. */
const TaskPicker = memo(function TaskPicker({ tasks, taskId, onTaskChange }: {
  tasks: Task[]
  taskId: string | null
  onTaskChange: (taskId: string | null) => void
}) {
  const activeTask = tasks.find((task) => task.id === taskId)
  const groups = useMemo(() => [
    { label: "En progreso", tasks: tasks.filter((task) => task.status === "inProgress") },
    { label: "Por hacer", tasks: tasks.filter((task) => task.status === "todo") },
    // A finished task stays listed only while it is the one receiving time.
    { label: "Completada", tasks: tasks.filter((task) => task.status === "done" && task.id === taskId) },
  ].filter((group) => group.tasks.length > 0), [tasks, taskId])

  const studied = activeTask?.focusSeconds && activeTask.focusSeconds >= 60
    ? `${formatStudyTime(activeTask.focusSeconds)} estudiados${activeTask.focusSessions ? ` · ${activeTask.focusSessions} pomodoro${activeTask.focusSessions > 1 ? "s" : ""}` : ""}`
    : null

  return (
    <div>
      <Select value={taskId ?? NO_TASK} onValueChange={(value) => onTaskChange(value === NO_TASK ? null : value)}>
        <SelectTrigger
          aria-label="Tarea en la que trabajas"
          data-track="focus-task"
          className="h-10 gap-2 rounded-md border-transparent bg-muted/50 px-3 shadow-none hover:border-border focus:bg-muted/50"
        >
          <TaskStatusIcon status={activeTask?.status} />
          <span className={cn("min-w-0 flex-1 break-all text-left", !activeTask && "text-muted-foreground")}>
            <SelectValue placeholder="Elige una tarea" />
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-72 w-[var(--radix-select-trigger-width)]">
          <SelectItem value={NO_TASK}>Sin tarea</SelectItem>
          {groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.tasks.map((task) => (
                <SelectItem key={task.id} value={task.id}><span className="line-clamp-1">{task.title}</span></SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1.5 truncate px-1 text-xs text-muted-foreground">
        {studied ?? (activeTask ? "El tiempo se sumará a esta tarea" : "Elige una tarea para guardar el tiempo")}
      </p>
    </div>
  )
})

function PresetPicker({ timer, now, onChange }: { timer: FocusTimerState; now: number; onChange: (preset: FocusPresetId) => void }) {
  // Never shorten a pomodoro below the time already spent: that time would be lost.
  const spent = timer.phase === "focus" ? phaseDuration(timer) - remainingMs(timer, now) : 0
  return (
    <div role="radiogroup" aria-label="Duración" className="flex rounded-md bg-muted/70 p-0.5">
      {(Object.keys(FOCUS_PRESETS) as FocusPresetId[]).map((id) => {
        const { focus, shortBreak } = FOCUS_PRESETS[id]
        const description = `${focus / 60_000} minutos de concentración y ${shortBreak / 60_000} de descanso`
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={timer.preset === id}
            aria-label={description}
            title={description}
            disabled={timer.preset !== id && spent >= focus}
            onClick={() => onChange(id)}
            className={cn(
              "h-6 rounded-sm px-2.5 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
              timer.preset === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {focus / 60_000} min
          </button>
        )
      })}
    </div>
  )
}

function IconAction({ label, onClick, children, className, track: trackName, disabled }: {
  label: string
  onClick: () => void
  children: ReactNode
  className?: string
  track: string
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} data-track={trackName} disabled={disabled} onClick={onClick}
          className={cn("h-8 w-8 rounded-md sm:h-8 sm:w-8 [&_svg]:size-3.5", className)}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent><p>{label}</p></TooltipContent>
    </Tooltip>
  )
}

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
  // Backup for the provider's timeout in case the system clock moved meanwhile.
  useEffect(() => {
    if (running && remaining <= 0) onComplete()
  }, [running, remaining, onComplete])

  const clock = formatClock(remaining)
  const isFocus = timer.phase === "focus"
  const started = hasStarted(timer)
  const paused = !running && started
  const phaseLabel = isFocus ? "Concentración" : isLongBreak(timer) ? "Descanso largo" : "Descanso"
  const progress = 1 - remaining / phaseDuration(timer)
  const accent = isFocus ? "text-primary" : "text-[hsl(var(--status-success))]"
  const playLabel = running ? "Pausar" : started ? "Continuar" : isFocus ? "Empezar" : "Empezar descanso"
  const skipLabel = isFocus ? "Pasar al descanso" : "Saltar el descanso"
  const stopLabel = isFocus && started && timer.taskId ? "Terminar y guardar el tiempo" : "Cerrar el pomodoro"

  // The tab title shows the countdown while the student works in another tab.
  const originalTitle = useRef<string | null>(null)
  useEffect(() => {
    if (originalTitle.current === null) originalTitle.current = document.title
    if (!started) document.title = originalTitle.current
    else document.title = `${running ? "" : "⏸ "}${clock} · ${phaseLabel}`
  }, [clock, phaseLabel, running, started])
  useEffect(() => () => { if (originalTitle.current !== null) document.title = originalTitle.current }, [])

  // Keep keyboard focus on the timer when it collapses into the dock and back.
  const dockRef = useRef<HTMLButtonElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const toggledRef = useRef(false)
  const setMinimized = (next: boolean) => {
    toggledRef.current = true
    onMinimizedChange(next)
  }
  useEffect(() => {
    if (!toggledRef.current) return
    toggledRef.current = false
    ;(minimized ? dockRef : primaryRef).current?.focus()
  }, [minimized])

  const playIcon = running ? <Pause fill="currentColor" /> : <Play fill="currentColor" />

  if (minimized) {
    return (
      <div
        role="region"
        aria-label="Pomodoro"
        className="focus-timer-dock fixed z-50 flex items-center gap-0.5 rounded-xl border border-border/70 bg-popover p-1 shadow-[var(--shadow-floating)] animate-in fade-in-0 zoom-in-95 duration-200"
      >
        <button
          ref={dockRef}
          type="button"
          data-track="focus-expand"
          onClick={() => setMinimized(false)}
          aria-label={`Abrir pomodoro: ${paused ? "en pausa" : phaseLabel.toLowerCase()}, quedan ${clock}`}
          className="flex h-10 items-center gap-2.5 rounded-lg pl-2.5 pr-3 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn("flex", accent)}><ProgressRing progress={progress} size={22} stroke={2.5} /></span>
          <span className={cn("font-display text-[15px] font-semibold tabular-nums", paused && "text-muted-foreground")}>{clock}</span>
        </button>
        <button
          type="button"
          data-track="focus-toggle"
          onClick={onToggle}
          aria-label={playLabel}
          title={playLabel}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5"
        >
          {playIcon}
        </button>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <section
        aria-label="Pomodoro"
        onKeyDown={(event) => {
          // Escape inside the open task list closes only the list (it lives in a portal outside the panel).
          if (event.key === "Escape" && event.currentTarget.contains(event.target as Node)) {
            event.preventDefault()
            setMinimized(true)
          }
        }}
        className="focus-timer-dock focus-timer-panel fixed z-50 mx-auto max-w-[24rem] rounded-2xl border border-border/70 bg-popover p-3 text-popover-foreground shadow-[var(--shadow-floating)] animate-in fade-in-0 slide-in-from-bottom-2 duration-200 md:w-[18.5rem]"
      >
        <header className="flex h-8 items-center gap-2">
          <h2 className="pl-1 text-[13px] font-semibold tracking-normal">Pomodoro</h2>
          <div className="ml-auto flex items-center gap-1">
            {!running && <PresetPicker timer={timer} now={now} onChange={onPresetChange} />}
            <div className="-mr-1 flex items-center">
              <IconAction label="Minimizar" track="focus-minimize" onClick={() => setMinimized(true)}><Minimize2 /></IconAction>
              <IconAction label={stopLabel} track="focus-stop" onClick={onStop} className="[&_svg]:size-4"><X /></IconAction>
            </div>
          </div>
        </header>

        <div className={cn("relative mx-auto mt-2 flex h-[152px] w-[152px] items-center justify-center", accent)}>
          <span className="absolute inset-0"><ProgressRing progress={progress} size={152} stroke={4} /></span>
          <div className="flex flex-col items-center">
            <span
              role="timer"
              aria-live="off"
              className={cn(
                "font-display text-[2.5rem] font-semibold leading-none tracking-tight tabular-nums transition-colors",
                paused ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {clock}
            </span>
            <span className={cn("mt-2 text-xs font-medium", paused && "text-muted-foreground")}>{paused ? "En pausa" : phaseLabel}</span>
            <span className="mt-2.5"><SessionDots timer={timer} /></span>
          </div>
        </div>

        <div className="mt-4">
          <TaskPicker tasks={tasks} taskId={timer.taskId} onTaskChange={onTaskChange} />
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            ref={primaryRef}
            type="button"
            variant="primary"
            data-track="focus-toggle"
            onClick={onToggle}
            className="h-10 flex-1 rounded-md sm:h-10 [&_svg]:size-3.5"
          >
            {playIcon}
            {playLabel}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* An untouched pomodoro cannot be skipped: it would count as done. */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={skipLabel}
                data-track="focus-skip"
                disabled={isFocus && !started}
                onClick={onSkip}
                className="h-10 w-10 rounded-md sm:h-10 sm:w-10"
              >
                <SkipForward />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>{skipLabel}</p></TooltipContent>
          </Tooltip>
        </div>
      </section>
    </TooltipProvider>
  )
}
