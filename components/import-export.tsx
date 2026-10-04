"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useTaskContext } from "@/context/task-context"
import { activityEnabled, activityStats, clearActivity, exportActivity, restoreActivity, setActivityEnabled, track } from "@/lib/activity"
import { createBackup, inspectBackup, listRecovery, planImport, readPreferences, readRecovery, restorePreferences, saveRecovery, type ConflictPolicy, type ImportMode, type InspectedBackup, type Recovery } from "@/lib/data/backup"
import { compressJson, downloadBlob, formatBytes, MAX_FILE_BYTES, readJsonBlob } from "@/lib/data/codec"
import { Download, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

export type DataDialogMode = "export" | "import" | null
export function ImportExport({ mode, onModeChange, hideButtons = false }: { mode?: DataDialogMode; onModeChange?: (mode:DataDialogMode)=>void; hideButtons?:boolean }) {
  const { tasks,events,tags,importData }=useTaskContext()
  const [localMode,setLocalMode]=useState<DataDialogMode>(null)
  const activeMode=mode===undefined?localMode:mode
  const setMode=(value:DataDialogMode)=>{setLocalMode(value);onModeChange?.(value)}
  const current=useMemo(()=>({tasks,events,tags}),[tasks,events,tags])
  const latest=useRef(current);latest.current=current
  const request=useRef(0)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [text,setText]=useState("")
  const [source,setSource]=useState("")
  const [preview,setPreview]=useState<InspectedBackup|null>(null)
  const [importMode,setImportMode]=useState<ImportMode>("merge")
  const [policy,setPolicy]=useState<ConflictPolicy>("keep")
  const [confirmed,setConfirmed]=useState(false)
  const [includeActivity,setIncludeActivity]=useState(true)
  const [includePreferences,setIncludePreferences]=useState(true)
  const [compressed,setCompressed]=useState(true)
  const [restoreLog,setRestoreLog]=useState(false)
  const [restoreAppearance,setRestoreAppearance]=useState(false)
  const [enabled,setEnabled]=useState(true)
  const [stats,setStats]=useState<{bytes:number;count:number;error:string|null}|null>(null)
  const [recoveries,setRecoveries]=useState<Recovery[]>([])
  const plan=useMemo(()=>preview?planImport(current,preview.payload.data,importMode,policy):null,[current,preview,importMode,policy])
  const message=(value:unknown)=>value instanceof Error?value.message:"No se ha podido completar la operación."
  useEffect(()=>{
    if(!activeMode)return
    setError(null);setEnabled(activityEnabled())
    void activityStats().then(setStats).catch(()=>setStats({bytes:0,count:0,error:"El almacenamiento de actividad no está disponible."}))
    void listRecovery().then(setRecoveries).catch(()=>setRecoveries([]))
  },[activeMode])
  const close=()=>{if(busy)return;request.current++;setMode(null);setError(null);setPreview(null);setText("");setSource("");setConfirmed(false);setRestoreLog(false);setRestoreAppearance(false)}

  const analyze=async(blob:Blob,name:string)=>{
    const generation=++request.current
    setBusy(true);setError(null);setPreview(null);setConfirmed(false);setRestoreLog(false);setRestoreAppearance(false)
    try {
      if(blob.size>MAX_FILE_BYTES)throw new Error("El archivo supera el máximo técnico de 512 MB.")
      const checked=await inspectBackup(await readJsonBlob(blob))
      if(generation!==request.current)return
      setPreview(checked);setSource(name)
      track("backup.inspect",{bytes:blob.size,legacy:checked.legacy,tasks:checked.payload.data.tasks.length,events:checked.payload.data.events.length,tags:checked.payload.data.tags.length})
    } catch(e) {if(generation===request.current)setError(message(e));track("backup.error",{operation:"inspect"})}
    finally {if(generation===request.current)setBusy(false)}
  }
  const exportFile=async()=>{
    setBusy(true);setError(null)
    try {
      const archive=includeActivity?await exportActivity():undefined
      const backup=await createBackup(latest.current,includePreferences?readPreferences():{},archive)
      const gzip=compressed && typeof CompressionStream!=="undefined"
      const blob=gzip?await compressJson(backup):new Blob([JSON.stringify(backup,null,2)],{type:"application/json"})
      if(blob.size>MAX_FILE_BYTES)throw new Error("La copia supera el máximo técnico de 512 MB. Activa la compresión o exporta la actividad por separado.")
      downloadBlob(blob,`taskmaster-${new Date().toISOString().replace(/[:.]/g,"-")}.json${gzip?".gz":""}`)
      track("backup.export",{bytes:blob.size,compressed:gzip,activity:includeActivity,preferences:includePreferences})
      toast.success(`Copia preparada: ${formatBytes(blob.size)}.`)
    }catch(e){setError(message(e));track("backup.error",{operation:"export"})}finally{setBusy(false)}
  }
  const apply=async()=>{
    if(!preview || !plan || importMode==="replace"&&!confirmed)return
    setBusy(true);setError(null)
    try {
      const snapshot=latest.current
      const next=planImport(snapshot,preview.payload.data,importMode,policy)
      const previousLog=restoreLog?await exportActivity():undefined
      try {await saveRecovery(await createBackup(snapshot,readPreferences(),previousLog))}
      catch {throw new Error("No se pudo guardar la copia de recuperación. La importación se ha detenido y tus datos siguen intactos. Libera espacio o habilita el almacenamiento local.")}
      if(snapshot!==latest.current)throw new Error("Tus datos han cambiado mientras se preparaba la copia. Revisa la vista previa y vuelve a importar.")
      importData(next.data)
      const warnings:string[]=[]
      if(restoreAppearance)try{restorePreferences(preview.payload.preferences)}catch{warnings.push("No se pudieron restaurar las preferencias.")}
      if(restoreLog && preview.payload.activity)try{await restoreActivity(preview.payload.activity)}catch{warnings.push("No se pudo restaurar la actividad.")}
      track("backup.import",{mode:importMode,policy,added:next.stats.added,updated:next.stats.updated,removed:next.stats.removed,activity:restoreLog,preferences:restoreAppearance})
      if(warnings.length)toast.warning(`Datos importados. ${warnings.join(" ")}`)
      else toast.success("Datos importados. La copia anterior está en Recuperación.")
      setPreview(null);setText("");setSource("");setConfirmed(false);setMode(null)
    }catch(e){setError(message(e));track("backup.error",{operation:"import"})}finally{setBusy(false)}
  }

  const option=(id:string,label:string,value:boolean,set:(value:boolean)=>void)=><label htmlFor={id} className="flex items-center gap-2 text-sm"><Checkbox id={id} checked={value} disabled={busy} onCheckedChange={checked=>set(checked===true)} />{label}</label>
  return <>
    {!hideButtons && <div className="flex flex-col gap-2">
      <Button variant="outline" data-track="export-open" onClick={()=>setMode("export")}><Upload className="h-4 w-4" />Exportar datos</Button>
      <Button variant="outline" data-track="import-open" onClick={()=>setMode("import")}><Download className="h-4 w-4" />Importar datos</Button>
    </div>}
    <Dialog open={activeMode!==null} onOpenChange={open=>{if(!open)close()}}>
      <DialogContent className="sm:max-w-[640px]" onEscapeKeyDown={event=>{if(busy)event.preventDefault()}} onPointerDownOutside={event=>{if(busy)event.preventDefault()}}>
        <DialogHeader><DialogTitle>{activeMode==="export"?"Exportar y gestionar datos":"Importar datos"}</DialogTitle>
          <DialogDescription>{activeMode==="export"?"Guarda una copia completa para trasladar o recuperar tu espacio de trabajo.":"Revisa el contenido antes de combinarlo con tus datos o reemplazarlos."}</DialogDescription></DialogHeader>
        {activeMode==="export"?<div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-4 text-center text-sm"><span><strong className="block text-xl">{tasks.length}</strong>Tareas</span><span><strong className="block text-xl">{events.length}</strong>Eventos</span><span><strong className="block text-xl">{tags.length}</strong>Etiquetas</span></div>
          <div className="space-y-3">
            {option("backup-compress","Comprimir la copia (.json.gz)",compressed,setCompressed)}
            {option("backup-preferences","Incluir preferencias de apariencia",includePreferences,setIncludePreferences)}
            {option("backup-activity","Incluir historial de actividad local",includeActivity,setIncludeActivity)}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">La copia incluye una comprobación de integridad. La compresión reduce su tamaño, pero no cifra el contenido. Guárdala en un lugar de confianza.</p>
          <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Actividad local y almacenamiento</summary>
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-muted-foreground">{stats?`${stats.count.toLocaleString()} eventos · ${formatBytes(stats.bytes)} comprimidos` : "Calculando…"}</p>
              {stats?.error && <p role="status" className="text-destructive">{stats.error}</p>}
              <p className="text-xs leading-relaxed text-muted-foreground">Acciones, tiempos de uso y métricas de interacción guardadas en este navegador, sin caducidad ni tope de entradas. Se comprimen; su capacidad depende del espacio disponible en el navegador. No se envían a la nube ni incluyen el texto de los campos. Borrar el historial no elimina las copias descargadas ni las de recuperación.</p>
              {option("activity-enabled","Registrar actividad en este navegador",enabled,value=>{try{setActivityEnabled(value);setEnabled(value)}catch(e){setError(message(e))}})}
              <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={async()=>{setBusy(true);try{const archive=await exportActivity();const gzip=typeof CompressionStream!=="undefined";downloadBlob(await compressJson({format:"taskmaster-activity",...archive}),`taskmaster-activity.json${gzip?".gz":""}`)}catch(e){setError(message(e))}finally{setBusy(false)}}}>Exportar solo actividad</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={async()=>{setBusy(true);try{await clearActivity();setStats({bytes:0,count:0,error:null});toast.success("Historial de actividad local borrado.")}catch(e){setError(message(e))}finally{setBusy(false)}}}>Borrar historial de actividad</Button></div>
            </div>
          </details>
        </div>:<div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="backup-file">Archivo de copia (.json o .json.gz)</Label>
            <input id="backup-file" type="file" accept=".json,.gz,application/json,application/gzip" disabled={busy} className="w-full rounded-lg border border-border p-3 text-sm" onChange={event=>{const file=event.target.files?.[0];if(file)void analyze(file,file.name);event.target.value=""}} />
          </div>
          <details><summary className="cursor-pointer text-sm text-muted-foreground">Pegar JSON</summary><Textarea id="import-text" aria-label="Datos JSON" disabled={busy} value={text} onChange={event=>{setText(event.target.value);setPreview(null);setConfirmed(false)}} className="mt-2 h-28 font-mono text-xs" />
            <Button className="mt-2" variant="outline" size="sm" disabled={busy||!text.trim()} onClick={()=>void analyze(new Blob([text]),"JSON pegado")}>Analizar JSON</Button></details>
          {preview && plan && <div className="space-y-4 rounded-xl border border-border p-4">
            <p className="break-words text-sm font-semibold">{source}</p>
            <p className="text-xs text-muted-foreground">{preview.legacy?"Formato anterior":"Integridad verificada"}{preview.exportedAt?` · ${new Date(preview.exportedAt).toLocaleString()}`:""}</p>
            <p className="text-sm">{preview.payload.data.tasks.length} tareas · {preview.payload.data.events.length} eventos · {preview.payload.data.tags.length} etiquetas</p>
            {preview.warnings.map(warning=><p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}
            <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Cómo importar</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="import-mode" checked={importMode==="merge"} disabled={busy} onChange={()=>{setImportMode("merge");setConfirmed(false)}} />Combinar con mis datos</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="import-mode" checked={importMode==="replace"} disabled={busy} onChange={()=>{setImportMode("replace");setConfirmed(false)}} />Reemplazar mis datos</label>
            </fieldset>
            {importMode==="merge" && <div className="space-y-1"><Label htmlFor="conflict-policy">Si el mismo registro tiene cambios</Label><select id="conflict-policy" value={policy} disabled={busy} onChange={event=>setPolicy(event.target.value as ConflictPolicy)} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"><option value="keep">Conservar mi versión actual</option><option value="incoming">Usar la versión del archivo</option></select></div>}
            <p className="text-sm" role="status">{plan.stats.added} nuevos · {plan.stats.updated} actualizados · {plan.stats.kept} conservados · {plan.stats.removed} eliminados. {plan.stats.conflicts} conflictos detectados.</p>
            {Object.keys(preview.payload.preferences).length>0 && option("restore-preferences","Restaurar también la apariencia",restoreAppearance,setRestoreAppearance)}
            {!!preview.payload.activity && option("restore-activity","Reemplazar el historial de actividad por el del archivo",restoreLog,setRestoreLog)}
            {importMode==="replace" && option("replace-confirmed","Confirmo que quiero reemplazar mis datos actuales",confirmed,setConfirmed)}
            <p className="text-xs text-muted-foreground">Antes de importar se guardará una copia de recuperación local. Se conservan las tres últimas.</p>
          </div>}
          {recoveries.length>0 && <details><summary className="cursor-pointer text-sm font-medium">Recuperar una versión anterior ({recoveries.length})</summary><div className="mt-2 space-y-2">{recoveries.map(recovery=><Button key={recovery.id} variant="outline" size="sm" className="w-full justify-between" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{setPreview(await readRecovery(recovery.id));setSource("Copia de recuperación");setImportMode("replace");setConfirmed(false);setRestoreLog(false);setRestoreAppearance(false)}catch(e){setError(message(e))}finally{setBusy(false)}}}><span>{new Date(recovery.createdAt).toLocaleString()}</span><span>{formatBytes(recovery.bytes)}</span></Button>)}</div></details>}
        </div>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={close}>Cerrar</Button>
          <Button disabled={busy || activeMode==="import" && (!preview || importMode==="replace"&&!confirmed)} onClick={()=>void(activeMode==="export"?exportFile():apply())}>{busy?<Loader2 className="h-4 w-4 animate-spin" />:activeMode==="export"?<Upload className="h-4 w-4" />:<Download className="h-4 w-4" />}{busy?"Procesando…":activeMode==="export"?"Descargar copia":"Aplicar importación"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
