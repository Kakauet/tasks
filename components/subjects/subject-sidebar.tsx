"use client"

import { ChevronsLeft, GraduationCap, Inbox, Layers, Plus, Settings2 } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { StatusIcon } from "@/components/subjects/subject-status"
import { Button } from "@/components/ui/button"
import { useTaskContext } from "@/context/task-context"
import { useSubjectScope } from "@/context/subject-scope"
import { STATUS_LABEL, subjectIdOf, type SubjectScope, type SubjectStatus } from "@/lib/tasks/subjects"
import { cn } from "@/lib/utils"

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/** Curva y duración comunes de la barra: arranca rápido y frena suave, sin rebote. */
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]"
const DURATION_MS = 320
const WIDTH = { expanded: 240, collapsed: 56 } as const

/** Los textos se apagan antes de que el ancho los recorte y vuelven cuando ya hay sitio. */
const fade = (hidden: boolean) => cn("transition-opacity", hidden ? "opacity-0 duration-100" : "opacity-100 duration-200 delay-100")

const ROW = "relative flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-md pl-3 pr-2.5 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"

interface ItemProps {
  selected: boolean
  onSelect: () => void
  collapsed: boolean
  label: string
  /** Texto accesible completo: nombre, estado y pendientes. */
  description: string
  marker: ReactNode
  status?: SubjectStatus
  count?: number
}

function NavItem({ selected, onSelect, collapsed, label, description, marker, status, count }: ItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        aria-label={description}
        title={collapsed ? description : undefined}
        className={cn("group", ROW, selected ? "text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}
      >
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          {marker}
          {/* Plegada no hay sitio para la columna de estado: pasa a ser una insignia sobre el punto. */}
          {status && (
            <span aria-hidden="true" className={cn("absolute -bottom-2 -right-2 rounded-full bg-card transition-[opacity,transform] duration-200", collapsed ? "scale-100 opacity-100 delay-150" : "scale-50 opacity-0")}>
              <span className={cn("flex rounded-full p-px transition-colors duration-150", selected ? "bg-accent" : "group-hover:bg-accent/50")}>
                <StatusIcon status={status} className="h-3 w-3" />
              </span>
            </span>
          )}
        </span>
        <span className={cn("min-w-0 flex-1 truncate", selected && "font-medium", fade(collapsed))}>{label}</span>
        {count !== undefined && count > 0 && <span className={cn("shrink-0 text-xs tabular-nums text-muted-foreground", fade(collapsed))}>{count}</span>}
        {status && <span className={cn("flex shrink-0", fade(collapsed))}><StatusIcon status={status} /></span>}
      </button>
    </li>
  )
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Lista de asignaturas compartida por la barra lateral y el selector móvil. */
export function SubjectNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { tasks, events, subjects } = useTaskContext()
  const { scope, setScope, activeSubjects, summaries } = useSubjectScope()
  const listRef = useRef<HTMLUListElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number; animate: boolean } | null>(null)

  const pendingTotal = useMemo(() => tasks.filter((task) => task.status !== "done").length, [tasks])
  const unassigned = useMemo(
    () => ({
      tasks: tasks.filter((task) => task.status !== "done" && !subjectIdOf(task, subjects)).length,
      any: tasks.some((task) => !subjectIdOf(task, subjects)) || events.some((event) => !subjectIdOf(event, subjects)),
    }),
    [tasks, events, subjects],
  )

  // Un único fondo que se desliza hasta la opción elegida, en lugar de saltar de una a otra.
  useIsomorphicLayoutEffect(() => {
    const current = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')
    setIndicator((previous) => (current ? { top: current.offsetTop, height: current.offsetHeight, animate: previous !== null } : null))
  }, [scope, activeSubjects, unassigned.any])

  const choose = (next: SubjectScope) => {
    setScope(next)
    onNavigate?.()
  }

  return (
    <ul ref={listRef} className="relative flex flex-col gap-0.5" aria-label="Asignaturas">
      {indicator && (
        <li
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-x-0 top-0 rounded-md bg-accent", indicator.animate && "transition-transform duration-200 ease-out")}
          style={{ height: indicator.height, transform: `translateY(${indicator.top}px)` }}
        />
      )}
      <NavItem
        selected={scope === "all"}
        onSelect={() => choose("all")}
        collapsed={collapsed}
        label="Todas"
        description={`Todas las asignaturas, ${plural(pendingTotal, "tarea pendiente", "tareas pendientes")}`}
        marker={<Layers aria-hidden="true" className="h-4 w-4" />}
        count={pendingTotal}
      />
      {activeSubjects.map((subject) => {
        const summary = summaries.get(subject.id)
        const status = summary?.status ?? "upToDate"
        return (
          <NavItem
            key={subject.id}
            selected={scope === subject.id}
            onSelect={() => choose(subject.id)}
            collapsed={collapsed}
            label={subject.name}
            description={`${subject.name}: ${STATUS_LABEL[status].toLowerCase()}, ${plural(summary?.pending ?? 0, "tarea pendiente", "tareas pendientes")}`}
            marker={<span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} />}
            status={status}
            count={summary?.pending}
          />
        )
      })}
      {activeSubjects.length > 0 && unassigned.any && (
        <NavItem
          selected={scope === "none"}
          onSelect={() => choose("none")}
          collapsed={collapsed}
          label="Sin asignatura"
          description={`Sin asignatura, ${plural(unassigned.tasks, "tarea pendiente", "tareas pendientes")}`}
          marker={<Inbox aria-hidden="true" className="h-4 w-4" />}
          count={unassigned.tasks}
        />
      )}
    </ul>
  )
}

function RailButton({ collapsed, icon, label, onClick }: { collapsed: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={collapsed ? label : undefined} className={cn(ROW, "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
      <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <span className={cn("min-w-0 flex-1 truncate", fade(collapsed))}>{label}</span>
    </button>
  )
}

/**
 * Barra lateral de asignaturas (solo en pantallas anchas). Al plegarse los iconos no se mueven:
 * solo cambia el ancho y los textos se desvanecen. Al activar o desactivar la función entra y
 * sale deslizándose mientras el contenido ocupa o libera su sitio.
 */
export function SubjectSidebar({ show, ready }: { show: boolean; ready: boolean }) {
  const { collapsed, setCollapsed, openManager, openGrades, activeSubjects } = useSubjectScope()
  // Sin transiciones hasta que la página se ha asentado: al cargar no debe verse ninguna animación.
  const [animate, setAnimate] = useState(false)
  // Último valor de `show` cuyo movimiento ya terminó; mientras difiere, la barra se recorta.
  const [settled, setSettled] = useState(show)

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => setAnimate(true), 120)
    return () => window.clearTimeout(timer)
  }, [ready])

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(show), animate ? DURATION_MS + 40 : 0)
    return () => window.clearTimeout(timer)
  }, [show, animate])

  const width = collapsed ? WIDTH.collapsed : WIDTH.expanded
  const moving = show !== settled
  const transition = animate && `duration-300 ${EASE}`

  // El contenedor existe siempre (con ancho 0 si está apagada) para que la entrada pueda animarse desde cero;
  // el contenido solo mientras se ve o termina de salir.
  const mounted = show || settled

  return (
    <div
      aria-hidden={show ? undefined : true}
      className={cn("my-5 hidden max-h-[calc(100%-2.5rem)] shrink-0 self-start lg:flex", transition && `transition-[width,margin,opacity] ${transition}`, (moving || !show) && "overflow-hidden", !show && "opacity-0")}
      style={{ width: show ? width : 0, marginRight: show ? 16 : 0 }}
    >
      {mounted && <aside
        aria-label="Asignaturas"
        data-subject-sidebar
        className={cn(
          "flex max-h-full shrink-0 flex-col overflow-y-auto overflow-x-hidden rounded-xl border border-border/70 bg-card p-2 shadow-[var(--shadow-panel)]",
          transition && `transition-[width,transform] ${transition}`,
        )}
        style={{ width, transform: show ? undefined : "translateX(-12px)" }}
      >
        <div className="relative mb-1 flex h-10 shrink-0 items-center pl-3">
          {/* Sin padding fijo a la derecha: plegada, la cabecera debe caber en el ancho del icono. */}
          <h2 className={cn("max-w-[calc(100%-5.5rem)] truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", fade(collapsed))}>Asignaturas</h2>
          <div className="absolute right-0.5 top-0.5 flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9 sm:h-9 sm:w-9", fade(collapsed), collapsed && "pointer-events-none")}
              tabIndex={collapsed ? -1 : undefined}
              aria-hidden={collapsed || undefined}
              aria-label="Gestionar asignaturas"
              title="Gestionar asignaturas"
              onClick={() => openManager()}
            >
              <Settings2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 sm:h-9 sm:w-9"
              aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expandir" : "Contraer"}
              onClick={() => setCollapsed(!collapsed)}
            >
              <ChevronsLeft className={cn("transition-transform duration-300", EASE, collapsed && "rotate-180")} />
            </Button>
          </div>
        </div>

        <SubjectNav collapsed={collapsed} />

        {activeSubjects.length === 0 && (
          <p className={cn("w-[13.5rem] overflow-hidden px-3 text-sm text-muted-foreground transition-[max-height,padding] duration-300", EASE, collapsed ? "max-h-0 py-0" : "max-h-40 py-2", fade(collapsed))}>
            Añade tus asignaturas para ver de un vistazo si vas al día en cada una.
          </p>
        )}

        <div className="mt-1 flex shrink-0 flex-col gap-0.5 border-t border-border/70 pt-1">
          <RailButton collapsed={collapsed} icon={<Plus />} label="Nueva asignatura" onClick={() => openManager()} />
          <RailButton collapsed={collapsed} icon={<GraduationCap />} label="Notas" onClick={openGrades} />
        </div>
      </aside>}
    </div>
  )
}
