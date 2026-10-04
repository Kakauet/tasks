import { createDefaultState, repairPersistedState } from "./model"
import type { AppState } from "./types"
import { compressJson, readJsonBlob } from "@/lib/data/codec"
import { idbRequest, openLocalDatabase, transactionDone } from "@/lib/data/database"
const LOCAL_STATE_KEY = "taskmaster-state"
const LEGACY_LOCAL_STATE_KEYS = {
  tasks: "tasks",
  events: "events",
  tags: "tags",
}

export const safeLocalStorageGet = (key: string, defaultValue = "[]"): string => {
  try {
    return localStorage.getItem(key) || defaultValue
  } catch (error) {
    console.error(`Error reading from localStorage key "${key}":`, error)
    return defaultValue
  }
}

export const safeLocalStorageSet = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error) {
    console.error(`Error writing to localStorage key "${key}":`, error)
    return false
  }
}

export interface LoadedLocalState { state: AppState; hasLocalData: boolean; savedAt?: string }

const loadLegacyLocalState = (): LoadedLocalState => {
  const serializedState = safeLocalStorageGet(LOCAL_STATE_KEY, "")
  if (serializedState) {
    try {
      const parsedState = repairPersistedState(JSON.parse(serializedState))
      if (parsedState) {
        return { state: parsedState, hasLocalData: true }
      }
      safeLocalStorageSet(`${LOCAL_STATE_KEY}-recovery`, serializedState)
    } catch (parseError) {
      safeLocalStorageSet(`${LOCAL_STATE_KEY}-recovery`, serializedState)
      console.error("Error parsing unified local state:", parseError)
    }
  }

  try {
    const tasks = JSON.parse(safeLocalStorageGet(LEGACY_LOCAL_STATE_KEYS.tasks))
    const events = JSON.parse(safeLocalStorageGet(LEGACY_LOCAL_STATE_KEYS.events))
    const tags = JSON.parse(safeLocalStorageGet(LEGACY_LOCAL_STATE_KEYS.tags))
    const parsed = repairPersistedState({ tasks, events, tags })
    if (parsed) {
      const hasLocalData = tasks.length > 0 || events.length > 0 || tags.length > 0
      return { state: hasLocalData ? parsed : createDefaultState(), hasLocalData }
    }
  } catch (error) {
    console.error("Error reading legacy state:", error)
  }
  return { state: createDefaultState(), hasLocalData: false }
}

interface StoredState { id: string; blob: Blob; bytes: number; savedAt: string }

export async function storedStateBytes(): Promise<number> {
  const db = await openLocalDatabase()
  const state = await idbRequest<StoredState | undefined>(db.transaction("state", "readonly").objectStore("state").get("current"))
  return state?.bytes ?? 0
}

export async function loadLocalState(): Promise<LoadedLocalState> {
  // A localStorage copy left by a failed IndexedDB write is newer than the
  // last successful database write and must win on the next startup.
  const fallback = loadLegacyLocalState()
  if (safeLocalStorageGet(LOCAL_STATE_KEY, "")) return fallback
  try {
    const db = await openLocalDatabase()
    const stored = await idbRequest<StoredState | undefined>(db.transaction("state", "readonly").objectStore("state").get("current"))
    if (!stored) return fallback
    const state = repairPersistedState(await readJsonBlob(stored.blob).catch(() => null))
    if (!state) {
      // Keep the unreadable copy aside: the next save would otherwise overwrite it.
      const tx = db.transaction("state", "readwrite")
      const done = transactionDone(tx)
      tx.objectStore("state").put({ ...stored, id: `unreadable-${Date.now()}` })
      await done
      throw new Error("El estado local comprimido no es válido.")
    }
    return { state, hasLocalData: true, savedAt: stored.savedAt }
  } catch (error) {
    console.error("Error reading compressed local state:", error)
    return fallback
  }
}

let writeChain = Promise.resolve()
export function saveLocalState(state: AppState): Promise<void> {
  const write = async () => {
    try {
      const blob = await compressJson(state)
      const db = await openLocalDatabase()
      const tx = db.transaction("state", "readwrite")
      const done = transactionDone(tx)
      tx.objectStore("state").put({ id: "current", blob, bytes: blob.size, savedAt: new Date().toISOString() } satisfies StoredState)
      await done
      localStorage.removeItem(LOCAL_STATE_KEY)
    } catch (error) {
      // Preserve the newest state even when IndexedDB is temporarily unavailable.
      if (!safeLocalStorageSet(LOCAL_STATE_KEY, JSON.stringify(state))) {
        throw new Error("No queda espacio para guardar las tareas en este navegador. Exporta una copia y libera espacio.")
      }
      throw error
    }
  }
  const result = writeChain.then(write)
  writeChain = result.catch(() => {})
  return result
}
