"use client"

import { checkSupabaseConnection, getSupabaseBrowserClient } from "@/lib/supabase-browser"
import type { Session, SupabaseClient, User } from "@supabase/supabase-js"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  isSupabaseConfigured: boolean
  cloudStatus: "unconfigured" | "checking" | "available" | "unavailable"
  cloudError: string | null
  supabase: SupabaseClient | null
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>
  verifyEmailOtp: (email: string, token: string) => Promise<{ error?: string }>
  signOut: () => Promise<{ error?: string }>
  retryCloudConnection: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), [])
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [cloudStatus, setCloudStatus] = useState<AuthContextType["cloudStatus"]>(supabase ? "checking" : "unconfigured")
  const [cloudError, setCloudError] = useState<string | null>(null)

  const retryCloudConnection = useCallback(async () => {
    if (!supabase) {
      setCloudStatus("unconfigured")
      setCloudError("La sincronización en la nube no está configurada.")
      return false
    }

    setCloudStatus("checking")
    setCloudError(null)
    const result = await checkSupabaseConnection()
    setCloudStatus(result.ok ? "available" : "unavailable")
    setCloudError(result.error ?? null)
    return result.ok
  }, [supabase])

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false)
      return
    }

    let isMounted = true
    // Local data should render immediately; restoring auth can complete in the
    // background and will trigger cloud hydration if a session exists.
    setIsLoading(false)

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error
        if (isMounted) setSession(data.session ?? null)
      })
      .catch((error: unknown) => {
        console.error("Error restoring authentication session:", error)
        if (isMounted) setSession(null)
      })

    // Connection health is independent from restoring the cached session, so
    // an unavailable cloud never delays the local-first experience.
    void retryCloudConnection()

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [supabase, retryCloudConnection])

  const signInWithMagicLink = useCallback(
    async (email: string) => {
      if (!supabase) {
        return { error: "Supabase no está configurado." }
      }

      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail) {
        return { error: "Debes escribir un email válido." }
      }

      const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined

      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: { emailRedirectTo: redirectTo },
        })

        if (error) return { error: error.message }

        return {}
      } catch {
        setCloudStatus("unavailable")
        const error = "No se ha podido conectar con la nube. Revisa la configuración de Supabase."
        setCloudError(error)
        return { error }
      }
    },
    [supabase],
  )

  const signOut = useCallback(async () => {
    if (!supabase) {
      return { error: "Supabase no está configurado." }
    }

    const { error } = await supabase.auth.signOut()
    if (error) {
      return { error: error.message }
    }

    return {}
  }, [supabase])

  const verifyEmailOtp = useCallback(
    async (email: string, token: string) => {
      if (!supabase) {
        return { error: "Supabase no está configurado." }
      }

      const normalizedEmail = email.trim().toLowerCase()
      const normalizedToken = token.trim().replace(/\s+/g, "")

      if (!normalizedEmail) {
        return { error: "Debes escribir un email válido." }
      }

      if (!normalizedToken) {
        return { error: "Debes escribir el código de verificación." }
      }

      try {
        const { error } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token: normalizedToken,
          type: "email",
        })

        if (error) return { error: error.message }

        return {}
      } catch {
        setCloudStatus("unavailable")
        const error = "No se ha podido verificar el código porque la nube no responde."
        setCloudError(error)
        return { error }
      }
    },
    [supabase],
  )

  const value: AuthContextType = {
    user: session?.user ?? null,
    session,
    isLoading,
    isSupabaseConfigured: !!supabase,
    cloudStatus,
    cloudError,
    supabase,
    signInWithMagicLink,
    verifyEmailOtp,
    signOut,
    retryCloudConnection,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
