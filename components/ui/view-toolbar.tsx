import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Fila de herramientas de una vista (tablero, calendario). Todas comparten
 * contenedor, altura y orden: a la izquierda lo que te sitúa (búsqueda, «Hoy»),
 * a la derecha cómo ves la vista y, al final, la acción principal.
 */
export function ViewToolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shrink-0 rounded-2xl border border-border/70 bg-card/70 p-2 shadow-sm", className)}
      {...props}
    />
  )
}
