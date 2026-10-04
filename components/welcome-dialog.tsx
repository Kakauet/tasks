"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CalendarDays, CheckSquare2, LayoutDashboard } from "lucide-react"

interface WelcomeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const tips = [
  {
    Icon: LayoutDashboard,
    title: "Organiza tus tareas",
    description: "Crea una tarea en la columna adecuada y muévela arrastrando la tarjeta o cambiando su estado.",
  },
  {
    Icon: CheckSquare2,
    title: "Avanza paso a paso",
    description: "Marca el siguiente paso desde la tarjeta. Puedes desplegar todos sus pasos cuando lo necesites.",
  },
  {
    Icon: CalendarDays,
    title: "Usa el calendario",
    description: "Pulsa + en un día para crear un evento en esa fecha. Las tareas con vencimiento también se abren allí.",
  },
]

export function WelcomeDialog({ open, onOpenChange }: WelcomeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%_-_1.5rem)] max-w-lg p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14 text-left">
          <DialogTitle>Guía rápida</DialogTitle>
          <DialogDescription>Tres formas de trabajar más rápido en TaskMaster.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 px-6 py-4">
          {tips.map(({ Icon, title, description }) => (
            <div key={title} className="flex gap-3 rounded-lg px-1 py-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button type="button" variant="primary" onClick={() => onOpenChange(false)}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
