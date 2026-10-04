import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combina clases de Tailwind CSS de forma segura, evitando conflictos.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(...inputs))
}

/**
 * Clase de error personalizada para manejar errores especÃ­ficos de la aplicaciÃ³n.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "AppError"
  }
}

/**
 * CÃ³digos de error estandarizados para la aplicaciÃ³n.
 */
export const ErrorCodes = {
  STORAGE_ERROR: "STORAGE_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  PARSE_ERROR: "PARSE_ERROR",
  PERMISSION_ERROR: "PERMISSION_ERROR",
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

const URL_MATCHER = /(?:https?:\/\/|www\.)[^\s<]+/gi
const URL_TRAILING_PUNCTUATION = new Set([")", ",", ".", "!", "?", ";", ":"])

export type LinkifiedSegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string }

function trimTrailingUrlPunctuation(value: string) {
  let url = value
  let trailing = ""

  while (url.length > 0) {
    const lastCharacter = url.at(-1)
    if (!lastCharacter || !URL_TRAILING_PUNCTUATION.has(lastCharacter)) {
      break
    }

    if (lastCharacter === ")") {
      const openingParentheses = (url.match(/\(/g) ?? []).length
      const closingParentheses = (url.match(/\)/g) ?? []).length

      if (closingParentheses <= openingParentheses) {
        break
      }
    }

    trailing = `${lastCharacter}${trailing}`
    url = url.slice(0, -1)
  }

  return { url, trailing }
}

export function getShortUrlLabel(url: string, maxLength = 40) {
  const cleanUrl = url.replace(/^https?:\/\//i, "").replace(/\/$/, "")

  if (cleanUrl.length <= maxLength) {
    return cleanUrl
  }

  return cleanUrl.slice(0, maxLength - 3) + "..."
}

export function getLinkifiedSegments(text: string): LinkifiedSegment[] {
  const segments: LinkifiedSegment[] = []

  if (!text) {
    return segments
  }

  let cursor = 0

  for (const match of text.matchAll(URL_MATCHER)) {
    const matchIndex = match.index ?? -1
    const rawValue = match[0]

    if (matchIndex < 0 || !rawValue) {
      continue
    }

    if (matchIndex > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, matchIndex) })
    }

    const { url, trailing } = trimTrailingUrlPunctuation(rawValue)

    if (url.length > 0) {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
      segments.push({ type: "link", value: url, href })
    }

    if (trailing) {
      segments.push({ type: "text", value: trailing })
    }

    cursor = matchIndex + rawValue.length
  }

  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) })
  }

  return segments
}
