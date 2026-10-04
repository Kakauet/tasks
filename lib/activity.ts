import type { AppState } from "@/lib/tasks/types"
import { compressJson, readJsonBlob } from "@/lib/data/codec"
import { idbRequest, openLocalDatabase, readAll, transactionDone } from "@/lib/data/database"

export type ActivityData = Record<string, string | number | boolean | null | string[] | number[]>
export type ActivityEvent = [time: number, session: string, sequence: number, name: string, data: ActivityData]
export interface PackedActivity { version: 1; base: number; sessions: string[]; names: string[]; rows: [number, number, number, number, ActivityData][] }
interface StoredBatch { id: string; time: number; bytes: number; count: number; blob: Blob }
export interface DailyActivity { id: string; counts: Record<string, number>; activeMs: number }
export interface ActivityArchive { version: 1; batches: PackedActivity[]; daily: DailyActivity[] }
const ENABLED_KEY = "taskmaster-activity-enabled"
const MAX_PENDING = 1024
let queue: ActivityEvent[] = []
let session = ""
let sequence = 0
let chain = Promise.resolve()
let accepting = true
let lastError: string | null = null
let droppedEvents = 0

export function activityEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) !== "false" } catch { return true }
}

export function setActivityEnabled(enabled: boolean) {
  localStorage.setItem(ENABLED_KEY, String(enabled))
  window.dispatchEvent(new Event("activity-preference"))
  if (!enabled) void flushActivity()
}

export function entityKey(id: string): string {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function track(name: string, data: ActivityData = {}) {
  if (typeof window === "undefined" || !accepting || !activityEnabled()) return
  if (!/^[a-z][a-z0-9_.]{1,60}$/.test(name) || JSON.stringify(data).length > 4096) return
  session ||= crypto.randomUUID()
  queue.push([Date.now(), session, ++sequence, name, data])
  if (queue.length > MAX_PENDING) { queue.shift(); droppedEvents++ }
  if (queue.length >= 64) void flushActivity()
}

export function packActivity(events: ActivityEvent[]): PackedActivity {
  const sessions = Array.from(new Set(events.map(event => event[1])))
  const names = Array.from(new Set(events.map(event => event[3])))
  const base = events[0]?.[0] ?? 0
  return { version: 1, base, sessions, names, rows: events.map(([time, s, seq, name, data]) => [time - base, sessions.indexOf(s), seq, names.indexOf(name), data]) }
}

export function validateActivity(raw: unknown): ActivityArchive {
  const archive = raw as ActivityArchive
  if (!archive || archive.version !== 1 || !Array.isArray(archive.batches) || !Array.isArray(archive.daily)) throw new Error("Registro de actividad no válido.")
  for (const batch of archive.batches) {
    if (!batch || batch.version !== 1 || !Number.isSafeInteger(batch.base) || batch.base<0 || batch.base>Date.now()+86400000 || !Array.isArray(batch.sessions) || !Array.isArray(batch.names) || !Array.isArray(batch.rows) ||
      batch.names.length>100 || batch.rows.length===0 || batch.sessions.some(s => typeof s !== "string" || s.length > 80) || batch.names.some(n => typeof n !== "string" || !/^[a-z][a-z0-9_.]{1,60}$/.test(n))) throw new Error("Lote de actividad no válido.")
    for (const row of batch.rows) {
      if (!Array.isArray(row) || row.length !== 5 || !Number.isSafeInteger(row[0]) || batch.base+row[0]<0 || batch.base+row[0]>Date.now()+86400000 || !Number.isInteger(row[1]) || !batch.sessions[row[1]] || !Number.isInteger(row[2]) || row[2] < 0 || !Number.isInteger(row[3]) || !batch.names[row[3]] || !row[4] || typeof row[4] !== "object" || Array.isArray(row[4])) throw new Error("Evento de actividad no válido.")
      if (JSON.stringify(row[4]).length > 4096 || Object.values(row[4]).some(v => !(v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v) || typeof v === "string" && v.length <= 200 || Array.isArray(v) && v.length <= 100 && v.every(x => typeof x === "string" && x.length <= 100 || typeof x === "number" && Number.isFinite(x))))) throw new Error("Metadatos de actividad no válidos.")
    }
  }
  for (const daily of archive.daily) {
    if (!daily || !/^\d{4}-\d{2}-\d{2}$/.test(daily.id) || !Number.isFinite(daily.activeMs) || daily.activeMs < 0 || !daily.counts || typeof daily.counts !== "object" || Array.isArray(daily.counts) || Object.keys(daily.counts).length > 100 || Object.entries(daily.counts).some(([k,v]) => !/^[a-z][a-z0-9_.]{1,60}$/.test(k) || !Number.isInteger(v) || v < 0)) throw new Error("Resumen diario no válido.")
  }
  return archive
}

async function persist(events: ActivityEvent[]) {
  const packed = packActivity(events)
  const blob = await compressJson(packed)
  const db = await openLocalDatabase()
  const tx = db.transaction(["activity", "daily"], "readwrite")
  const done = transactionDone(tx)
  const id = `${events[0][1]}:${events[0][2]}`
  const existing = await idbRequest(tx.objectStore("activity").get(id))
  if (!existing) {
    tx.objectStore("activity").put({ id, time: events.at(-1)![0], bytes: blob.size, count: events.length, blob } satisfies StoredBatch)
    const days = Array.from(new Set(events.map(event => new Date(event[0]).toISOString().slice(0,10))))
    for (const day of days) {
      const store = tx.objectStore("daily")
      const summary: DailyActivity = await idbRequest(store.get(day)) ?? { id: day, counts: {}, activeMs: 0 }
      for (const event of events.filter(row => new Date(row[0]).toISOString().startsWith(day))) {
        summary.counts[event[3]] = (summary.counts[event[3]] ?? 0) + 1
        if (event[3] === "session.pulse") summary.activeMs += Number(event[4].activeMs) || 0
      }
      store.put(summary)
    }
  }
  await done
}

export function flushActivity(): Promise<void> {
  chain = chain.then(async () => {
    if(droppedEvents && queue.length<MAX_PENDING) {
      queue.push([Date.now(),session||crypto.randomUUID(),++sequence,"storage.overflow",{count:droppedEvents}])
      droppedEvents=0
    }
    const events = queue.splice(0,64)
    if (!events.length) return
    try { await persist(events); lastError = null }
    catch { droppedEvents += Math.max(0,events.length+queue.length-MAX_PENDING); queue = [...events, ...queue].slice(-MAX_PENDING); lastError = "No se ha podido guardar la actividad en este navegador." }
  })
  return chain
}

export async function activityStats() {
  await flushActivity()
  const db = await openLocalDatabase()
  const result = { bytes: 0, count: 0, days: 0, dailyBytes: 0, firstDay: null as string | null, lastDay: null as string | null, error: lastError }
  await new Promise<void>((resolve, reject) => {
    const cursor = db.transaction("activity", "readonly").objectStore("activity").openCursor()
    cursor.onerror = () => reject(cursor.error)
    cursor.onsuccess = () => {
      if (!cursor.result) { resolve(); return }
      const batch = cursor.result.value as StoredBatch
      result.bytes += batch.bytes
      result.count += batch.count
      cursor.result.continue()
    }
  })
  const days = await readAll<DailyActivity>("daily")
  result.days = days.length
  result.dailyBytes = new Blob([JSON.stringify(days)]).size
  if (days.length) {
    result.firstDay = days.reduce((first, day) => day.id < first ? day.id : first, days[0].id)
    result.lastDay = days.reduce((last, day) => day.id > last ? day.id : last, days[0].id)
  }
  return result
}

export async function exportActivity(): Promise<ActivityArchive> {
  // A finite snapshot; interactions arriving during export remain queued for the next batch.
  const pendingBatches = Math.ceil(queue.length / 64)
  for (let i=0;i<Math.max(1,pendingBatches);i++) await flushActivity()
  if(lastError) throw new Error("No se ha podido guardar toda la actividad. Reintenta o exporta la copia sin incluir el historial.")
  const batches = await readAll<StoredBatch>("activity")
  const decoded:PackedActivity[]=[]
  for(const batch of batches.sort((a,b)=>a.time-b.time)) decoded.push(await readJsonBlob(batch.blob) as PackedActivity)
  return { version: 1, batches: decoded, daily: await readAll<DailyActivity>("daily") }
}

export async function clearActivity() {
  accepting = false
  queue = []
  try {
    await chain
    const db = await openLocalDatabase()
    const tx = db.transaction(["activity", "daily"], "readwrite")
    const done = transactionDone(tx)
    tx.objectStore("activity").clear(); tx.objectStore("daily").clear()
    await done
    lastError = null
    droppedEvents=0
    window.dispatchEvent(new Event("activity-cleared"))
  } finally { queue = []; accepting = true }
}

export async function restoreActivity(raw: ActivityArchive) {
  const archive = validateActivity(raw)
  const batches:StoredBatch[]=[]
  for (const [index,batch] of archive.batches.entries()) {
    const blob = await compressJson(batch)
    batches.push({ id: `restore:${crypto.randomUUID()}:${index}`, time: batch.rows.reduce((latest, row) => Math.max(latest, batch.base + row[0]), 0), bytes: blob.size, count: batch.rows.length, blob })
  }
  accepting = false
  queue = []
  try {
    await chain
    const db = await openLocalDatabase()
    const tx = db.transaction(["activity","daily"], "readwrite")
    const done = transactionDone(tx)
    tx.objectStore("activity").clear(); tx.objectStore("daily").clear()
    batches.forEach(batch => tx.objectStore("activity").put(batch))
    archive.daily.forEach(day => tx.objectStore("daily").put(day))
    await done
  } finally { queue = []; accepting = true }
}

/** Content stays in the app data. The interaction journal records only structural changes. */
export function trackStateChange(before: AppState, after: AppState) {
  if (typeof window === "undefined" || !activityEnabled()) return
  for (const kind of ["tasks", "events", "tags"] as const) {
    if (before[kind] === after[kind]) continue
    const old = new Map(before[kind].map(item => [item.id, item]))
    const nextIds = new Set(after[kind].map(item => item.id))
    let total = 0
    for (const item of after[kind]) {
      const previous = old.get(item.id)
      if (JSON.stringify(previous) === JSON.stringify(item)) continue
      total++
      if (total > 100) continue
      const data: ActivityData = { entity: entityKey(item.id), fields: Array.from(new Set([...Object.keys(previous??{}),...Object.keys(item)])).filter(key => JSON.stringify((item as unknown as Record<string,unknown>)[key]) !== JSON.stringify((previous as unknown as Record<string,unknown> | undefined)?.[key])) }
      if ("title" in item) { data.titleLength = item.title.length; data.descriptionLength = item.description.length; data.tagCount = item.tags.length }
      if ("priority" in item) { data.status = item.status; data.priority = item.priority; data.steps = item.steps.length; data.completedSteps = item.steps.filter(s=>s.completed).length; data.hasDueDate = !!item.dueDate; data.planned = !!item.weeklyPlanDate }
      if (previous && "priority" in previous) { data.previousStatus = previous.status; data.previousPriority = previous.priority }
      if ("date" in item) { data.allDay = !!item.isAllDay; data.multiDay = !!item.isMultiDay; data.recurring = !!item.recurrence; data.graded = item.isGraded; data.hasGrade = !!item.grade; data.tagCount = item.tags.length }
      track(`${kind}.${previous ? "update" : "create"}`, data)
    }
    let removed = 0
    for (const item of before[kind]) if (!nextIds.has(item.id)) { removed++; if (removed <= 100) track(`${kind}.delete`, {entity:entityKey(item.id)}) }
    track("data.change", {kind, changed:total, removed, total:after[kind].length, orderChanged:before[kind].map(i=>i.id).join("|") !== after[kind].map(i=>i.id).join("|")})
  }
}
