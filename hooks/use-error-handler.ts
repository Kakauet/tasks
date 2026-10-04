"use client"

import { AppError, ErrorCodes } from "@/lib/utils"
import { useCallback, useState } from "react"
import { toast } from "sonner"

interface ErrorState {
  error: AppError | null
  isError: boolean
  errorMessage: string
}

interface ErrorHandlerOptions {
  showToast?: boolean
  logError?: boolean
  fallbackMessage?: string
}

export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const { showToast = true, logError = true, fallbackMessage = "Ha ocurrido un error inesperado" } = options

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
    errorMessage: "",
  })

  const handleError = useCallback(
    (error: unknown, context?: string) => {
      let appError: AppError

      if (error instanceof AppError) {
        appError = error
      } else if (error instanceof Error) {
        appError = new AppError(error.message || fallbackMessage, ErrorCodes.VALIDATION_ERROR, {
          originalError: error.message,
          context,
        })
      } else {
        appError = new AppError(fallbackMessage, ErrorCodes.VALIDATION_ERROR, { originalError: String(error), context })
      }

      if (logError) {
        console.error(`[Error Handler] ${context || "Unknown context"}:`, {
          message: appError.message,
          code: appError.code,
          context: appError.context,
          stack: appError.stack,
        })
      }

      setErrorState({
        error: appError,
        isError: true,
        errorMessage: appError.message,
      })

      if (showToast) {
        const toastTitle = context || "Ha ocurrido un error"
        const toastOptions = context ? { description: appError.message } : undefined
        toast.error(toastTitle, toastOptions)
      }

      return appError
    },
    [logError, showToast, fallbackMessage],
  )

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
      errorMessage: "",
    })
  }, [])

  const withErrorHandling = useCallback(
    <T extends unknown[], R>(fn: (...args: T) => R, context?: string) => {
      return (...args: T): R | null => {
        try {
          return fn(...args)
        } catch (error) {
          handleError(error, context)
          return null
        }
      }
    },
    [handleError],
  )

  const withAsyncErrorHandling = useCallback(
    <T extends unknown[], R>(fn: (...args: T) => Promise<R>, context?: string) => {
      return async (...args: T): Promise<R | null> => {
        try {
          return await fn(...args)
        } catch (error) {
          handleError(error, context)
          return null
        }
      }
    },
    [handleError],
  )

  return {
    ...errorState,
    handleError,
    clearError,
    withErrorHandling,
    withAsyncErrorHandling,
  }
}
