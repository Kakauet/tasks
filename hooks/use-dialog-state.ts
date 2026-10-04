"use client"

import { useCallback, useState } from "react"
import { useErrorHandler } from "./use-error-handler"

/**
 * Hook personalizado para manejar el estado de diálogos con manejo de errores mejorado
 * @param initialState Estado inicial del diálogo (abierto o cerrado)
 * @returns Funciones y estado para controlar un diálogo
 */
export function useDialogState(initialState = false) {
  const [isOpen, setIsOpen] = useState(initialState)
  const [isProcessing, setIsProcessing] = useState(false)
  const { handleError, clearError } = useErrorHandler()

  const open = useCallback(() => {
    clearError()
    setIsOpen(true)
  }, [clearError])

  const close = useCallback(() => {
    if (!isProcessing) {
      clearError()
      setIsOpen(false)
    }
  }, [isProcessing, clearError])

  const startProcessing = useCallback(() => {
    clearError()
    setIsProcessing(true)
  }, [clearError])

  const endProcessing = useCallback(() => {
    setIsProcessing(false)
    setIsOpen(false)
    clearError()
  }, [clearError])

  const endProcessingWithError = useCallback(
    (error: unknown, context?: string) => {
      handleError(error, context)
      setIsProcessing(false)
      // Keep dialog open so user can see the error and retry
    },
    [handleError],
  )

  const withProcessing = useCallback(
    async <T,>(operation: () => Promise<T>, context?: string): Promise<T | null> => {
      startProcessing()
      try {
        const result = await operation()
        endProcessing()
        return result
      } catch (error) {
        endProcessingWithError(error, context)
        return null
      }
    },
    [startProcessing, endProcessing, endProcessingWithError],
  )

  return {
    isOpen,
    setIsOpen,
    open,
    close,
    isProcessing,
    startProcessing,
    endProcessing,
    endProcessingWithError,
    withProcessing,
  }
}
