// These are resource guards for a single file, never limits on task count or age.
export const MAX_FILE_BYTES = 512 * 1024 * 1024
export const MAX_JSON_BYTES = 512 * 1024 * 1024

export async function compressJson(value: unknown): Promise<Blob> {
  const source = new Blob([JSON.stringify(value)], { type: "application/json" })
  if (source.size > MAX_JSON_BYTES) throw new Error("El archivo supera el máximo técnico de 512 MB sin comprimir.")
  if (typeof CompressionStream === "undefined") return source
  return new Response(source.stream().pipeThrough(new CompressionStream("gzip"))).blob()
}

export async function readJsonBlob(blob: Blob, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  if (blob.size > MAX_FILE_BYTES) throw new Error("El archivo supera el máximo técnico de 512 MB.")
  const magic = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  const gzip = magic[0] === 0x1f && magic[1] === 0x8b
  if (gzip && typeof DecompressionStream === "undefined") throw new Error("Este navegador necesita una copia JSON sin comprimir.")
  const stream = gzip ? blob.stream().pipeThrough(new DecompressionStream("gzip")) : blob.stream()
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error("El contenido descomprimido supera el tamaño permitido.")
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}

export async function checksum(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
