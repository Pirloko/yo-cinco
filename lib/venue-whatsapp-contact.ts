import { parseVenuePhoneChile } from '@/lib/player-whatsapp'

/** Enlace wa.me si el centro tiene móvil Chile válido guardado. */
export function whatsappUrlForVenueContact(
  phoneRaw: string | null | undefined,
  message: string
): string | null {
  const parsed = parseVenuePhoneChile(phoneRaw ?? '')
  if (!parsed.valid || !parsed.value) return null
  const digits = parsed.value.replace(/\D/g, '')
  if (digits.length < 10) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export function buildVenueCourtConfirmationMessage(opts: {
  playerFirstName: string
  venueName: string
  dateLine: string
  timeLine: string
  detailLine?: string
}): string {
  const who = opts.playerFirstName.trim() || 'un jugador'
  const detail = opts.detailLine?.trim()
    ? ` — ${opts.detailLine.trim()}`
    : ''
  return `Hola, soy ${who}. Quiero confirmar la reserva de cancha en ${opts.venueName}, ${opts.dateLine} a las ${opts.timeLine}${detail}. ¿Podrían confirmarme? Gracias.`
}
