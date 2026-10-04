"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let browserClient: SupabaseClient | null = null

interface SupabaseBrowserConfig {
  url: string
  anonKey: string
}

function getSupabaseBrowserConfig(): SupabaseBrowserConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) return null
  return { url: url.replace(/\/$/, ""), anonKey }
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const config = getSupabaseBrowserConfig()
  if (!config) return null

  if (!browserClient) {
    browserClient = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  }

  return browserClient
}

export async function checkSupabaseConnection(): Promise<{ ok: boolean; error?: string }> {
  const config = getSupabaseBrowserConfig()
  if (!config) {
    return { ok: false, error: "La sincronización en la nube no está configurada." }
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.anonKey },
      signal: controller.signal,
    })

    if (!response.ok) {
      return { ok: false, error: "Supabase rechazó la configuración del proyecto." }
    }

    return { ok: true }
  } catch {
    return { ok: false, error: "No se puede conectar con el proyecto de Supabase configurado." }
  } finally {
    window.clearTimeout(timeoutId)
  }
}
