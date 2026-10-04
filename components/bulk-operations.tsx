"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTaskContext } from "@/context/task-context"
import { useDialogState } from "@/hooks/use-dialog-state"
import { CheckCircle, Circle, Clock, Tag, Trash2 } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

interface BulkOperationsProps {
  tasks: Array<{
    id: string
    title: string
    status: "todo" | "inProgress" | "done"
    tags: string[]
  }>
  selectedTasks: string[]
  onSelectionChange: (taskIds: string[]) => void
  onOperationComplete?: () => void
}

export function BulkOperations({ tasks, selectedTasks, onSelectionChange, onOperationComplete }: BulkOperationsProps) {
  const { bulkUpdateTasks, bulkDeleteTasks, undo, tags } = useTaskContext()
  const [bulkAction, setBulkAction] = useState<string>("")
  const [selectedTag, setSelectedTag] = useState<string>("")
  const deleteDialog = useDialogState()

  const handleSelectAll = useCallback(() => {
    if (selectedTasks.length === tasks.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(tasks.map((task) => task.id))
    }
  }, [tasks, selectedTasks, onSelectionChange])

  const handleBulkStatusChange = useCallback(
    (newStatus: "todo" | "inProgress" | "done") => {
      bulkUpdateTasks(
        selectedTasks.map((taskId) => ({
          id: taskId,
          updates: { status: newStatus },
        })),
      )
      onSelectionChange([])
      onOperationComplete?.()
    },
    [selectedTasks, bulkUpdateTasks, onSelectionChange, onOperationComplete],
  )

  const handleBulkTagOperation = useCallback(
    (operation: "add" | "remove", tagId: string) => {
      const updates = tasks
        .filter((task) => selectedTasks.includes(task.id))
        .map((task) => {
          const nextTags =
            operation === "add" ? Array.from(new Set([...task.tags, tagId])) : task.tags.filter((id) => id !== tagId)
          return { id: task.id, updates: { tags: nextTags } }
        })

      bulkUpdateTasks(updates)
      onSelectionChange([])
      onOperationComplete?.()
    },
    [tasks, selectedTasks, bulkUpdateTasks, onSelectionChange, onOperationComplete],
  )

  const handleBulkDelete = useCallback(() => {
    deleteDialog.startProcessing()
    try {
      bulkDeleteTasks(selectedTasks)
      toast.success(`${selectedTasks.length} tarea${selectedTasks.length > 1 ? "s" : ""} eliminada${selectedTasks.length > 1 ? "s" : ""}.`, {
        action: { label: "Deshacer", onClick: undo }, duration: 8000,
      })
      onSelectionChange([])
      onOperationComplete?.()
    } finally {
      deleteDialog.endProcessing()
    }
  }, [selectedTasks, bulkDeleteTasks, undo, onSelectionChange, onOperationComplete, deleteDialog])

  const executeBulkAction = useCallback(() => {
    if (!bulkAction) return

    const [action, value] = bulkAction.split(":")

    switch (action) {
      case "status":
        handleBulkStatusChange(value as "todo" | "inProgress" | "done")
        break
      case "addTag":
        if (selectedTag) {
          handleBulkTagOperation("add", selectedTag)
          setSelectedTag("")
        }
        break
      case "removeTag":
        if (selectedTag) {
          handleBulkTagOperation("remove", selectedTag)
          setSelectedTag("")
        }
        break
      case "delete":
        deleteDialog.open()
        break
    }
    setBulkAction("")
  }, [bulkAction, selectedTag, handleBulkStatusChange, handleBulkTagOperation, deleteDialog])

  if (tasks.length === 0) return null

  const isAllSelected = selectedTasks.length === tasks.length
  const isPartiallySelected = selectedTasks.length > 0 && selectedTasks.length < tasks.length

  return (
    <div className="glass max-h-[28dvh] shrink-0 overflow-y-auto rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox
            aria-label="Seleccionar todas las tareas visibles"
            checked={isPartiallySelected ? "indeterminate" : isAllSelected}
            onCheckedChange={handleSelectAll}
            className="data-[state=checked]:bg-primary"
          />
          <span className="text-sm font-medium">
            {selectedTasks.length === 0
              ? "Seleccionar todo"
              : `${selectedTasks.length} tarea${selectedTasks.length > 1 ? "s" : ""} seleccionada${selectedTasks.length > 1 ? "s" : ""}`}
          </span>
        </div>

        {selectedTasks.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {selectedTasks.length} / {tasks.length}
          </Badge>
        )}
      </div>

      {selectedTasks.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={bulkAction} onValueChange={setBulkAction}>
            <SelectTrigger className="w-[200px] glass-input">
              <SelectValue placeholder="Seleccionar acción" />
            </SelectTrigger>
            <SelectContent className="glass">
              <SelectItem value="status:todo">
                <div className="flex items-center gap-2">
                  <Circle className="h-4 w-4" />
                  Marcar como pendiente
                </div>
              </SelectItem>
              <SelectItem value="status:inProgress">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Marcar en progreso
                </div>
              </SelectItem>
              <SelectItem value="status:done">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Marcar como completada
                </div>
              </SelectItem>
              <SelectItem value="addTag">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Añadir etiqueta
                </div>
              </SelectItem>
              <SelectItem value="removeTag">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Quitar etiqueta
                </div>
              </SelectItem>
              <SelectItem value="delete">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-[hsl(var(--status-danger))]" />
                  Eliminar tareas
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {(bulkAction === "addTag" || bulkAction === "removeTag") && (
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="w-[150px] glass-input">
                <SelectValue placeholder="Seleccionar etiqueta" />
              </SelectTrigger>
              <SelectContent className="glass">
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="primary"
            onClick={executeBulkAction}
            disabled={!bulkAction || ((bulkAction === "addTag" || bulkAction === "removeTag") && !selectedTag)}
            className="rounded-full"
          >
            Ejecutar
          </Button>

          <Button variant="outline" onClick={() => onSelectionChange([])} className="rounded-full">
            Cancelar
          </Button>
        </div>
      )}

      <ConfirmationDialog
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.setIsOpen}
        title="¿Eliminar tareas seleccionadas?"
        description={`Se eliminará${selectedTasks.length > 1 ? "n" : ""} ${selectedTasks.length} tarea${selectedTasks.length > 1 ? "s" : ""}. Podrás deshacerlo justo después.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={handleBulkDelete}
        isProcessing={deleteDialog.isProcessing}
        variant="destructive"
      />
    </div>
  )
}
