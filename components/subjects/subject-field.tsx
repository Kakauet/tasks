"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTaskContext } from "@/context/task-context"
import { useSubjectScope } from "@/context/subject-scope"

const NONE = "none"

interface SubjectFieldProps {
  id: string
  value?: string
  onChange: (subjectId: string | undefined) => void
  /** Nota breve bajo el campo, por ejemplo cuando se ha elegido sola. */
  hint?: string
}

/** Campo «Asignatura» de los diálogos. No aparece si la función está apagada. */
export function SubjectField({ id, value, onChange, hint }: SubjectFieldProps) {
  const { enabled } = useSubjectScope()
  const { subjects } = useTaskContext()
  if (!enabled) return null

  // Una asignatura archivada sigue visible mientras sea la actual del elemento.
  const options = subjects.filter((subject) => !subject.archived || subject.id === value)
  const current = options.some((subject) => subject.id === value) ? value : undefined

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Asignatura</Label>
      <Select value={current ?? NONE} onValueChange={(next) => onChange(next === NONE ? undefined : next)}>
        <SelectTrigger id={id} className="glass-input">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="glass">
          <SelectItem value={NONE}>Sin asignatura</SelectItem>
          {options.map((subject) => (
            <SelectItem key={subject.id} value={subject.id}>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
                {subject.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
