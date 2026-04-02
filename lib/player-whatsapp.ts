/** Prefijo fijo WhatsApp móvil Chile (jugadores). */
export const PLAYER_WHATSAPP_PREFIX = '+569'

/** Número completo: +569 + exactamente 8 dígitos. */
export function isValidFullPlayerWhatsapp(value: string): boolean {
  return /^\+569[0-9]{8}$/.test(value.trim())
}

/** Solo dígitos del sufijo, máximo 8 (lo que escribe el usuario). */
export function sanitizeWhatsappSuffixInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8)
}

export function buildFullPlayerWhatsapp(suffixDigits: string): string {
  return `${PLAYER_WHATSAPP_PREFIX}${sanitizeWhatsappSuffixInput(suffixDigits)}`
}

export function isCompleteWhatsappSuffix(suffixDigits: string): boolean {
  return sanitizeWhatsappSuffixInput(suffixDigits).length === 8
}

/**
 * Pasa valor guardado en `profiles.whatsapp_phone` a los 8 dígitos para el input.
 * Soporta +569..., 569..., 9XXXXXXXX y 8 dígitos sueltos.
 */
export function extractWhatsappSuffix8(stored: string | undefined | null): string {
  const raw = (stored ?? '').trim().replace(/\s/g, '')
  if (!raw) return ''
  if (raw.startsWith('+569')) {
    return sanitizeWhatsappSuffixInput(raw.slice(4))
  }
  const d = raw.replace(/\D/g, '')
  if (d.startsWith('569') && d.length >= 11) {
    return d.slice(3, 11)
  }
  if (d.startsWith('56') && d.length >= 11 && d.slice(2, 5) === '9') {
    return d.slice(5, 13)
  }
  if (d.startsWith('9') && d.length === 9) {
    return d.slice(1, 9)
  }
  if (d.length === 8) {
    return d
  }
  return sanitizeWhatsappSuffixInput(d).slice(0, 8)
}
