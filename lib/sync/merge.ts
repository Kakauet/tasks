import { DEFAULT_TAG_TEMPLATES, repairPersistedState } from "@/lib/tasks/model"
import type { AppState, Event, Subject, Task, TaskTag } from "@/lib/tasks/types"

type Item = { id: string }
type Side = "local" | "remote"
type Fields = Record<string, unknown>

/** JSON with sorted keys, so records read back from Postgres jsonb compare equal; absent and undefined fields match. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? "null" : stableStringify(item))).join(",")}]`
  if (value && typeof value === "object") {
    const fields = value as Fields
    return `{${Object.keys(fields)
      .filter((key) => fields[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(fields[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b)
export const sameState = (a: AppState, b: AppState) => same(a, b)

interface MergeOptions<T> {
  /** Which side keeps a field that both sides changed to different values. */
  winner: (local: T, remote: T) => Side
  /** Merge strategies for fields that hold their own lists. */
  nested?: Partial<Record<keyof T, (base: unknown, local: unknown, remote: unknown, winner: Side) => unknown>>
}

/** Three-way merge of one record: fields changed on only one side keep that change. */
function mergeRecord<T extends Item>(base: T | undefined, local: T, remote: T, options: MergeOptions<T>): T {
  const winner = options.winner(local, remote)
  const result: Fields = {}
  const b = (base ?? {}) as Fields
  const l = local as unknown as Fields
  const r = remote as unknown as Fields
  for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
    let value: unknown
    if (same(l[key], r[key])) value = l[key]
    else if (base && same(l[key], b[key])) value = r[key]
    else if (base && same(r[key], b[key])) value = l[key]
    else {
      const nested = options.nested?.[key as keyof T]
      value = nested ? nested(b[key], l[key], r[key], winner) : winner === "local" ? l[key] : r[key]
    }
    if (value !== undefined) result[key] = value
  }
  return result as T
}

/** Relative order of the ids both lists share. */
const sharedOrderChanged = (base: Item[], side: Item[]) => {
  const sideIds = new Set(side.map((item) => item.id))
  const baseIds = new Set(base.map((item) => item.id))
  return !same(
    base.filter((item) => sideIds.has(item.id)).map((item) => item.id),
    side.filter((item) => baseIds.has(item.id)).map((item) => item.id),
  )
}

/**
 * Three-way merge of a list of records keyed by id. Additions on either side
 * are kept, a deletion wins unless the other side edited the record, and the
 * order follows the side that reordered (the local one when both did).
 */
export function mergeList<T extends Item>(base: T[] | null, local: T[], remote: T[], options: MergeOptions<T>): T[] {
  const baseById = new Map((base ?? []).map((item) => [item.id, item]))
  const localById = new Map(local.map((item) => [item.id, item]))
  const remoteById = new Map(remote.map((item) => [item.id, item]))
  const merged = new Map<string, T>()

  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const b = baseById.get(id)
    const l = localById.get(id)
    const r = remoteById.get(id)
    if (l && r) merged.set(id, mergeRecord(b, l, r, options))
    // Present on one side only: new there, or deleted on the other side.
    else if (l) {
      if (!b || !same(l, b)) merged.set(id, l)
    } else if (r) {
      if (!b || !same(r, b)) merged.set(id, r)
    }
  }

  const localReordered = base ? sharedOrderChanged(base, local) : false
  const [primary, secondary] = localReordered ? [local, remote] : [remote, local]
  const order = primary.map((item) => item.id).filter((id) => merged.has(id))
  const placed = new Set(order)
  let previous: string | null = null
  for (const { id } of secondary) {
    if (merged.has(id) && !placed.has(id)) {
      order.splice(previous === null ? 0 : order.indexOf(previous) + 1, 0, id)
      placed.add(id)
    }
    if (placed.has(id)) previous = id
  }
  return order.map((id) => merged.get(id) as T)
}

/** Tag and other id lists behave as sets: each side's additions and removals are kept. */
function mergeIdSet(base: unknown, local: unknown, remote: unknown): string[] {
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [])
  const b = new Set(list(base))
  const l = list(local)
  const r = list(remote)
  const localSet = new Set(l)
  const remoteSet = new Set(r)
  const keep = (id: string) => (localSet.has(id) && remoteSet.has(id)) || !b.has(id)
  return [...new Set([...l, ...r])].filter(keep)
}

const preferLocal = (): Side => "local"
const preferRemote = (): Side => "remote"

const stepOptions = (winner: Side): MergeOptions<Task["steps"][number]> => ({ winner: () => winner })

const taskOptions = (hasBase: boolean): MergeOptions<Task> => ({
  // The most recently edited copy wins a real conflict on the same field.
  winner: (local, remote) => (local.updatedAt > remote.updatedAt || (hasBase && local.updatedAt === remote.updatedAt) ? "local" : "remote"),
  nested: {
    steps: (base, local, remote, winner) =>
      mergeList(hasBase && Array.isArray(base) ? base : null, local as Task["steps"], remote as Task["steps"], stepOptions(winner)),
    tags: (base, local, remote) => mergeIdSet(hasBase ? base : [], local, remote),
    updatedAt: (_base, local, remote) => ((local as string) > (remote as string) ? local : remote),
  },
})

const eventOptions = (hasBase: boolean): MergeOptions<Event> => ({
  winner: hasBase ? preferLocal : preferRemote,
  nested: { tags: (base, local, remote) => mergeIdSet(hasBase ? base : [], local, remote) },
})

const tagOptions = (hasBase: boolean): MergeOptions<TaskTag> => ({ winner: hasBase ? preferLocal : preferRemote })

const subjectOptions = (hasBase: boolean): MergeOptions<Subject> => ({ winner: hasBase ? preferLocal : preferRemote })

const normalizedName = (name: string) => name.trim().toLocaleLowerCase("es")

/** True when a device holds nothing but the starter tags. */
export const isBlankState = (state: AppState) => {
  const defaults = new Set(DEFAULT_TAG_TEMPLATES.map((tag) => normalizedName(tag.name)))
  return state.tasks.length === 0 && state.events.length === 0 && state.subjects.length === 0 && state.tags.every((tag) => defaults.has(normalizedName(tag.name)))
}

/** Names that match in both copies identify the same record when there is no common ancestor. */
function matchByName<T extends { id: string; name: string }>(local: T[], remote: T[]): Map<string, string> {
  const remoteIds = new Set(remote.map((item) => item.id))
  const remoteByName = new Map(remote.map((item) => [normalizedName(item.name), item.id]))
  const renamed = new Map<string, string>()
  for (const item of local) {
    const match = remoteByName.get(normalizedName(item.name))
    if (!remoteIds.has(item.id) && match) renamed.set(item.id, match)
  }
  return renamed
}

/** Without a common ancestor, a local tag or subject with the same name as a cloud one is the same record. */
function adoptRemoteNames(local: AppState, remote: AppState): AppState {
  const renamedTags = matchByName(local.tags, remote.tags)
  const renamedSubjects = matchByName(local.subjects, remote.subjects)
  if (renamedTags.size === 0 && renamedSubjects.size === 0) return local
  const rename = (ids: string[]) => [...new Set(ids.map((id) => renamedTags.get(id) ?? id))]
  const retarget = <T extends { tags: string[]; subjectId?: string }>(record: T): T => {
    const usesTag = record.tags.some((id) => renamedTags.has(id))
    const usesSubject = record.subjectId !== undefined && renamedSubjects.has(record.subjectId)
    if (!usesTag && !usesSubject) return record
    return {
      ...record,
      ...(usesTag ? { tags: rename(record.tags) } : {}),
      ...(usesSubject ? { subjectId: renamedSubjects.get(record.subjectId as string) } : {}),
    }
  }
  return {
    tasks: local.tasks.map(retarget),
    events: local.events.map(retarget),
    tags: local.tags.filter((tag) => !renamedTags.has(tag.id)),
    subjects: local.subjects.filter((subject) => !renamedSubjects.has(subject.id)),
  }
}

const childIds = (events: Event[], parentId: string) =>
  events.filter((event) => event.parentEventId === parentId).map((event) => event.id).sort()

/**
 * Editing the dates of a recurring series regenerates every occurrence with
 * new ids. When both sides changed the occurrences of one series, keep only
 * the set of the side that rescheduled it, so the calendar never shows the
 * series twice.
 */
function resolveSeries(base: Event[] | null, local: Event[], remote: Event[], merged: Event[]): Event[] {
  const baseEvents = base ?? []
  const parents = new Set(merged.filter((event) => !event.parentEventId).map((event) => event.id))
  let result = merged
  for (const parentId of parents) {
    const b = childIds(baseEvents, parentId)
    const l = childIds(local, parentId)
    const r = childIds(remote, parentId)
    if (same(l, r) || same(l, b) || same(r, b)) continue

    const find = (events: Event[]) => events.find((event) => event.id === parentId)
    const baseParent = find(baseEvents)
    const localRescheduled = !!base && !same(find(local), baseParent)
    const remoteRescheduled = !!base && !same(find(remote), baseParent)
    const winner = localRescheduled && !remoteRescheduled ? local : remoteRescheduled && !localRescheduled ? remote : base ? local : remote
    const keep = new Set(childIds(winner, parentId))
    const present = new Set(result.map((event) => event.id))
    result = [
      ...result.filter((event) => event.parentEventId !== parentId || keep.has(event.id)),
      ...winner.filter((event) => keep.has(event.id) && !present.has(event.id)),
    ]
  }
  return result
}

/** Drop references the merge left pointing at records that were deleted on the other side. */
function dropDanglingReferences(merged: AppState, inputs: AppState[]): AppState {
  const tagIds = new Set(merged.tags.map((tag) => tag.id))
  const knownTagIds = new Set(inputs.flatMap((state) => state.tags.map((tag) => tag.id)))
  const deletedTag = (id: string) => knownTagIds.has(id) && !tagIds.has(id)
  const subjectIds = new Set(merged.subjects.map((subject) => subject.id))
  const knownSubjectIds = new Set(inputs.flatMap((state) => state.subjects.map((subject) => subject.id)))
  const deletedSubject = (id?: string) => id !== undefined && knownSubjectIds.has(id) && !subjectIds.has(id)
  const eventIds = new Set(merged.events.map((event) => event.id))
  const knownEventIds = new Set(inputs.flatMap((state) => state.events.map((event) => event.id)))
  const withoutDeleted = <T extends { tags: string[]; subjectId?: string }>(record: T): T => {
    const cleaned = record.tags.some(deletedTag) ? { ...record, tags: record.tags.filter((id) => !deletedTag(id)) } : record
    if (!deletedSubject(cleaned.subjectId)) return cleaned
    const { subjectId: _removed, ...rest } = cleaned
    return rest as T
  }

  return {
    tasks: merged.tasks.map(withoutDeleted),
    events: merged.events
      .filter((event) => !event.parentEventId || eventIds.has(event.parentEventId) || !knownEventIds.has(event.parentEventId))
      .map(withoutDeleted),
    tags: merged.tags,
    subjects: merged.subjects,
  }
}

/**
 * Combines the changes made on this device (`local`) and in the cloud
 * (`remote`) since the last state both agreed on (`base`). Without a base
 * (first sign-in on this device) both copies are combined and nothing is
 * deleted.
 */
export function mergeStates(base: AppState | null, local: AppState, remote: AppState): AppState {
  if (!base && isBlankState(local)) return remote
  const hasBase = !!base
  const localSide = base ? local : adoptRemoteNames(local, remote)

  const events = mergeList(base?.events ?? null, localSide.events, remote.events, eventOptions(hasBase))
  const merged = dropDanglingReferences(
    {
      tasks: mergeList(base?.tasks ?? null, localSide.tasks, remote.tasks, taskOptions(hasBase)),
      events: resolveSeries(base?.events ?? null, localSide.events, remote.events, events),
      tags: mergeList(base?.tags ?? null, localSide.tags, remote.tags, tagOptions(hasBase)),
      subjects: mergeList(base?.subjects ?? null, localSide.subjects, remote.subjects, subjectOptions(hasBase)),
    },
    base ? [base, local, remote] : [local, remote],
  )
  return repairPersistedState(merged) ?? merged
}
