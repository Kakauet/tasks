"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const shortcuts = [
  ["Nueva tarea", "N"], ["Nuevo evento", "E"],
  ["Ir al tablero / calendario", "1 / 2"], ["Cambiar de vista", "V"],
  ["Ir a hoy (calendario)", "T"], ["Buscar tareas", "/"],
  ["Deshacer", "Ctrl + Z"], ["Rehacer", "Ctrl + Y"], ["Mostrar atajos", "?"],
]

export function KeyboardShortcuts({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Atajos de teclado</DialogTitle>
        <DialogDescription>Acciones rápidas cuando no estás escribiendo en un campo.</DialogDescription>
      </DialogHeader>
      <dl className="space-y-3 text-sm">
        {shortcuts.map(([label, keys]) => <div key={label} className="flex items-center justify-between">
          <dt>{label}</dt><dd><kbd className="rounded-md bg-muted px-2 py-1 text-xs">{keys}</kbd></dd>
        </div>)}
      </dl>
    </DialogContent>
  </Dialog>
}
