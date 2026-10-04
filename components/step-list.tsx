"use client"

import { DraggableStep } from "@/components/draggable-step"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TaskStep } from "@/context/task-context"
import { Plus } from "lucide-react"
import { memo, useCallback, useRef } from "react"

interface StepListProps {
  steps: TaskStep[]
  onStepsChange: (steps: TaskStep[]) => void
  onToggleStep: (id: string) => void
  onDeleteStep: (id: string) => void
  onAddStep: (text: string) => void
  onUpdateStepText: (id: string, text: string) => void
  draftStep: string
  onDraftStepChange: (text: string) => void
}

export const StepList = memo(function StepList({
  steps,
  onStepsChange,
  onToggleStep,
  onDeleteStep,
  onAddStep,
  onUpdateStepText,
  draftStep,
  onDraftStepChange,
}: StepListProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const moveStep = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const draggedStep = steps[dragIndex]
      const newSteps = [...steps]
      newSteps.splice(dragIndex, 1)
      newSteps.splice(hoverIndex, 0, draggedStep)
      onStepsChange(newSteps)
    },
    [steps, onStepsChange],
  )

  const handleAddStep = useCallback((restoreFocus = false) => {
    const normalizedStep = draftStep.trim()
    if (normalizedStep) {
      onAddStep(normalizedStep)
      onDraftStepChange("")
      if (restoreFocus) requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [draftStep, onAddStep, onDraftStepChange])

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border/70">
      {steps.length > 0 && (
        <div role="list" aria-label="Pasos de la tarea" className="divide-y divide-border/50">
          {steps.map((step, index) => (
            <DraggableStep
              key={step.id}
              step={step}
              index={index}
              totalSteps={steps.length}
              moveStep={moveStep}
              toggleStep={onToggleStep}
              deleteStep={onDeleteStep}
              updateStepText={onUpdateStepText}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-border/50 bg-muted/15 p-2 first:border-t-0">
        <Input
          ref={inputRef}
          aria-label="Nuevo paso"
          value={draftStep}
          onChange={(e) => onDraftStepChange(e.target.value)}
          onBlur={() => handleAddStep(false)}
          placeholder="Añadir paso…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              handleAddStep(true)
            }
          }}
          className="min-w-0 flex-1 border-transparent bg-transparent shadow-none focus-visible:ring-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Añadir paso"
          onClick={() => handleAddStep(true)}
          disabled={!draftStep.trim()}
          className="shrink-0 rounded-lg"
        >
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">Añadir</span>
        </Button>
      </div>
    </div>
  )
})
