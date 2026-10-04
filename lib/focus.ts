/**
 * Pomodoro timer state. Pure functions so the timer can be restored after a
 * reload and tested without React: a running phase is stored as the moment it
 * ends, never as a countdown that drifts.
 */

export type FocusPhase = "focus" | "break"
export type FocusPresetId = "25-5" | "50-10"

export const FOCUS_PRESETS: Record<FocusPresetId, { label: string; focus: number; shortBreak: number; longBreak: number }> = {
  "25-5": { label: "25 / 5", focus: 25 * 60_000, shortBreak: 5 * 60_000, longBreak: 15 * 60_000 },
  "50-10": { label: "50 / 10", focus: 50 * 60_000, shortBreak: 10 * 60_000, longBreak: 20 * 60_000 },
}

/** Every fourth completed focus session is followed by a long break. */
export const SESSIONS_PER_LONG_BREAK = 4
/** Shorter stops are not worth recording as study time. */
export const MIN_CREDITED_SECONDS = 60

export interface FocusTimerState {
  /** Task that receives the study time; null while none is chosen. */
  taskId: string | null
  phase: FocusPhase
  preset: FocusPresetId
  /** Epoch ms when the running phase ends; null while paused. */
  endsAt: number | null
  /** Remaining ms while paused. */
  remainingMs: number
  /** Focus sessions completed since the timer was started. */
  completedSessions: number
}

export interface FocusAdvance {
  state: FocusTimerState
  /** Focus seconds to add to the task. */
  creditedSeconds: number
  finishedFocus: number
  finishedBreak: boolean
}

export const isLongBreak = (state: Pick<FocusTimerState, "phase" | "completedSessions">) =>
  state.phase === "break" && state.completedSessions > 0 && state.completedSessions % SESSIONS_PER_LONG_BREAK === 0

export function phaseDuration(state: Pick<FocusTimerState, "phase" | "preset" | "completedSessions">) {
  const preset = FOCUS_PRESETS[state.preset]
  if (state.phase === "focus") return preset.focus
  return isLongBreak(state) ? preset.longBreak : preset.shortBreak
}

export function remainingMs(state: FocusTimerState, now: number) {
  return state.endsAt === null ? state.remainingMs : Math.max(0, state.endsAt - now)
}

export function createFocusState(taskId: string | null, preset: FocusPresetId, now: number, running = true): FocusTimerState {
  const duration = FOCUS_PRESETS[preset].focus
  return { taskId, phase: "focus", preset, endsAt: running ? now + duration : null, remainingMs: duration, completedSessions: 0 }
}

export function pauseFocus(state: FocusTimerState, now: number): FocusTimerState {
  return state.endsAt === null ? state : { ...state, endsAt: null, remainingMs: remainingMs(state, now) }
}

export function resumeFocus(state: FocusTimerState, now: number): FocusTimerState {
  return state.endsAt !== null ? state : { ...state, endsAt: now + state.remainingMs }
}

/** Whole seconds of focus already spent in the current phase. */
export function elapsedFocusSeconds(state: FocusTimerState, now: number) {
  if (state.phase !== "focus") return 0
  return Math.max(0, Math.floor((phaseDuration(state) - remainingMs(state, now)) / 1000))
}

/** Switch durations without losing the time already spent in the current phase. */
export function changePreset(state: FocusTimerState, preset: FocusPresetId, now: number): FocusTimerState {
  if (preset === state.preset) return state
  const spent = phaseDuration(state) - remainingMs(state, now)
  const remaining = Math.max(1000, phaseDuration({ ...state, preset }) - spent)
  return { ...state, preset, remainingMs: remaining, endsAt: state.endsAt === null ? null : now + remaining }
}

/** Focus → break (running) → focus (paused, waiting for the student). */
function nextPhase(state: FocusTimerState, phaseEnd: number): FocusTimerState {
  if (state.phase === "focus") {
    const next: FocusTimerState = { ...state, phase: "break", completedSessions: state.completedSessions + 1, endsAt: null, remainingMs: 0 }
    const duration = phaseDuration(next)
    return { ...next, remainingMs: duration, endsAt: phaseEnd + duration }
  }
  return { ...state, phase: "focus", endsAt: null, remainingMs: FOCUS_PRESETS[state.preset].focus }
}

/** Apply every phase that ended by `now`, including while the page was closed. */
export function advanceFocus(state: FocusTimerState, now: number): FocusAdvance {
  let current = state
  let creditedSeconds = 0
  let finishedFocus = 0
  let finishedBreak = false
  while (current.endsAt !== null && current.endsAt <= now) {
    if (current.phase === "focus") {
      creditedSeconds += Math.round(phaseDuration(current) / 1000)
      finishedFocus++
    } else {
      finishedBreak = true
    }
    current = nextPhase(current, current.endsAt)
  }
  return { state: current, creditedSeconds, finishedFocus, finishedBreak }
}

/** Skip the rest of the phase; a skipped focus phase still counts the time spent. */
export function skipPhase(state: FocusTimerState, now: number): FocusAdvance {
  if (state.phase === "focus") {
    const spent = elapsedFocusSeconds(state, now)
    const credited = spent >= MIN_CREDITED_SECONDS ? spent : 0
    return { state: nextPhase(state, now), creditedSeconds: credited, finishedFocus: credited ? 1 : 0, finishedBreak: false }
  }
  return { state: nextPhase(state, now), creditedSeconds: 0, finishedFocus: 0, finishedBreak: true }
}

export function parseFocusState(serialized: string | null): FocusTimerState | null {
  if (!serialized) return null
  try {
    const raw = JSON.parse(serialized) as Partial<FocusTimerState>
    if (!raw || typeof raw !== "object" || (raw.taskId !== null && (typeof raw.taskId !== "string" || !raw.taskId))) return null
    if (raw.phase !== "focus" && raw.phase !== "break") return null
    if (raw.preset !== "25-5" && raw.preset !== "50-10") return null
    if (raw.endsAt !== null && (typeof raw.endsAt !== "number" || !Number.isFinite(raw.endsAt))) return null
    if (typeof raw.remainingMs !== "number" || !Number.isFinite(raw.remainingMs) || raw.remainingMs < 0) return null
    if (typeof raw.completedSessions !== "number" || !Number.isInteger(raw.completedSessions) || raw.completedSessions < 0) return null
    return raw as FocusTimerState
  } catch {
    return null
  }
}

export function formatClock(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`
}

export function formatStudyTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return "< 1 min"
  const hours = Math.floor(minutes / 60)
  if (!hours) return `${minutes} min`
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`
}
