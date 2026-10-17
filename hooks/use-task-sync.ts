"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import { useAuth } from "@/context/auth-context"
import { createBackup, saveRecovery } from "@/lib/data/backup"
import { sameState } from "@/lib/sync/merge"
import { REMOTE_STATE_TABLE, syncOnce } from "@/lib/sync/round"
import { loadLocalState, saveLocalState, type SyncBase } from "@/lib/tasks/storage"
import { applyTitleDetection, describeDetection } from "@/lib/tasks/subjects"
import type { AppState } from "@/lib/tasks/types"

const SYNC_DEBOUNCE_MS = 800
const POLL_INTERVAL = 30_000
const MIN_RETRY_DELAY = 2_000
const MAX_RETRY_DELAY = 60_000
const MAX_SYNC_ATTEMPTS = 5
let lastStorageWarning = 0
const TITLE_DETECTION_KEY = "taskmaster-title-detection"

/**
 * Data saved before title detection existed gets it once per device: exams become graded and
 * existing subjects take the unassigned items that name them. Later choices are never revisited.
 */
function detectTitlesOnce(state: AppState): AppState {
  try {
    if (localStorage.getItem(TITLE_DETECTION_KEY)) return state
    // A device with nothing yet waits for real data, which may still arrive from the cloud.
    if (state.tasks.length === 0 && state.events.length === 0) return state
    localStorage.setItem(TITLE_DETECTION_KEY, "1")
  } catch {
    return state
  }
  const result = applyTitleDetection(state, { exams: true })
  const assigned = describeDetection(result)
  const notes = [
    result.exams && `${result.exams} ${result.exams === 1 ? "examen marcado como calificable" : "exámenes marcados como calificables"}`,
    assigned && `${assigned} ${result.tasks + result.events === 1 ? "asignado" : "asignados"} a su asignatura por el título`,
  ].filter(Boolean)
  if (notes.length) toast.success(`${notes.join(" y ")}.`, { duration: 8000 })
  return result.state
}

export type SyncStatus = "disabled" | "pending" | "synced" | "offline" | "error"
export interface SyncState {
  status: SyncStatus
  error: string | null
}

const syncErrorMessage = (error: unknown) => {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
  if (code === "42P01" || code === "PGRST205") return "Falta la tabla user_state en Supabase. Sigue docs/SUPABASE_SETUP.md."
  if (code === "42501") return "Supabase ha denegado el acceso a tus datos. Revisa las políticas de la tabla user_state."
  if (typeof message !== "string" || /fetch|network|load failed/i.test(message)) {
    return "No se puede conectar con la nube. Se reintentará automáticamente."
  }
  return message
}

export function useTaskSync(
  present: AppState,
  historyRef: { readonly current: { readonly present: AppState } },
  resetState: (state: AppState) => void,
) {
  const [isLoading, setIsLoading] = useState(true)
  const { user, supabase, cloudStatus } = useAuth()
  // Depend on the account, not on the user object that changes with every token refresh.
  const userId = user?.id ?? null
  // Cloud sync runs only for a signed-in account on a reachable project, once local data is on screen.
  const cloudUserId = !isLoading && userId && supabase && cloudStatus === "available" ? userId : null
  const cloudUserRef = useRef<string | null>(null)
  const syncEpochRef = useRef(0)
  const syncBaseRef = useRef<SyncBase | null>(null)
  /** The state a sync last put on screen or uploaded; any other state has changes to upload. */
  const appliedStateRef = useRef<AppState | null>(null)
  const syncRunningRef = useRef(false)
  const syncAgainRef = useRef(false)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const retryDelayRef = useRef(0)
  const runSyncRef = useRef<() => Promise<void>>(async () => {})
  const [syncState, setSyncStateValue] = useState<SyncState>({ status: "disabled", error: null })

  const setSyncState = useCallback((status: SyncStatus, error: string | null = null) => {
    setSyncStateValue((current) => (current.status === status && current.error === error ? current : { status, error }))
  }, [])

  const scheduleSync = useCallback((delay: number) => {
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => void runSyncRef.current(), delay)
  }, [])

  useEffect(() => {
    let cancelled = false
    // Local data renders immediately; the cloud copy is merged in afterwards.
    void loadLocalState()
      .then(({ state, syncBase }) => {
        if (cancelled) return
        syncBaseRef.current = syncBase ?? null
        appliedStateRef.current = state
        // Unlike `state`, the detected version counts as a local change and is uploaded.
        resetState(detectTitlesOnce(state))
      })
      .catch((error) => console.error("Error loading initial state:", error))
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [resetState])

  useEffect(() => {
    if (isLoading) return

    void saveLocalState(present, syncBaseRef.current).catch(error => {
      console.error("Error saving local state:", error)
      if (Date.now() - lastStorageWarning > 30000) {
        lastStorageWarning = Date.now()
        toast.error(error instanceof Error && error.message.startsWith("No queda espacio")
          ? error.message
          : "No se pudo usar el almacenamiento comprimido. Exporta una copia de seguridad.")
      }
    })
  }, [present, isLoading])

  const runSync = useCallback(async () => {
    const uid = cloudUserRef.current
    if (!uid || !supabase) return
    if (syncRunningRef.current) {
      syncAgainRef.current = true
      return
    }

    syncRunningRef.current = true
    const epoch = syncEpochRef.current
    const active = () => cloudUserRef.current === uid && syncEpochRef.current === epoch
    clearTimeout(syncTimerRef.current)
    try {
      for (let attempt = 1; ; attempt++) {
        syncAgainRef.current = false
        const result = await syncOnce(supabase, uid, {
          isActive: active,
          getState: () => historyRef.current.present,
          getBase: () => syncBaseRef.current,
          setBase: (base) => { syncBaseRef.current = base },
          resetState,
          markApplied: (state) => { appliedStateRef.current = state },
          preserveAccountState: async (state) => {
            await saveRecovery(await createBackup(state)).catch((recoveryError) => {
              console.error("Error saving recovery before switching account:", recoveryError)
              throw new Error("No se pudo guardar una copia de los datos de la cuenta anterior. Exporta una copia de seguridad y vuelve a intentarlo.")
            })
            if (active()) toast.info("Los datos que había en este dispositivo se han guardado como copia de recuperación.")
          },
          saveState: saveLocalState,
        })
        if (result === "aborted" || !active()) return
        if (result === "conflict") {
          if (attempt >= MAX_SYNC_ATTEMPTS) throw new Error("La nube no ha aceptado los cambios tras varios intentos.")
          continue
        }
        if (!syncAgainRef.current) break
      }
      retryDelayRef.current = 0
      const base = syncBaseRef.current
      setSyncState(base && sameState(historyRef.current.present, base.state) ? "synced" : "pending")
    } catch (error) {
      if (!active()) return
      console.error("Error syncing with the cloud:", error)
      const offline = typeof navigator !== "undefined" && navigator.onLine === false
      setSyncState(offline ? "offline" : "error", offline ? null : syncErrorMessage(error))
      retryDelayRef.current = Math.min(MAX_RETRY_DELAY, Math.max(MIN_RETRY_DELAY, retryDelayRef.current * 2))
      scheduleSync(retryDelayRef.current)
    } finally {
      syncRunningRef.current = false
      // An account change may have requested a round while this one still held the lock.
      if (cloudUserRef.current && !active()) scheduleSync(0)
    }
  }, [supabase, resetState, historyRef, setSyncState, scheduleSync])
  runSyncRef.current = runSync

  const syncNow = useCallback(() => {
    retryDelayRef.current = 0
    void runSyncRef.current()
  }, [])

  // Start syncing when an account is signed in; stop (keeping local data) when it signs out.
  useEffect(() => {
    cloudUserRef.current = cloudUserId
    retryDelayRef.current = 0
    clearTimeout(syncTimerRef.current)
    if (!cloudUserId) {
      setSyncState("disabled")
      return
    }
    setSyncState("pending")
    void runSyncRef.current()
    return () => {
      cloudUserRef.current = null
      // Returning to the same account must not reactivate a request from its previous session.
      syncEpochRef.current++
      clearTimeout(syncTimerRef.current)
    }
  }, [cloudUserId, setSyncState])

  // Upload local changes shortly after they happen.
  useEffect(() => {
    if (!cloudUserId || present === appliedStateRef.current) return
    setSyncStateValue((current) => (current.status === "synced" ? { status: "pending", error: null } : current))
    scheduleSync(SYNC_DEBOUNCE_MS)
  }, [present, cloudUserId, scheduleSync])

  // Catch up after being offline or in the background, and upload pending changes before the page is hidden.
  useEffect(() => {
    if (!cloudUserId) return
    const handleVisibility = () => {
      if (document.visibilityState === "visible" || historyRef.current.present !== appliedStateRef.current) void runSyncRef.current()
    }
    const poll = () => {
      if (document.visibilityState === "visible") void runSyncRef.current()
    }
    window.addEventListener("online", syncNow)
    document.addEventListener("visibilitychange", handleVisibility)
    // Polling only asks for the version, and covers projects without Realtime enabled.
    const intervalId = setInterval(poll, POLL_INTERVAL)
    return () => {
      window.removeEventListener("online", syncNow)
      document.removeEventListener("visibilitychange", handleVisibility)
      clearInterval(intervalId)
    }
  }, [cloudUserId, syncNow, historyRef])

  useEffect(() => {
    if (!cloudUserId || !supabase) return

    // A unique topic: a channel with the same name may still be closing, and
    // Supabase would hand back that channel instead of a new one.
    const channel = supabase
      .channel(`taskmaster-user-state-${cloudUserId}-${uuidv4()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: REMOTE_STATE_TABLE,
          filter: `user_id=eq.${cloudUserId}`,
        },
        (payload) => {
          // The payload may be truncated for large states, so it only signals that there is something to fetch.
          const incomingUpdatedAt = (payload.new as { updated_at?: string } | null)?.updated_at
          if (incomingUpdatedAt && incomingUpdatedAt === syncBaseRef.current?.version) return
          void runSyncRef.current()
        },
      )
      .subscribe((status) => {
        // Also fires after reconnecting: fetch whatever changed while disconnected.
        if (status === "SUBSCRIBED") void runSyncRef.current()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [cloudUserId, supabase])

  return { isLoading, syncState, syncNow }
}
