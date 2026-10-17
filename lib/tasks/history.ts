import type { AppState } from "./types"

const HISTORY_LIMIT = 50

export type StateProducer = (state: AppState) => AppState | null
export interface History {
  past: AppState[]
  present: AppState
  future: AppState[]
}

export const createHistory = (state: AppState): History => ({ past: [], present: state, future: [] })

/** Preserve the redo branch and identity when all collections are unchanged. */
export function recordHistory(history: History, state: AppState): History {
  const current = history.present
  if (current.tasks === state.tasks && current.events === state.events && current.tags === state.tags && current.subjects === state.subjects) return history
  return { past: [...history.past, current].slice(-HISTORY_LIMIT), present: state, future: [] }
}

export function undoHistory(history: History): History {
  if (!history.past.length) return history
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  }
}

export function redoHistory(history: History): History {
  if (!history.future.length) return history
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: history.future[0],
    future: history.future.slice(1),
  }
}
