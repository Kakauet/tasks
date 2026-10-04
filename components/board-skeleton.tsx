const columns = ["Por hacer", "En progreso", "Completadas"]

export function BoardSkeleton() {
  return (
    <div role="status" aria-label="Cargando tareas" className="flex h-full min-h-0 flex-col gap-3">
      <span className="sr-only">Cargando tareas…</span>
      <div className="h-10 w-56 rounded-lg bg-muted" />
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-3" aria-hidden="true">
        {columns.map((title) => (
          <div key={title} className="min-h-0 rounded-xl border bg-card/70 p-4 [&:not(:first-child)]:hidden md:[&:not(:first-child)]:block">
            <p className="font-medium">{title}</p>
            <div className="mt-5 h-24 rounded-lg bg-muted motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
