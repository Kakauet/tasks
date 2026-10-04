export type AccentPreset = {
  id: string
  name: string
  description: string
  hex: string
  primaryForeground?: "light" | "dark"
  kind?: "standard" | "neutral"
}

export type DarkModePreset = {
  id: string
  name: string
  description: string
  swatchHex: string
  tokens: {
    background: string
    card: string
    popover: string
    secondary: string
    muted: string
    border: string
    input: string
  }
}

export type BoardSection = "todo" | "inProgress" | "done"

export type BoardColorPreset = {
  id: string
  name: string
  description: string
  token: string
  hex: string
}

export type BoardColorSelections = Record<BoardSection, string>

export const BOARD_SECTIONS: BoardSection[] = ["todo", "inProgress", "done"]
export const BOARD_SECTION_LABELS: Record<BoardSection, string> = {
  todo: "Por hacer",
  inProgress: "En progreso",
  done: "Completadas",
}
export const BOARD_SECTION_VARIABLES: Record<BoardSection, string> = {
  todo: "--board-todo-color",
  inProgress: "--board-in-progress-color",
  done: "--board-done-color",
}

export const ACCENT_STORAGE_KEY = "taskmaster-accent-id"
export const DARK_MODE_STORAGE_KEY = "taskmaster-dark-mode-id"
export const BOARD_COLORS_STORAGE_KEY = "taskmaster-board-colors"

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "blue", name: "Azul", description: "El clásico equilibrado", hex: "#3b82f6", primaryForeground: "light" },
  { id: "indigo", name: "Índigo", description: "Formal y tecnológico", hex: "#6366f1" },
  { id: "emerald", name: "Esmeralda", description: "Limpio y productivo", hex: "#10b981" },
  { id: "slate", name: "Gris", description: "Sobrio y neutral", hex: "#64748b", kind: "neutral" },
  { id: "white", name: "Blanco", description: "Suave y minimalista", hex: "#f8fafc", primaryForeground: "dark", kind: "neutral" },
  { id: "dark-purple", name: "Morado oscuro", description: "Profundo y elegante", hex: "#3b0764", primaryForeground: "light" },
  { id: "amber", name: "Ámbar", description: "Cálido y visible", hex: "#f59e0b" },
  { id: "rose", name: "Rosado", description: "Moderno con contraste", hex: "#f43f5e", primaryForeground: "light" },
]

export const DARK_MODE_PRESETS: DarkModePreset[] = [
  {
    id: "blue-dark",
    name: "Azul oscuro",
    description: "Profundo y equilibrado",
    swatchHex: "#0b1120",
    tokens: {
      background: "222 34% 7%",
      card: "222 27% 10.5%",
      popover: "222 24% 12%",
      secondary: "220 20% 16%",
      muted: "220 20% 15%",
      border: "220 18% 21%",
      input: "220 18% 24%",
    },
  },
  {
    id: "gray-dark",
    name: "Gris oscuro",
    description: "Neutro y silencioso",
    swatchHex: "#111214",
    tokens: {
      background: "220 8% 7%",
      card: "220 8% 10.5%",
      popover: "220 7% 12%",
      secondary: "220 7% 16%",
      muted: "220 7% 15%",
      border: "220 7% 21%",
      input: "220 7% 24%",
    },
  },
]

export const BOARD_COLOR_PRESETS: BoardColorPreset[] = [
  { id: "slate", name: "Gris", description: "Neutro", token: "215 16% 47%", hex: "#64748b" },
  { id: "blue", name: "Azul", description: "Clásico", token: "217 91% 60%", hex: "#3b82f6" },
  { id: "emerald", name: "Esmeralda", description: "Natural", token: "160 84% 39%", hex: "#10b981" },
  { id: "violet", name: "Violeta", description: "Creativo", token: "262 83% 58%", hex: "#8b5cf6" },
  { id: "amber", name: "Ámbar", description: "Energético", token: "38 92% 50%", hex: "#f59e0b" },
  { id: "rose", name: "Rosado", description: "Vibrante", token: "347 89% 60%", hex: "#f43f5e" },
  { id: "cyan", name: "Cian", description: "Frío", token: "188 94% 43%", hex: "#06b6d4" },
]

export const DEFAULT_ACCENT_PRESET = ACCENT_PRESETS[0]
export const DEFAULT_DARK_MODE_PRESET = DARK_MODE_PRESETS[0]
export const DEFAULT_BOARD_COLOR_SELECTIONS: BoardColorSelections = {
  todo: "slate",
  inProgress: "blue",
  done: "emerald",
}
export const LIGHT_TEXT_TOKEN = "0 0% 100%"
export const DARK_TEXT_TOKEN = "222.2 47.4% 11.2%"

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "")
  const hexValue =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized

  const parsedValue = Number.parseInt(hexValue, 16)
  if (!Number.isFinite(parsedValue)) {
    return { r: 59, g: 130, b: 246 }
  }

  return {
    r: (parsedValue >> 16) & 255,
    g: (parsedValue >> 8) & 255,
    b: parsedValue & 255,
  }
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const delta = max - min
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)

    switch (max) {
      case red:
        h = (green - blue) / delta + (green < blue ? 6 : 0)
        break
      case green:
        h = (blue - red) / delta + 2
        break
      default:
        h = (red - green) / delta + 4
        break
    }

    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360
  const saturation = clamp(s, 0, 100) / 100
  const lightness = clamp(l, 0, 100) / 100

  if (saturation === 0) {
    const value = Math.round(lightness * 255)
    return { r: value, g: value, b: value }
  }

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = hue / 60
  const x = chroma * (1 - Math.abs((segment % 2) - 1))

  let r1 = 0
  let g1 = 0
  let b1 = 0

  if (segment >= 0 && segment < 1) {
    r1 = chroma
    g1 = x
  } else if (segment < 2) {
    r1 = x
    g1 = chroma
  } else if (segment < 3) {
    g1 = chroma
    b1 = x
  } else if (segment < 4) {
    g1 = x
    b1 = chroma
  } else if (segment < 5) {
    r1 = x
    b1 = chroma
  } else {
    r1 = chroma
    b1 = x
  }

  const match = lightness - chroma / 2

  return {
    r: Math.round((r1 + match) * 255),
    g: Math.round((g1 + match) * 255),
    b: Math.round((b1 + match) * 255),
  }
}

export const toHslToken = (h: number, s: number, l: number) => `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`

export function toLinearLuminance(channel: number): number {
  const value = channel / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function contrastRatio(
  foreground: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number },
): number {
  const foregroundLuminance =
    0.2126 * toLinearLuminance(foreground.r) +
    0.7152 * toLinearLuminance(foreground.g) +
    0.0722 * toLinearLuminance(foreground.b)
  const backgroundLuminance =
    0.2126 * toLinearLuminance(background.r) +
    0.7152 * toLinearLuminance(background.g) +
    0.0722 * toLinearLuminance(background.b)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

export function getStableReadableTextToken(backgrounds: Array<{ h: number; s: number; l: number }>): string {
  const whiteContrasts = backgrounds.map((background) =>
    contrastRatio({ r: 255, g: 255, b: 255 }, hslToRgb(background.h, background.s, background.l)),
  )
  const darkContrasts = backgrounds.map((background) =>
    contrastRatio({ r: 15, g: 23, b: 42 }, hslToRgb(background.h, background.s, background.l)),
  )

  const minWhiteContrast = Math.min(...whiteContrasts)
  const minDarkContrast = Math.min(...darkContrasts)

  // Prefer white when it remains legible and close to dark text contrast.
  const whitePreferenceMargin = 0.8
  const minReadableContrast = 4.4
  const shouldUseWhiteText =
    minWhiteContrast >= minReadableContrast && minWhiteContrast + whitePreferenceMargin >= minDarkContrast

  if (shouldUseWhiteText) {
    return LIGHT_TEXT_TOKEN
  }

  if (minDarkContrast >= minReadableContrast) {
    return DARK_TEXT_TOKEN
  }

  return minWhiteContrast >= minDarkContrast ? LIGHT_TEXT_TOKEN : DARK_TEXT_TOKEN
}

export function buildAccentTokens(accentPreset: AccentPreset) {
  const { r, g, b } = hexToRgb(accentPreset.hex)
  const { h, s, l } = rgbToHsl(r, g, b)
  const isNeutralPreset = accentPreset.kind === "neutral"

  const primaryLight = isNeutralPreset
    ? {
        h,
        s: clamp(s, 8, 24),
        l: clamp(l, 42, 76),
      }
    : {
        h,
        s: clamp(s, 62, 88),
        l: clamp(l, 44, 54),
      }

  const primaryDark = isNeutralPreset
    ? {
        h,
        s: clamp(primaryLight.s + 2, 10, 28),
        l: clamp(primaryLight.l + 8, 58, 84),
      }
    : {
        h,
        s: clamp(s + 6, 66, 92),
        l: clamp(primaryLight.l + 10, 58, 68),
      }

  const accentLight = isNeutralPreset
    ? {
        h,
        s: clamp(primaryLight.s - 2, 6, 20),
        l: 96,
      }
    : {
        h,
        s: clamp(primaryLight.s - 44, 16, 36),
        l: 96,
      }

  const accentDark = isNeutralPreset
    ? {
        h,
        s: clamp(primaryDark.s - 2, 10, 22),
        l: 18,
      }
    : {
        h,
        s: clamp(primaryDark.s - 38, 20, 42),
        l: 18,
      }

  const ringLight = isNeutralPreset
    ? {
        h,
        s: clamp(primaryLight.s + 3, 12, 30),
        l: clamp(primaryLight.l - 7, 36, 62),
      }
    : {
        h,
        s: clamp(primaryLight.s + 2, 62, 92),
        l: clamp(primaryLight.l - 3, 40, 52),
      }

  const ringDark = isNeutralPreset
    ? {
        h,
        s: clamp(primaryDark.s + 2, 14, 32),
        l: clamp(primaryDark.l - 11, 46, 70),
      }
    : {
        h,
        s: clamp(primaryDark.s - 4, 58, 88),
        l: clamp(primaryDark.l - 9, 48, 60),
      }

  const autoPrimaryForeground = getStableReadableTextToken([primaryLight, primaryDark])
  const sharedPrimaryForeground =
    accentPreset.primaryForeground === "light"
      ? LIGHT_TEXT_TOKEN
      : accentPreset.primaryForeground === "dark"
        ? DARK_TEXT_TOKEN
        : autoPrimaryForeground

  return {
    primaryLight: toHslToken(primaryLight.h, primaryLight.s, primaryLight.l),
    primaryDark: toHslToken(primaryDark.h, primaryDark.s, primaryDark.l),
    primaryLightForeground: sharedPrimaryForeground,
    primaryDarkForeground: sharedPrimaryForeground,
    accentLight: toHslToken(accentLight.h, accentLight.s, accentLight.l),
    accentDark: toHslToken(accentDark.h, accentDark.s, accentDark.l),
    ringLight: toHslToken(ringLight.h, ringLight.s, ringLight.l),
    ringDark: toHslToken(ringDark.h, ringDark.s, ringDark.l),
  }
}

export function applyAccentPreset(accentPreset: AccentPreset) {
  const root = document.documentElement
  const tokens = buildAccentTokens(accentPreset)

  root.style.setProperty("--primary-light", tokens.primaryLight)
  root.style.setProperty("--primary-light-foreground", tokens.primaryLightForeground)
  root.style.setProperty("--accent-light", tokens.accentLight)
  root.style.setProperty("--ring-light", tokens.ringLight)
  root.style.setProperty("--primary-dark", tokens.primaryDark)
  root.style.setProperty("--primary-dark-foreground", tokens.primaryDarkForeground)
  root.style.setProperty("--accent-dark", tokens.accentDark)
  root.style.setProperty("--ring-dark", tokens.ringDark)
}

export function applyDarkModePreset(darkModePreset: DarkModePreset) {
  const root = document.documentElement
  root.style.setProperty("--dark-background", darkModePreset.tokens.background)
  root.style.setProperty("--dark-card", darkModePreset.tokens.card)
  root.style.setProperty("--dark-popover", darkModePreset.tokens.popover)
  root.style.setProperty("--dark-secondary", darkModePreset.tokens.secondary)
  root.style.setProperty("--dark-muted", darkModePreset.tokens.muted)
  root.style.setProperty("--dark-border", darkModePreset.tokens.border)
  root.style.setProperty("--dark-input", darkModePreset.tokens.input)
}

export function getBoardColorPreset(presetId: string, fallbackId: string) {
  return (
    BOARD_COLOR_PRESETS.find((preset) => preset.id === presetId) ??
    BOARD_COLOR_PRESETS.find((preset) => preset.id === fallbackId) ??
    BOARD_COLOR_PRESETS[0]
  )
}

export function normalizeBoardColorSelections(value: string | null): BoardColorSelections {
  if (!value) return DEFAULT_BOARD_COLOR_SELECTIONS

  try {
    const parsed = JSON.parse(value) as Partial<BoardColorSelections>
    return {
      todo: getBoardColorPreset(parsed.todo ?? DEFAULT_BOARD_COLOR_SELECTIONS.todo, DEFAULT_BOARD_COLOR_SELECTIONS.todo).id,
      inProgress: getBoardColorPreset(
        parsed.inProgress ?? DEFAULT_BOARD_COLOR_SELECTIONS.inProgress,
        DEFAULT_BOARD_COLOR_SELECTIONS.inProgress,
      ).id,
      done: getBoardColorPreset(parsed.done ?? DEFAULT_BOARD_COLOR_SELECTIONS.done, DEFAULT_BOARD_COLOR_SELECTIONS.done).id,
    }
  } catch {
    return DEFAULT_BOARD_COLOR_SELECTIONS
  }
}

export function applyBoardColorSelections(selections: BoardColorSelections) {
  const root = document.documentElement

  BOARD_SECTIONS.forEach((section) => {
    const fallbackId = DEFAULT_BOARD_COLOR_SELECTIONS[section]
    const preset = getBoardColorPreset(selections[section], fallbackId)
    root.style.setProperty(BOARD_SECTION_VARIABLES[section], preset.token)
  })
}

