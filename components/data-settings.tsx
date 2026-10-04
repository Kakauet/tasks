"use client"

import { useCallback, useEffect, useState } from "react"
import { Database, Download, RefreshCw, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatBytes } from "@/lib/data/codec"
import { getDataUsage, type DataUsage } from "@/lib/data/usage"
import { useTaskContext } from "@/context/task-context"

export function DataSettings({ open, onOpenChange, onExport, onImport }: { open: boolean; onOpenChange: (open: boolean) => void; onExport: () => void; onImport: () => void }) {
  const { tasks, events, tags } = useTaskContext()
  const [usage, setUsage] = useState<DataUsage | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    void getDataUsage().then(setUsage).finally(() => setLoading(false))
  }, [])
  useEffect(() => { if (open) refresh() }, [open, refresh])
  const openAction = (action: () => void) => { onOpenChange(false); action() }
  const amount = (bytes: number) => formatBytes(bytes)

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" />Datos y almacenamiento</DialogTitle>
        <DialogDescription>Resumen de lo guardado en este navegador. El historial no caduca por tiempo ni por cantidad.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center text-sm">
        <div><strong className="block text-xl tabular-nums">{tasks.length.toLocaleString()}</strong>Tareas</div>
        <div><strong className="block text-xl tabular-nums">{events.length.toLocaleString()}</strong>Eventos</div>
        <div><strong className="block text-xl tabular-nums">{tags.length.toLocaleString()}</strong>Etiquetas</div>
      </div>

      <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
        <div className="flex items-center justify-between gap-2"><span className="font-medium">Espacio conocido de la aplicación</span><strong className="tabular-nums">{usage ? amount(usage.knownBytes) : "Calculando…"}</strong></div>
        {usage && <>
          <div className="flex justify-between gap-2 text-muted-foreground"><span>Tareas, eventos y etiquetas</span><span className="tabular-nums">{amount(usage.stateBytes)}</span></div>
          <div className="flex justify-between gap-2 text-muted-foreground"><span>Actividad comprimida</span><span className="tabular-nums">{amount(usage.activityBytes)}</span></div>
          <div className="flex justify-between gap-2 text-muted-foreground"><span>Resúmenes diarios</span><span className="tabular-nums">{amount(usage.dailyBytes)}</span></div>
          <div className="flex justify-between gap-2 text-muted-foreground"><span>Copias de recuperación ({usage.recoveryCount})</span><span className="tabular-nums">{amount(usage.recoveryBytes)}</span></div>
          <div className="flex justify-between gap-2 text-muted-foreground"><span>Preferencias y datos anteriores</span><span className="tabular-nums">{amount(usage.localBytes)}</span></div>
          {usage.originUsed !== undefined && <p className="border-t border-border pt-2 text-xs text-muted-foreground">Uso total indicado por el navegador para este sitio: {amount(usage.originUsed)}{usage.originQuota ? ` de ${amount(usage.originQuota)} disponibles` : ""}. Incluye caché y otros datos del sitio.</p>}
        </>}
      </div>

      {usage && <p className="text-sm text-muted-foreground">{usage.activityCount.toLocaleString()} interacciones guardadas en {usage.days.toLocaleString()} días{usage.firstDay && usage.lastDay ? ` · ${usage.firstDay} a ${usage.lastDay}` : ""}. Copias e historial crecen hasta el espacio que permita el navegador.</p>}
      {usage?.warnings.map(warning => <p key={warning} role="status" className="text-xs text-destructive">{warning}</p>)}
      <p className="text-xs text-muted-foreground">Los tamaños de cada categoría son aproximados; el navegador puede añadir espacio para índices y caché.</p>
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button variant="ghost" size="sm" disabled={loading} onClick={refresh}><RefreshCw className="h-4 w-4" />Actualizar</Button>
        <Button variant="outline" size="sm" onClick={() => openAction(onImport)}><Download className="h-4 w-4" />Importar</Button>
        <Button size="sm" onClick={() => openAction(onExport)}><Upload className="h-4 w-4" />Exportar y gestionar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
