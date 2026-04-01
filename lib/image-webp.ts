/**
 * Convierte una imagen a WebP en el cliente antes de subir a Storage.
 * Si el navegador no soporta `toBlob('image/webp')`, devuelve el archivo original.
 */
const MAX_EDGE = 1536
const WEBP_QUALITY = 0.82
const TARGET_MAX_BYTES = 1.85 * 1024 * 1024

function loadImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file)
}

function bitmapToWebpBlob(
  bitmap: ImageBitmap,
  quality: number
): Promise<Blob | null> {
  const w = bitmap.width
  const h = bitmap.height
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(bitmap, 0, 0, cw, ch)
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/webp',
      quality
    )
  })
}

export async function convertImageFileToWebP(file: File): Promise<File> {
  if (typeof createImageBitmap === 'undefined') {
    return file
  }
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await loadImageBitmap(file)
    let quality = WEBP_QUALITY
    let blob = await bitmapToWebpBlob(bitmap, quality)
    if (!blob || blob.size === 0) {
      return file
    }
    while (blob.size > TARGET_MAX_BYTES && quality > 0.45) {
      quality -= 0.1
      const next = await bitmapToWebpBlob(bitmap, quality)
      if (!next || next.size === 0) break
      blob = next
    }
    if (blob.size > 2 * 1024 * 1024) {
      return file
    }
    return new File([blob], 'avatar.webp', { type: 'image/webp' })
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}
