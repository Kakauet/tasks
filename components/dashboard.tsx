"use client"

import { ImportExport, type DataDialogMode } from "@/components/import-export"
import { DataSettings } from "@/components/data-settings"
import { track } from "@/lib/activity"
import { useDashboardShortcuts } from "@/hooks/use-dashboard-shortcuts"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"

import { DragDropProvider } from "@/components/dnd-provider"
import { FocusTimerProvider } from "@/components/focus-timer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/context/auth-context"
import { TaskProvider, useTaskContext } from "@/context/task-context"
import { useIsMobile } from "@/hooks/use-mobile"
import {
Calendar,
Cloud,
CloudOff,
Database,
HelpCircle,
Keyboard,
LayoutDashboard,
LogOut,
Moon,
Palette,
Redo,
Settings,
Sun,
Undo,
User
} from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "sonner"

const TaskBoard = dynamic(() => import("@/components/task-board").then((mod) => mod.TaskBoard), {
  loading: () => <BoardSkeleton />,
})

const CalendarView = dynamic(() => import("@/components/calendar-view").then((mod) => mod.CalendarView), {
  loading: () => <div className="py-8 text-sm text-muted-foreground">Cargando calendario...</div>,
})

const WelcomeDialog = dynamic(() => import("@/components/welcome-dialog").then((mod) => mod.WelcomeDialog), {
  ssr: false,
})

import { AppearanceSettings } from "@/components/appearance-settings"
import { BoardSkeleton } from "@/components/board-skeleton"
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts"
import {
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  BOARD_COLORS_STORAGE_KEY,
  BoardColorSelections,
  BoardSection,
  DARK_MODE_PRESETS,
  DARK_MODE_STORAGE_KEY,
  DEFAULT_ACCENT_PRESET,
  DEFAULT_BOARD_COLOR_SELECTIONS,
  DEFAULT_DARK_MODE_PRESET,
  applyAccentPreset,
  applyBoardColorSelections,
  applyDarkModePreset,
  getBoardColorPreset,
  normalizeBoardColorSelections,
} from "@/lib/appearance"
import { readStorage, writeStorage } from "@/lib/storage"

type ActiveView = "board" | "calendar"

export function Dashboard() {
  const [activeView, setActiveView] = useState<ActiveView>("board")
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false)

  return (
    <TaskProvider>
      <FocusTimerProvider>
        <DragDropProvider>
          <DashboardContent activeView={activeView} setActiveView={setActiveView} onOpenHelp={() => setShowWelcomeDialog(true)} />
          {showWelcomeDialog && (
            <WelcomeDialog open={showWelcomeDialog} onOpenChange={setShowWelcomeDialog} />
          )}
        </DragDropProvider>
      </FocusTimerProvider>
    </TaskProvider>
  )
}

function DashboardContent({
  activeView,
  setActiveView,
  onOpenHelp,
}: {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  onOpenHelp: () => void
}) {
  const [dataMode, setDataMode] = useState<DataDialogMode>(null)
  const [showDataSettings, setShowDataSettings] = useState(false)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  const [showAccentSettings, setShowAccentSettings] = useState(false)
  const [selectedAccentId, setSelectedAccentId] = useState(DEFAULT_ACCENT_PRESET.id)
  const [selectedDarkModeId, setSelectedDarkModeId] = useState(DEFAULT_DARK_MODE_PRESET.id)
  const [boardColorSelections, setBoardColorSelections] = useState<BoardColorSelections>(DEFAULT_BOARD_COLOR_SELECTIONS)
  const [loginEmail, setLoginEmail] = useState("")
  const [loginCode, setLoginCode] = useState("")
  const [showOtpField, setShowOtpField] = useState(false)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const isMobile = useIsMobile()
  const { canUndo, canRedo, undo, redo, tasks, events, isLoading } = useTaskContext()
  const {
    user,
    signInWithMagicLink,
    verifyEmailOtp,
    signOut,
    isSupabaseConfigured,
    cloudStatus,
    cloudError,
    retryCloudConnection,
    isLoading: isAuthLoading,
  } = useAuth()
  const { setTheme, theme } = useTheme()
  const activeTaskCount = tasks.filter((t) => t.status !== "done").length
  const eventCount = events.length
  const selectedAccentPreset = ACCENT_PRESETS.find((preset) => preset.id === selectedAccentId) ?? DEFAULT_ACCENT_PRESET
  const cloudConnected = cloudStatus === "available" && !!user

  useEffect(() => {
    const preloadSecondaryViews = () => {
      void import("@/components/calendar-view")
    }

    const timeoutId = window.setTimeout(preloadSecondaryViews, 500)
    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    const restore = () => {
      const savedAccentId = readStorage(ACCENT_STORAGE_KEY)
      const savedAccentPreset = ACCENT_PRESETS.find((preset) => preset.id === savedAccentId) ?? DEFAULT_ACCENT_PRESET
      setSelectedAccentId(savedAccentPreset.id)
      applyAccentPreset(savedAccentPreset)

      const savedDarkModeId = readStorage(DARK_MODE_STORAGE_KEY)
      const savedDarkModePreset = DARK_MODE_PRESETS.find((preset) => preset.id === savedDarkModeId) ?? DEFAULT_DARK_MODE_PRESET
      setSelectedDarkModeId(savedDarkModePreset.id)
      applyDarkModePreset(savedDarkModePreset)

      const savedBoardColors = normalizeBoardColorSelections(readStorage(BOARD_COLORS_STORAGE_KEY))
      setBoardColorSelections(savedBoardColors)
      applyBoardColorSelections(savedBoardColors)
    }
    restore()
    const restored = () => { restore(); const savedTheme=readStorage("theme"); if(savedTheme) setTheme(savedTheme) }
    window.addEventListener("taskmaster-preferences-restored",restored)
    return () => window.removeEventListener("taskmaster-preferences-restored",restored)
  }, [setTheme])

  const handleAccentPresetChange = (accentId: string) => {
    const accentPreset = ACCENT_PRESETS.find((preset) => preset.id === accentId)
    if (!accentPreset) return

    track("preference.change",{setting:"accent",value:accentPreset.id})
    setSelectedAccentId(accentPreset.id)
    writeStorage(ACCENT_STORAGE_KEY, accentPreset.id)
    applyAccentPreset(accentPreset)
  }

  const handleDarkModePresetChange = (darkModeId: string) => {
    const darkModePreset = DARK_MODE_PRESETS.find((preset) => preset.id === darkModeId)
    if (!darkModePreset) return

    track("preference.change",{setting:"darkMode",value:darkModePreset.id})
    setSelectedDarkModeId(darkModePreset.id)
    writeStorage(DARK_MODE_STORAGE_KEY, darkModePreset.id)
    applyDarkModePreset(darkModePreset)
  }

  const handleBoardColorChange = (section: BoardSection, presetId: string) => {
    const fallbackId = DEFAULT_BOARD_COLOR_SELECTIONS[section]
    const preset = getBoardColorPreset(presetId, fallbackId)

    track("preference.change",{setting:"boardColor",section,value:preset.id})
    setBoardColorSelections((previousSelections) => {
      const nextSelections: BoardColorSelections = {
        ...previousSelections,
        [section]: preset.id,
      }

      writeStorage(BOARD_COLORS_STORAGE_KEY, JSON.stringify(nextSelections))
      applyBoardColorSelections(nextSelections)
      return nextSelections
    })
  }

  const handleLoginConfirmationRequest = async () => {
    if (!isSupabaseConfigured) {
      const message = "Supabase no está configurado. Añade variables NEXT_PUBLIC_SUPABASE_*."
      setAuthMessage(message)
      toast.error(message)
      return
    }

    setAuthBusy(true)
    try {
      const { error } = await signInWithMagicLink(loginEmail)
      if (error) {
        const message = `Error: ${error}`
        setAuthMessage(message)
        toast.error("No se pudo enviar la confirmación.", { description: error })
      } else {
        const message = "Te enviamos la confirmación por email. Puedes usar el enlace o introducir el código de 6 dígitos aquí."
        setAuthMessage(message)
        toast.success("Confirmación enviada por email.")
        setLoginCode("")
        setShowOtpField(true)
      }
    } finally {
      setAuthBusy(false)
    }
  }

  const handleOtpSignIn = async () => {
    if (!isSupabaseConfigured) {
      const message = "Supabase no está configurado. Añade variables NEXT_PUBLIC_SUPABASE_*."
      setAuthMessage(message)
      toast.error(message)
      return
    }

    setAuthBusy(true)
    try {
      const { error } = await verifyEmailOtp(loginEmail, loginCode)
      if (error) {
        const message = `Error: ${error}`
        setAuthMessage(message)
        toast.error("No se pudo verificar el código.", { description: error })
      } else {
        setAuthMessage("Sesión iniciada correctamente.")
        toast.success("Sesión iniciada correctamente.")
        setLoginCode("")
        setShowOtpField(false)
        setSettingsMenuOpen(false)
      }
    } finally {
      setAuthBusy(false)
    }
  }

  const handleSignOut = async () => {
    setAuthBusy(true)
    const { error } = await signOut()
    if (error) {
      const message = `Error al cerrar sesión: ${error}`
      setAuthMessage(message)
      toast.error("Error al cerrar sesión.", { description: error })
    } else {
      setAuthMessage("Sesión cerrada. La app sigue funcionando en modo local.")
      toast.success("Sesión cerrada.")
      setShowOtpField(false)
      setLoginCode("")
    }
    setAuthBusy(false)
  }

  useDashboardShortcuts(activeView, setActiveView, () => setShowKeyboardShortcuts(true))

  const renderSettingsMenu = () => {
    return (
      <Popover open={settingsMenuOpen} onOpenChange={setSettingsMenuOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl" aria-label="Configuración">
            <Settings className="h-[18px] w-[18px]" />
            <span
              aria-hidden="true"
              className={cn(
                "absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-background",
                cloudConnected ? "bg-emerald-500" : cloudStatus === "available" ? "bg-primary" : "bg-amber-500",
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" side={isMobile ? "bottom" : undefined} sideOffset={8} aria-label="Configuración del espacio" className="w-[calc(100vw-2rem)] max-w-72 max-h-[calc(100dvh-90px)] overflow-y-auto rounded-xl p-0">
          <div className="relative py-2">
            <div data-private className="px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="text-sm font-medium text-foreground">{user?.email ?? "Modo local"}</h3>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span>{activeTaskCount} tareas activas</span>
                    <span>{eventCount} eventos</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-b border-border/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {cloudConnected ? <Cloud className="h-4 w-4 text-emerald-500" /> : cloudStatus === "available" ? <Cloud className="h-4 w-4 text-primary" /> : <CloudOff className="h-4 w-4 text-amber-500" />}
                  <h3 className="text-sm font-medium text-foreground">Sincronización</h3>
                </div>
                <Badge variant={cloudConnected ? "default" : "outline"} className="text-[10px]">
                  {cloudConnected ? "Sincronizado" : cloudStatus === "checking" ? "Comprobando" : cloudStatus === "available" ? "Sin sesión" : cloudStatus === "unavailable" ? "No disponible" : "Sin configurar"}
                </Badge>
              </div>

              {!isSupabaseConfigured && (
                <p className="text-xs text-muted-foreground">
                  Tus datos se guardan en este navegador. Puedes exportar una copia desde este menú.
                </p>
              )}

              {isSupabaseConfigured && cloudStatus === "unavailable" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{cloudError}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-full bg-transparent text-xs"
                    onClick={(event) => {
                      event.stopPropagation()
                      void retryCloudConnection()
                    }}
                  >
                    Reintentar conexión
                  </Button>
                </div>
              )}

              {isSupabaseConfigured && cloudStatus === "available" && !user && (
                <div className="space-y-2">
                  <Input
                    type="email"
                    aria-label="Correo electrónico"
                    placeholder="tu@email.com"
                    value={loginEmail}
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    enterKeyHint="send"
                    onChange={(e) => {
                      setLoginEmail(e.target.value)
                      setShowOtpField(false)
                      setLoginCode("")
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleLoginConfirmationRequest()
                      }
                    }}
                    className="h-9 text-base md:h-8 md:text-sm"
                  />
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLoginConfirmationRequest()
                      }}
                      disabled={authBusy || isAuthLoading}
                    >
                      {authBusy ? "Enviando…" : "Enviar confirmación"}
                    </Button>
                  </div>
                  {showOtpField && (
                    <>
                      <Input
                        type="text"
                        aria-label="Código de verificación"
                        placeholder="Código de 6 dígitos"
                        value={loginCode}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoCorrect="off"
                        onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            if (loginEmail.trim() && loginCode.trim()) {
                              handleOtpSignIn()
                            }
                          }
                        }}
                        className="h-9 text-base md:h-8 md:text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 text-xs bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOtpSignIn()
                        }}
                        disabled={authBusy || isAuthLoading || !loginEmail.trim() || !loginCode.trim()}
                      >
                        Verificar código
                      </Button>
                    </>
                  )}
                </div>
              )}

              {isSupabaseConfigured && user && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSignOut()
                  }}
                  disabled={authBusy || isAuthLoading}
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Cerrar sesión
                </Button>
              )}

              {authMessage && <p className="text-xs text-muted-foreground mt-2">{authMessage}</p>}
            </div>

            {isMobile && (
              <div className="py-1 border-b border-border/50">
                <button
                  className="flex w-full items-center px-4 py-3 text-sm text-foreground hover:bg-accent/50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={(e) => {
                    e.stopPropagation()
                    undo()
                    setSettingsMenuOpen(false)
                  }}
                  disabled={!canUndo}
                >
                  <Undo className="mr-3 h-4 w-4" />
                  <div className="flex-1 text-left">
                    <div>Deshacer</div>
                    <div className="text-xs text-muted-foreground">Revierte el último cambio</div>
                  </div>
                </button>

                <button
                  className="flex w-full items-center px-4 py-3 text-sm text-foreground hover:bg-accent/50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={(e) => {
                    e.stopPropagation()
                    redo()
                    setSettingsMenuOpen(false)
                  }}
                  disabled={!canRedo}
                >
                  <Redo className="mr-3 h-4 w-4" />
                  <div className="flex-1 text-left">
                    <div>Rehacer</div>
                    <div className="text-xs text-muted-foreground">Vuelve a aplicar el cambio</div>
                  </div>
                </button>
              </div>
            )}

            <div className="px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-3 mb-3">
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 ml-3" />
                <h3 className="text-sm font-medium text-foreground ml-1">Tema</h3>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors duration-200",
                    theme === "light"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent/50 text-muted-foreground",
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    track("preference.change",{setting:"theme",value:"light"})
                    setTheme("light")
                  }}
                >
                  <Sun className="h-3 w-3" />
                  <span>Claro</span>
                </button>
                <button
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors duration-200",
                    theme === "dark"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent/50 text-muted-foreground",
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    track("preference.change",{setting:"theme",value:"dark"})
                    setTheme("dark")
                  }}
                >
                  <Moon className="h-3 w-3" />
                  <span>Oscuro</span>
                </button>
                <button
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors duration-200",
                    theme === "system"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent/50 text-muted-foreground",
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    track("preference.change",{setting:"theme",value:"system"})
                    setTheme("system")
                  }}
                >
                  <svg
                    className="h-3 w-3"
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                  <span>Sistema</span>
                </button>
              </div>
            </div>

            <div className="py-1">
              <button
                className="flex w-full items-center px-4 py-3 text-sm text-foreground transition-colors duration-200 hover:bg-accent/50"
                onClick={(e) => {
                  e.stopPropagation()
                  setSettingsMenuOpen(false)
                  onOpenHelp()
                }}
              >
                <HelpCircle className="mr-3 h-4 w-4" />
                <div className="flex-1 text-left">
                  <div>Guía rápida</div>
                  <div className="text-xs text-muted-foreground">Consejos para tareas y calendario</div>
                </div>
              </button>
              <button
                className="flex w-full items-center px-4 py-3 text-sm text-foreground hover:bg-accent/50 transition-colors duration-200"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDataSettings(true)
                  setSettingsMenuOpen(false)
                }}
              >
                <Database className="mr-3 h-4 w-4" />
                <div className="flex-1 text-left">
                  <div>Datos y almacenamiento</div>
                  <div className="text-xs text-muted-foreground">Resumen, espacio, importar y exportar</div>
                </div>
              </button>

              <button
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-accent/50 transition-colors duration-200"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowAccentSettings(true)
                  setSettingsMenuOpen(false)
                }}
              >
                <Palette className="mr-1 h-4 w-4" />
                <div className="flex-1 text-left">
                  <div>Personalizar</div>
                  <div className="text-xs text-muted-foreground">Acento, modo oscuro y tableros</div>
                </div>
                <span
                  className="h-2.5 w-2.5 rounded-full border border-white/70 shadow-sm shrink-0"
                  style={{ backgroundColor: selectedAccentPreset.hex }}
                />
              </button>

              {!isMobile && (
                <button
                  className="flex w-full items-center px-4 py-3 text-sm text-foreground hover:bg-accent/50 transition-colors duration-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowKeyboardShortcuts(true)
                    setSettingsMenuOpen(false)
                  }}
                >
                  <Keyboard className="mr-3 h-4 w-4" />
                  <div className="flex-1 text-left">
                    <div>Atajos de teclado</div>
                    <div className="text-xs text-muted-foreground">Ver todos los atajos</div>
                  </div>
                </button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className="app-viewport flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="sticky top-0 z-40 w-full shrink-0 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="workspace-container">
          <div className="relative flex items-center justify-between gap-2 py-2 sm:py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">Saltar al contenido</a>
            <nav
              className="relative flex min-w-0 max-w-[260px] flex-1 items-center gap-0.5 overflow-hidden rounded-xl border border-border/60 bg-muted/70 p-1 sm:max-w-none sm:gap-1 md:flex-none md:max-w-none"
              role="tablist"
              aria-label="Vistas del espacio de trabajo"
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
                event.preventDefault()
                const next = event.key === "Home" ? "board" : event.key === "End" ? "calendar" : activeView === "board" ? "calendar" : "board"
                setActiveView(next)
                document.getElementById(`${next}-tab`)?.focus()
              }}
            >


              <button
                id="board-tab"
                tabIndex={activeView === "board" ? 0 : -1}
                onClick={() => setActiveView("board")}
                className={cn(
                  "relative z-10 flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors duration-150 sm:h-auto sm:gap-0 sm:px-4 sm:py-1.5 sm:text-toolbar-label",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  activeView === "board"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card/55 hover:text-foreground",
                )}
                role="tab"
                aria-selected={activeView === "board"}
                aria-controls="board-panel"
              >
                <LayoutDashboard className="h-4 w-4 shrink-0 sm:mr-2" />
                <span className="whitespace-nowrap">Tablero</span>
              </button>

              <button
                id="calendar-tab"
                tabIndex={activeView === "calendar" ? 0 : -1}
                onClick={() => setActiveView("calendar")}
                className={cn(
                  "relative z-10 flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors duration-150 sm:h-auto sm:gap-0 sm:px-4 sm:py-1.5 sm:text-toolbar-label",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  activeView === "calendar"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card/55 hover:text-foreground",
                )}
                role="tab"
                aria-selected={activeView === "calendar"}
                aria-controls="calendar-panel"
              >
                <Calendar className="h-4 w-4 shrink-0 sm:mr-2" />
                <span className="whitespace-nowrap">Calendario</span>
              </button>

            </nav>


            </div>

            <div className="flex shrink-0 items-center gap-1 sm:ml-2 sm:gap-2">
              {!isMobile && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={undo}
                          disabled={!canUndo}
                          className="rounded-lg hover:bg-accent/50 transition-all duration-200 disabled:opacity-50"
                          aria-label="Deshacer última acción"
                        >
                          <Undo className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Deshacer (Ctrl+Z)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={redo}
                          disabled={!canRedo}
                          className="rounded-lg hover:bg-accent/50 transition-all duration-200 disabled:opacity-50"
                          aria-label="Rehacer última acción"
                        >
                          <Redo className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Rehacer (Ctrl+Y)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}

              {renderSettingsMenu()}
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="workspace-container min-h-0 flex-1 overflow-y-auto py-3 outline-none sm:py-5">
        <div id="board-panel" className="h-full min-h-0" role="tabpanel" aria-labelledby="board-tab" hidden={activeView !== "board"}>
          {activeView === "board" && (isLoading ? <BoardSkeleton /> : <TaskBoard />)}
        </div>
        <div id="calendar-panel" role="tabpanel" aria-labelledby="calendar-tab" hidden={activeView !== "calendar"}>
          {activeView === "calendar" && (isLoading ? <BoardSkeleton /> : <CalendarView />)}
        </div>
      </main>

      <ImportExport mode={dataMode} onModeChange={setDataMode} hideButtons />
      <DataSettings open={showDataSettings} onOpenChange={setShowDataSettings} onExport={() => setDataMode("export")} onImport={() => setDataMode("import")} />
      <AppearanceSettings open={showAccentSettings} onOpenChange={setShowAccentSettings} selectedAccentId={selectedAccentId} selectedDarkModeId={selectedDarkModeId} boardColorSelections={boardColorSelections} handleAccentPresetChange={handleAccentPresetChange} handleDarkModePresetChange={handleDarkModePresetChange} handleBoardColorChange={handleBoardColorChange} />

      <KeyboardShortcuts open={showKeyboardShortcuts} onOpenChange={setShowKeyboardShortcuts} />
    </div>
  )
}
