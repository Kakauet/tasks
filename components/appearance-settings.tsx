"use client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  ACCENT_PRESETS,
  BOARD_COLOR_PRESETS,
  BOARD_SECTIONS,
  BOARD_SECTION_LABELS,
  BoardColorSelections,
  BoardSection,
  DARK_MODE_PRESETS,
  DEFAULT_ACCENT_PRESET,
  DEFAULT_BOARD_COLOR_SELECTIONS,
  DEFAULT_DARK_MODE_PRESET,
  getBoardColorPreset,
} from "@/lib/appearance"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

interface AppearanceSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedAccentId: string
  selectedDarkModeId: string
  boardColorSelections: BoardColorSelections
  handleAccentPresetChange: (id: string) => void
  handleDarkModePresetChange: (id: string) => void
  handleBoardColorChange: (section: BoardSection, id: string) => void
}

export function AppearanceSettings({ open, onOpenChange, selectedAccentId, selectedDarkModeId, boardColorSelections, handleAccentPresetChange, handleDarkModePresetChange, handleBoardColorChange }: AppearanceSettingsProps) {
  const selectedAccentPreset = ACCENT_PRESETS.find(p => p.id === selectedAccentId) ?? DEFAULT_ACCENT_PRESET
  const selectedDarkModePreset = DARK_MODE_PRESETS.find(p => p.id === selectedDarkModeId) ?? DEFAULT_DARK_MODE_PRESET
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Personalizar</DialogTitle>
        <DialogDescription>Ajusta el acento, el tono del modo oscuro y los colores de los tres tableros.</DialogDescription>
      </DialogHeader>
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Acento</h3>
                <span className="text-xs text-muted-foreground">{selectedAccentPreset.name}</span>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ACCENT_PRESETS.map((preset) => {
                  const isSelected = selectedAccentId === preset.id
                  return (
                    <button
                      key={preset.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-200",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-background hover:bg-accent/50",
                      )}
                      onClick={() => handleAccentPresetChange(preset.id)}
                    >
                      <span
                        className="h-6 w-6 rounded-full border border-white/70 shadow-sm shrink-0"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">{preset.name}</div>
                        <div className="text-xs text-muted-foreground">{preset.description}</div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-border/50">
              <h3 className="text-sm font-medium">Modo oscuro</h3>
              <p className="mt-1 text-xs text-muted-foreground">Elige si quieres una base azul oscura o gris oscura.</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DARK_MODE_PRESETS.map((preset) => {
                  const isSelected = selectedDarkModeId === preset.id
                  return (
                    <button
                      key={preset.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-200",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-background hover:bg-accent/50",
                      )}
                      onClick={() => handleDarkModePresetChange(preset.id)}
                    >
                      <span
                        className="h-6 w-6 rounded-full border border-white/70 shadow-sm shrink-0"
                        style={{ backgroundColor: preset.swatchHex }}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">{preset.name}</div>
                        <div className="text-xs text-muted-foreground">{preset.description}</div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-border/50">
              <h3 className="text-sm font-medium">Colores de los tableros</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Personaliza el color de la parte superior de Por hacer, En progreso y Completadas.
              </p>
              <div className="mt-3 space-y-3">
                {BOARD_SECTIONS.map((section) => {
                  const currentPreset = getBoardColorPreset(
                    boardColorSelections[section],
                    DEFAULT_BOARD_COLOR_SELECTIONS[section],
                  )
                  return (
                    <div key={section} className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">{BOARD_SECTION_LABELS[section]}</span>
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-white/70 shadow-sm shrink-0"
                          style={{ backgroundColor: currentPreset.hex }}
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {BOARD_COLOR_PRESETS.map((preset) => {
                          const isSelected = boardColorSelections[section] === preset.id
                          return (
                            <button
                              key={`${section}-${preset.id}`}
                              className={cn(
                                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors duration-200",
                                isSelected
                                  ? "border-primary bg-primary/10"
                                  : "border-border/60 bg-background hover:bg-accent/40",
                              )}
                              onClick={() => handleBoardColorChange(section, preset.id)}
                            >
                              <span
                                className="h-3 w-3 rounded-full border border-white/70 shadow-sm shrink-0"
                                style={{ backgroundColor: preset.hex }}
                              />
                              <span className="truncate flex-1 text-left">{preset.name}</span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-border/50 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-2">
                Vista previa ({selectedAccentPreset.name}, {selectedDarkModePreset.name})
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground">
                  Botón principal
                </span>
                <span className="inline-flex h-8 items-center rounded-full bg-accent px-3 text-xs font-medium text-accent-foreground">
                  Elemento secundario
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {BOARD_SECTIONS.map((section) => {
                  const preset = getBoardColorPreset(boardColorSelections[section], DEFAULT_BOARD_COLOR_SELECTIONS[section])
                  return (
                    <div key={`preview-${section}`} className="rounded-md border border-border/50 bg-background/60 p-2">
                      <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: preset.hex }} />
                      <p className="mt-1 text-[11px] text-muted-foreground truncate">{BOARD_SECTION_LABELS[section]}</p>
                    </div>
                  )
                })}
              </div>
            </div>


      <Button onClick={() => onOpenChange(false)}>Listo</Button>
    </DialogContent>
  </Dialog>
}
