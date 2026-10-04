"use client"

import {
AlertDialog,
AlertDialogAction,
AlertDialogCancel,
AlertDialogContent,
AlertDialogDescription,
AlertDialogFooter,
AlertDialogHeader,
AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Trash2 } from "lucide-react"

interface ConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  isProcessing?: boolean
  variant?: "destructive" | "default"
}

/**
 * Componente reutilizable para diálogos de confirmación
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  isProcessing = false,
  variant = "default",
}: ConfirmationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(newOpen) => !isProcessing && onOpenChange(newOpen)}>
      <AlertDialogContent className="glass interactive-after-delete">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={variant === "destructive" ? "bg-transparent text-foreground shadow-none hover:bg-transparent" : ""}
            disabled={isProcessing}
          >
            {variant === "destructive" && <Trash2 className="h-4 w-4 text-[hsl(var(--status-danger))]" />}
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
