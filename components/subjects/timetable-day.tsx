import { Coffee } from "lucide-react"
import type { Subject } from "@/context/task-context"
import { TIMETABLE_DAYS, type TimetableRow } from "@/lib/tasks/timetable"
import { cn } from "@/lib/utils"

const normalizeLabel = (label: string) => label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()

export function timetableColors(subjects: Subject[]) {
  const colors = new Map(subjects.map((subject) => [normalizeLabel(subject.name), subject.color]))
  for (const subject of subjects) {
    for (const alias of subject.aliases ?? []) {
      const key = normalizeLabel(alias)
      if (!colors.has(key)) colors.set(key, subject.color)
    }
  }
  return colors
}

export function lessonBackground(colors: ReadonlyMap<string, string>, label: string) {
  const color = colors.get(normalizeLabel(label))
  return color ? `color-mix(in srgb, ${color} 7%, transparent)` : undefined
}

export function TimeRange({ row, inline = false }: { row: TimetableRow; inline?: boolean }) {
  return (
    <span className={cn(
      "flex whitespace-nowrap text-[13px] leading-tight tabular-nums",
      inline ? "items-baseline gap-1" : "flex-col items-start gap-0.5",
    )}>
      <time dateTime={row.start} className="font-medium text-foreground">{row.start}</time>
      <span className="sr-only">a</span>
      {inline && <span aria-hidden="true" className="text-muted-foreground">–</span>}
      <time dateTime={row.end} className="text-muted-foreground">{row.end}</time>
    </span>
  )
}

export function BreakLabel({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]", className)}>
      <Coffee aria-hidden="true" className="size-4 shrink-0" />
      <span>{label}</span>
    </span>
  )
}

export function TimetableDay({ rows, day, colors, compact = false, className }: {
  rows: TimetableRow[]
  day: number
  colors: ReadonlyMap<string, string>
  compact?: boolean
  className?: string
}) {
  const hasClasses = rows.some((row) => row.kind === "lesson" && row.lessons[day])
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden border border-border/75", className)}>
      {hasClasses ? (
        <ul className="min-h-0 divide-y divide-border/65 overflow-y-auto overscroll-contain" aria-label={`Horario del ${TIMETABLE_DAYS[day].toLowerCase()}`}>
          {rows.map((row) => {
            if (row.kind === "lesson" && !row.lessons[day]) return null
            return (
              <li key={row.id} className={cn("grid", compact
                ? "min-h-8 grid-cols-1"
                : "min-h-[3.25rem] grid-cols-[4.25rem_minmax(0,1fr)]")}>
                {!compact && (
                  <div className="flex items-center justify-center border-r border-border/65 bg-muted/35">
                    <TimeRange row={row} />
                  </div>
                )}
                {row.kind === "break" ? (
                  <BreakLabel label={row.label} className={cn("bg-muted/35", compact ? "gap-1.5 px-2.5 py-1.5 text-xs [&>svg]:size-3.5" : "px-4 py-2")} />
                ) : (
                  <span
                    className={cn("flex min-w-0 items-center font-medium [overflow-wrap:anywhere]", compact ? "px-2.5 py-1.5 text-xs" : "px-4 py-2.5 text-[15px]")}
                    style={{ backgroundColor: lessonBackground(colors, row.lessons[day]) }}
                  >{row.lessons[day]}</span>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className={cn("text-center text-muted-foreground", compact ? "px-2 py-4 text-xs" : "px-4 py-10 text-sm")}>No hay clases programadas para este día.</p>
      )}
    </div>
  )
}
