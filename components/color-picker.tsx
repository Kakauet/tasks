"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Check, Palette, X } from "lucide-react"
import { useRef, useState } from "react"

interface ColorPickerProps {
  selectedColor: string
  onColorChange: (color: string) => void
  customColors: string[]
  setCustomColors: (colors: string[]) => void
}

// Función para guardar colores personalizados en localStorage
const saveCustomColors = (colors: string[]) => {
  try {
    localStorage.setItem("custom-event-colors", JSON.stringify(colors))
  } catch (error) {
    console.error("Error saving custom colors:", error)
  }
}

// Modify the color picker to prevent event propagation issues
export function ColorPicker({ selectedColor, onColorChange, customColors, setCustomColors }: ColorPickerProps) {
  const [newColor, setNewColor] = useState("#3b82f6")
  const colorInputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Add handlers to prevent propagation
  const handlePopoverClick = (e: React.MouseEvent) => {
    // Prevent clicks in the popover from bubbling up to parent elements
    e.stopPropagation()
  }

  // Color selection should also stop propagation
  const handleColorSelect = (color: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    onColorChange(color)
  }

  // Colores predefinidos
  const predefinedColors = [
    "#3b82f6", // Azul
    "#ef4444", // Rojo
    "#10b981", // Verde
    "#f59e0b", // Naranja
    "#8b5cf6", // Púrpura
    "#ec4899", // Rosa
    "#6b7280", // Gris
  ]

  // Función para añadir un nuevo color personalizado
  const handleAddCustomColor = () => {
    if (!customColors.includes(newColor)) {
      const updatedColors = [...customColors, newColor]
      setCustomColors(updatedColors)
      saveCustomColors(updatedColors)
      onColorChange(newColor)
    }
  }

  // Función para eliminar un color personalizado
  const handleRemoveCustomColor = (colorToRemove: string) => {
    const updatedColors = customColors.filter((color) => color !== colorToRemove)
    setCustomColors(updatedColors)
    saveCustomColors(updatedColors)

    // Si el color seleccionado es el que se está eliminando, cambiar a un color predeterminado
    if (selectedColor === colorToRemove) {
      onColorChange(predefinedColors[0])
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Color seleccionado actualmente */}
        <div className="w-8 h-8 rounded-md border flex-shrink-0" style={{ backgroundColor: selectedColor }} />

        {/* Selector de colores en popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1 justify-between">
              <span className="text-xs text-muted-foreground truncate">{selectedColor}</span>
              <Palette className="h-4 w-4 ml-2 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start" ref={popoverRef} onClick={handlePopoverClick}>
            <Tabs defaultValue="predefined" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="predefined">Predefinidos</TabsTrigger>
                <TabsTrigger value="custom">Míos ({customColors.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="predefined" className="p-4" onClick={handlePopoverClick}>
                <div className="grid grid-cols-5 gap-2">
                  {predefinedColors.map((color) => (
                    <TooltipProvider key={color} delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "color-option transition-all duration-200",
                              selectedColor === color
                                ? "ring-2 ring-offset-2 ring-black dark:ring-white scale-110"
                                : "",
                            )}
                            style={{ backgroundColor: color }}
                            onClick={(e) => handleColorSelect(color, e)}
                          >
                            {selectedColor === color && <Check className="h-4 w-4 text-white" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="glass">
                          <p>{color}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="custom" className="p-4" onClick={handlePopoverClick}>
                {/* Content remains the same but with updated onClick handlers */}
                {customColors.length > 0 ? (
                  <div className="grid grid-cols-5 gap-2">
                    {customColors.map((color) => (
                      <TooltipProvider key={color} delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="relative group">
                              <button
                                type="button"
                                className={cn(
                                  "color-option transition-all duration-200",
                                  selectedColor === color
                                    ? "ring-2 ring-offset-2 ring-black dark:ring-white scale-110"
                                    : "",
                                )}
                                style={{ backgroundColor: color }}
                                onClick={(e) => handleColorSelect(color, e)}
                              >
                                {selectedColor === color && <Check className="h-4 w-4 text-white" />}
                              </button>
                              <button
                                type="button"
                                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity hover:bg-transparent group-hover:opacity-100 focus:opacity-100"
                                aria-label={`Eliminar color personalizado ${color}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRemoveCustomColor(color)
                                }}
                              >
                                <X className="h-3 w-3 text-[hsl(var(--status-danger))]" />
                              </button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="glass">
                            <p>{color}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay colores personalizados</p>
                )}

                {/* Add new custom color section with updated handlers */}
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Añadir color personalizado</p>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-md border" style={{ backgroundColor: newColor }} />
                      <Input
                        ref={colorInputRef}
                        type="color"
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <Input
                      type="text"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="flex-1"
                      placeholder="#000000"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAddCustomColor()
                      }}
                    >
                      Añadir
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
