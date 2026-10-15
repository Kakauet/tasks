import type { SupabaseClient } from "@supabase/supabase-js"
import { createDefaultState, repairPersistedState } from "@/lib/tasks/model"
import type { AppState } from "@/lib/tasks/types"
import type { SyncBase } from "@/lib/tasks/storage"
import { isBlankState, mergeStates, sameState } from "./merge"

export const REMOTE_STATE_TABLE = "user_state"

/** Each upload gets a later version than the copy it replaces, even if this device's clock is behind. */
const nextVersion = (previous: string | null) => {
  const previousTime = previous ? Date.parse(previous) : Number.NaN
  return new Date(Number.isFinite(previousTime) ? Math.max(Date.now(), previousTime + 1) : Date.now()).toISOString()
}

/** Effects are supplied by the lifecycle hook; this round has no React or browser dependency. */
export interface SyncPorts {
  isActive: () => boolean
  getState: () => AppState
  getBase: () => SyncBase | null
  setBase: (base: SyncBase) => void
  resetState: (state: AppState) => void
  markApplied: (state: AppState) => void
  preserveAccountState: (state: AppState) => Promise<void>
  saveState: (state: AppState, base: SyncBase) => Promise<void>
}

/** Compare-and-swap: a concurrent write causes a fresh pull and merge, never a blind overwrite. */
export async function syncOnce(client: SupabaseClient, uid: string, ports: SyncPorts): Promise<"done" | "conflict" | "aborted"> {
  const active = ports.isActive
  const previousBase = ports.getBase()
  const known = previousBase?.userId === uid ? previousBase : null

  // Cheap check first: nothing changed on this device and the cloud copy is the one last merged.
  if (known?.version && sameState(ports.getState(), known.state)) {
    const { data, error } = await client.from(REMOTE_STATE_TABLE).select("updated_at").eq("user_id", uid).maybeSingle()
    if (error) throw error
    if (!active()) return "aborted"
    if (data?.updated_at === known.version) {
      ports.markApplied(ports.getState())
      return "done"
    }
  }

  const { data: row, error } = await client
    .from(REMOTE_STATE_TABLE)
    .select("data, updated_at")
    .eq("user_id", uid)
    .maybeSingle()
  if (error) throw error
  if (!active()) return "aborted"
  const remote = row ? repairPersistedState(row.data) : null
  if (row && !remote) throw new Error("La copia de la nube no tiene un formato válido y no se ha modificado.")

  const base = ports.getBase()
  if (base && base.userId !== uid && !isBlankState(ports.getState())) {
    // This device holds the data of another account: keep it aside before switching to this account's data.
    await ports.preserveAccountState(ports.getState())
    if (!active()) return "aborted"
  }

  // Merge synchronously against the latest local state, so edits made while waiting are included.
  const local = ports.getState()
  const merged =
    base?.userId === uid
      ? remote ? mergeStates(base.state, local, remote) : local
      : base
        ? remote ?? createDefaultState()
        : remote ? mergeStates(null, local, remote) : local
  let onScreen = local
  if (!sameState(merged, local)) {
    ports.markApplied(merged)
    onScreen = merged
    ports.resetState(merged)
  }

  let version: string | null = row?.updated_at ?? null
  if (!remote || !sameState(merged, remote)) {
    const updatedAt = nextVersion(version)
    const request = row
      ? client
          .from(REMOTE_STATE_TABLE)
          .update({ data: merged, updated_at: updatedAt })
          .eq("user_id", uid)
          .eq("updated_at", row.updated_at)
      : client.from(REMOTE_STATE_TABLE).insert({ user_id: uid, data: merged, updated_at: updatedAt })
    const { data: written, error: writeError } = await request.select("updated_at")
    // Another device wrote (or created the row) since it was read.
    if (writeError?.code === "23505") return "conflict"
    if (writeError) throw writeError
    if (!written?.length) return "conflict"
    version = written[0].updated_at
  }
  if (!active()) return "aborted"

  const nextBase: SyncBase = { userId: uid, version, state: merged }
  ports.setBase(nextBase)
  const current = ports.getState()
  if (current === onScreen) ports.markApplied(current)
  // Store the new base together with the state it belongs to.
  void ports.saveState(current, nextBase).catch((saveError) => console.error("Error saving local state:", saveError))
  return "done"
}
