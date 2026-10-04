import type { AppState } from "@/lib/tasks/types"
import { parsePersistedState } from "@/lib/tasks/model"
import { type ActivityArchive, validateActivity } from "@/lib/activity"
import { canonicalJson, checksum, compressJson, readJsonBlob, MAX_JSON_BYTES, MAX_FILE_BYTES } from "./codec"
import { openLocalDatabase, readAll, transactionDone, idbRequest } from "./database"

const PREFERENCE_KEYS = ["theme","taskmaster-accent-id","taskmaster-dark-mode-id","taskmaster-board-colors"] as const
export interface BackupPayload { data: AppState; preferences: Record<string,string>; activity?: ActivityArchive }
export interface BackupFile { format: "taskmaster-backup"; version: 3; exportedAt: string; payload: BackupPayload; checksum: string }
export interface InspectedBackup { payload: BackupPayload; exportedAt?: string; legacy: boolean; warnings: string[] }
export type ImportMode = "merge" | "replace"
export type ConflictPolicy = "keep" | "incoming"
export interface Recovery { id: string; createdAt: string; bytes: number; blob: Blob }

export function readPreferences(): Record<string,string> {
  const result: Record<string,string> = {}
  for(const key of PREFERENCE_KEYS) { try { const value = localStorage.getItem(key); if(value) result[key]=value } catch { /* optional preferences */ } }
  return result
}

function validatePreferences(raw: unknown): Record<string,string> {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("Preferencias no válidas.")
  const result: Record<string,string> = {}
  for(const key of PREFERENCE_KEYS) {
    const value=(raw as Record<string,unknown>)[key]
    if(value===undefined) continue
    if(typeof value!=="string" || value.length>2048) throw new Error("Preferencia no válida.")
    if(key==="theme" && !["light","dark","system"].includes(value)) throw new Error("Tema desconocido.")
    if(key!=="taskmaster-board-colors" && !/^[a-z0-9-]{1,50}$/.test(value)) throw new Error("Preferencia desconocida.")
    if(key==="taskmaster-board-colors") { const colors=JSON.parse(value); if(!colors || typeof colors!=="object" || Array.isArray(colors) || Object.values(colors).some(v=>typeof v!=="string" || !/^[#a-z0-9-]{1,50}$/i.test(v))) throw new Error("Colores no válidos.") }
    result[key]=value
  }
  return result
}

export function restorePreferences(preferences: Record<string,string>) {
  const checked=validatePreferences(preferences)
  for(const [key,value] of Object.entries(checked)) localStorage.setItem(key,value)
  window.dispatchEvent(new Event("taskmaster-preferences-restored"))
}

function cleanState(raw: unknown): { data: AppState; warnings: string[] } {
  const parsed=parsePersistedState(raw)
  if(!parsed) throw new Error("Datos inválidos: revisa identificadores duplicados, campos obligatorios, fechas y listas.")
  const select = <T extends object>(item:T, keys: string[]) => Object.fromEntries(keys.filter(k=>Object.prototype.hasOwnProperty.call(item,k)).map(k=>[k,(item as Record<string,unknown>)[k]])) as T
  // Only documented fields can enter the live application state.
  const data:AppState={
    tasks:parsed.tasks.map(t=>({...select(t,["id","title","description","status","priority","dueDate","weeklyPlanDate","weeklyPlanOrder","tags","focusSeconds","focusSessions","createdAt","updatedAt"]),steps:t.steps.map(s=>select(s,["id","text","completed"]))})),
    events:parsed.events.map(e=>({...select(e,["id","title","description","date","endDate","startTime","endTime","isAllDay","isMultiDay","isGraded","grade","tags","parentEventId","color"]),...(e.recurrence?{recurrence:select(e.recurrence,["type","interval","endDate","occurrences"])}:{})})),
    tags:parsed.tags.map(t=>select(t,["id","name","color"])),
  }
  for(const t of data.tasks) if(new Set(t.steps.map(s=>s.id)).size!==t.steps.length) throw new Error("Hay pasos con identificadores duplicados en una tarea.")
  const tagIds=new Set(data.tags.map(t=>t.id))
  const missingTags=new Set([...data.tasks,...data.events].flatMap(t=>t.tags).filter(id=>!tagIds.has(id)))
  const eventIds=new Set(data.events.map(e=>e.id))
  const missingParents=data.events.filter(e=>e.parentEventId && !eventIds.has(e.parentEventId)).length
  const warnings:string[]=[]
  if(missingTags.size) warnings.push(`${missingTags.size} etiquetas referenciadas no están en esta copia; las referencias se conservan para poder combinarla con tus datos.`)
  if(missingParents) warnings.push(`${missingParents} eventos recurrentes no incluyen su evento de origen.`)
  return {data,warnings}
}

export async function createBackup(data:AppState, preferences:Record<string,string>={}, activity?:ActivityArchive):Promise<BackupFile> {
  const clean=cleanState(data).data
  const payload:BackupPayload={data:clean,preferences:validatePreferences(preferences),...(activity?{activity:validateActivity(activity)}:{})}
  if(new Blob([JSON.stringify(payload)]).size>MAX_JSON_BYTES) throw new Error("El archivo supera el máximo técnico de 512 MB. Exporta los datos y la actividad por separado.")
  return {format:"taskmaster-backup",version:3,exportedAt:new Date().toISOString(),payload,checksum:await checksum(payload)}
}

export async function inspectBackup(raw:unknown):Promise<InspectedBackup> {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("El archivo no contiene una copia válida.")
  const candidate=raw as Partial<BackupFile> & {version?: unknown}
  if(candidate.format==="taskmaster-backup") {
    if(candidate.version!==3) throw new Error("Esta versión de copia no es compatible con la aplicación.")
    if(!candidate.payload || typeof candidate.checksum!=="string" || !/^[a-f0-9]{64}$/.test(candidate.checksum)) throw new Error("Copia incompleta: falta su comprobación de integridad.")
    if(await checksum(candidate.payload)!==candidate.checksum) throw new Error("La copia está dañada o ha sido modificada: no coincide la comprobación de integridad.")
    if(typeof candidate.exportedAt!=="string" || !Number.isFinite(Date.parse(candidate.exportedAt))) throw new Error("Fecha de exportación no válida.")
    const {data,warnings}=cleanState(candidate.payload.data)
    return {payload:{data,preferences:validatePreferences(candidate.payload.preferences),...(candidate.payload.activity?{activity:validateActivity(candidate.payload.activity)}:{})},exportedAt:candidate.exportedAt,legacy:false,warnings}
  }
  const version=(raw as {version?:unknown}).version
  if(version!==undefined && !["1.0","2.0",1,2].includes(version as string)) throw new Error("Formato o versión no reconocido.")
  const {data,warnings}=cleanState(raw)
  return {payload:{data,preferences:{}},legacy:true,warnings:["Copia antigua: se han validado sus datos; no incluye comprobación de integridad.",...warnings]}
}

export function planImport(current:AppState, incoming:AppState, mode:ImportMode, policy:ConflictPolicy) {
  const result:AppState={tasks:[],events:[],tags:[]}
  const stats={added:0,conflicts:0,updated:0,kept:0,removed:0}
  const merge = <T extends {id:string}>(localItems:T[], incomingItems:T[]):T[] => {
    const local=new Map(localItems.map(item=>[item.id,item]))
    const output=new Map(mode==="merge"?local:[])
    for(const item of incomingItems) {
      const old=local.get(item.id)
      if(!old) stats.added++
      else if(canonicalJson(old)!==canonicalJson(item)) {stats.conflicts++;if(mode==="replace" || policy==="incoming")stats.updated++;else stats.kept++}
      else stats.kept++
      if(mode==="replace" || !old || policy==="incoming")output.set(item.id,item)
    }
    if(mode==="replace") stats.removed += localItems.filter(item=>!output.has(item.id)).length
    return Array.from(output.values())
  }
  result.tasks=merge(current.tasks,incoming.tasks)
  result.events=merge(current.events,incoming.events)
  result.tags=merge(current.tags,incoming.tags)
  return {data:result,stats}
}

export async function saveRecovery(backup:BackupFile) {
  const blob=await compressJson(backup)
  if(blob.size>MAX_FILE_BYTES) throw new Error("La copia de recuperación supera el máximo técnico de 512 MB.")
  const db=await openLocalDatabase()
  const tx=db.transaction("recovery","readwrite")
  const done=transactionDone(tx)
  const store=tx.objectStore("recovery")
  const previous:Recovery[]=await idbRequest(store.getAll())
  for(const old of previous.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(2))store.delete(old.id)
  store.put({id:crypto.randomUUID(),createdAt:backup.exportedAt,bytes:blob.size,blob} satisfies Recovery)
  await done
}

export async function listRecovery() { return (await readAll<Recovery>("recovery")).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)) }
export async function readRecovery(id:string) {
  const db=await openLocalDatabase()
  const saved:Recovery|undefined=await idbRequest(db.transaction("recovery").objectStore("recovery").get(id))
  if(!saved)throw new Error("La copia de recuperación ya no está disponible.")
  return inspectBackup(await readJsonBlob(saved.blob))
}
