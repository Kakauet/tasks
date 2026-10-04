"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { LinkifiedText } from "@/components/ui/linkified-text"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { TaskStep } from "@/context/task-context"
import { cn } from "@/lib/utils"
import { ArrowDown, ArrowUp, Check, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useDrag, useDrop } from "react-dnd"

interface DraggableStepProps {
  step: TaskStep
  index: number
  totalSteps: number
  moveStep: (dragIndex: number, hoverIndex: number) => void
  toggleStep: (id: string) => void
  deleteStep: (id: string) => void
  updateStepText: (id: string, text: string) => void
}

export const DraggableStep = memo(function DraggableStep({ step, index, totalSteps, moveStep, toggleStep, deleteStep, updateStepText }: DraggableStepProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(step.text)
  const [menuOpen, setMenuOpen] = useState(false)
  const blockedDrag = useRef(false)
  const editResolved = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const startEditing = () => {
    editResolved.current = false
    setEditText(step.text)
    setIsEditing(true)
  }
  const finishEditing = (save: boolean, restoreFocus = true) => {
    if (editResolved.current) return
    editResolved.current = true
    if (save && editText.trim() && editText.trim() !== step.text) updateStepText(step.id, editText.trim())
    setIsEditing(false)
    if (restoreFocus) editButtonRef.current?.focus()
  }

  const [{ isDragging }, drag] = useDrag(() => ({
    type: "STEP",
    canDrag: () => !isEditing && !blockedDrag.current,
    item: { index, id: step.id },
    collect: monitor => ({ isDragging: monitor.isDragging() }),
  }), [index, step.id, isEditing])
  const [{ isOver }, drop] = useDrop<{ index: number; id: string }, void, { isOver: boolean }>(() => ({
    accept: "STEP",
    canDrop: item => item.id !== step.id,
    drop: item => { if (item.index !== index) moveStep(item.index, index) },
    collect: monitor => ({ isOver: monitor.isOver() && monitor.canDrop() }),
  }), [index, step.id, moveStep])
  const setNode = useCallback((node: HTMLDivElement | null) => { drag(drop(node)) }, [drag, drop])
  const markDragOrigin = (target: EventTarget | null) => {
    blockedDrag.current = target instanceof Element && !!target.closest('button, a, textarea, input, [role="checkbox"]')
  }

  return (
    <div ref={setNode} role="listitem" className={cn(
      "group flex min-w-0 items-start gap-2 px-3 py-2.5 transition-colors hover:bg-muted/20",
      isDragging && "opacity-40",
      isOver && "bg-primary/5 ring-1 ring-inset ring-primary/60",
    )}
      onPointerDownCapture={event => markDragOrigin(event.target)}
      onMouseDownCapture={event => markDragOrigin(event.target)}
      onTouchStartCapture={event => markDragOrigin(event.target)}
      onDragStartCapture={event => { if (blockedDrag.current) event.preventDefault() }}
    >
      <div className="flex h-8 w-6 shrink-0 items-center justify-center">
        <Checkbox checked={step.completed} onCheckedChange={() => toggleStep(step.id)} aria-label={`Completar paso: ${step.text}`} />
      </div>
      {isEditing ? (
        <textarea data-step-editor ref={inputRef} value={editText} rows={2} aria-label="Texto del paso"
          onChange={event => setEditText(event.target.value)}
          onBlur={() => finishEditing(true, false)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.stopPropagation()
              finishEditing(true)
            } else if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              finishEditing(false)
            }
          }}
          className="min-w-0 flex-1 resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-6"
        />
      ) : (
        <div
          className="min-w-0 flex-1 cursor-text"
          title="Doble clic para editar el paso"
          onDoubleClick={event => {
            if (event.target instanceof Element && event.target.closest("a")) return
            startEditing()
          }}
        >
          <LinkifiedText as="div" text={step.text} className={cn("whitespace-pre-wrap py-1 text-sm leading-6", step.completed && "text-muted-foreground line-through")} />
        </div>
      )}
      <div className="flex shrink-0 items-center">
        <Button ref={editButtonRef} type="button" variant="ghost" size="icon"
          aria-label={isEditing ? "Guardar paso" : `Editar paso: ${step.text}`}
          onMouseDown={event => { if (isEditing) event.preventDefault() }}
          onClick={() => isEditing ? finishEditing(true) : startEditing()}
          className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground">
          {isEditing ? <Check /> : <Pencil />}
        </Button>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Opciones del paso: ${step.text}`} className="h-8 w-8 rounded-md text-muted-foreground"><MoreHorizontal /></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-48 space-y-1 rounded-lg p-1">
            <Button type="button" variant="ghost" disabled={index === 0} className="w-full justify-start" onClick={() => { moveStep(index, index - 1); setMenuOpen(false) }}><ArrowUp /> Subir</Button>
            <Button type="button" variant="ghost" disabled={index === totalSteps - 1} className="w-full justify-start" onClick={() => { moveStep(index, index + 1); setMenuOpen(false) }}><ArrowDown /> Bajar</Button>
            <Button type="button" variant="ghost" className="w-full justify-start hover:bg-transparent" onClick={() => deleteStep(step.id)}><Trash2 className="text-[hsl(var(--status-danger))]" /> Eliminar paso</Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
})
