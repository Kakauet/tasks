"use client"

import { X } from "lucide-react"
import { useRef, useState } from "react"
import { cleanAliases } from "@/lib/tasks/model"
import { cn } from "@/lib/utils"

interface AliasInputProps {
  id: string
  /** Nombre accesible del campo: no lleva etiqueta visible. */
  label: string
  value: string[]
  onChange: (aliases: string[]) => void
  /** Escape cierra la edición entera, no solo el campo. */
  onCancel?: () => void
  className?: string
}

/**
 * Apodos como fichas: Intro o coma añaden lo escrito, Retroceso en vacío quita el último.
 * Lo que quede escrito al salir del campo también se añade, para que «Guardar» no lo pierda.
 */
export function AliasInput({ id, label, value, onChange, onCancel, className }: AliasInputProps) {
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = (text = draft) => {
    setDraft("")
    // Repetidos (aunque cambien tildes o mayúsculas) y vacíos se descartan.
    const next = cleanAliases([...value, ...text.split(",")], "") ?? []
    if (next.length !== value.length) onChange(next)
  }

  return (
    <div
      className={cn(
        "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background/65 px-2 py-1 shadow-sm shadow-black/[0.015] transition-[border-color,box-shadow,background-color] duration-150 focus-within:border-primary/65 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/15",
        className,
      )}
      onClick={() => inputRef.current?.focus()}
      title="Otros nombres con los que la escribes: los títulos que los lleven también se asignan a esta asignatura."
    >
      {value.map((alias) => (
        <span key={alias} className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-muted pl-2 pr-0.5 text-xs text-foreground">
          <span className="truncate">{alias}</span>
          <button
            type="button"
            aria-label={`Quitar el apodo ${alias}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              event.stopPropagation()
              onChange(value.filter((item) => item !== alias))
              inputRef.current?.focus()
            }}
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        aria-label={label}
        value={draft}
        autoComplete="off"
        placeholder={value.length ? "Otro apodo…" : "Apodos (opcional)"}
        className="h-7 min-w-[7rem] flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground/80 md:text-sm"
        onChange={(event) => {
          const text = event.target.value
          // Una coma escrita o pegada cierra en el momento lo que va delante; lo de detrás sigue escribiéndose.
          const cut = text.lastIndexOf(",")
          if (cut === -1) return setDraft(text)
          commit(text.slice(0, cut))
          setDraft(text.slice(cut + 1).trimStart())
        }}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
          } else if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1))
          } else if (event.key === "Escape" && onCancel) {
            event.preventDefault()
            event.stopPropagation()
            onCancel()
          }
        }}
      />
    </div>
  )
}
