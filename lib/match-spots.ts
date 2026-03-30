import type { MatchOpportunity } from '@/lib/types'

/** Cupos libres según `playersNeeded` − `playersJoined`. `null` si no hay tope definido. */
export function matchSpotsRemaining(m: MatchOpportunity): number | null {
  const need = m.playersNeeded
  if (need == null || need <= 0) return null
  return Math.max(0, need - (m.playersJoined ?? 0))
}

/**
 * Orden para feeds tipo “casi lleno primero”: menos cupos libres arriba;
 * sin dato de cupos al final; empate por fecha más cercana.
 */
export function compareMatchOpportunitiesByFillUrgency(
  a: MatchOpportunity,
  b: MatchOpportunity
): number {
  const ra = matchSpotsRemaining(a)
  const rb = matchSpotsRemaining(b)
  if (ra !== null && rb !== null) {
    if (ra !== rb) return ra - rb
  } else if (ra !== null && rb === null) return -1
  else if (ra === null && rb !== null) return 1
  return a.dateTime.getTime() - b.dateTime.getTime()
}

/** Mensaje corto cuando quedan pocos cupos (1–3). */
export function matchFillUrgencyMessage(remaining: number): string | null {
  if (remaining <= 0 || remaining > 3) return null
  if (remaining === 1) {
    return '¡Solo falta 1 jugador para completar el partido!'
  }
  if (remaining === 2) {
    return 'Quedan 2 cupos: súmate antes de que se llene.'
  }
  return 'Quedan pocos cupos disponibles.'
}
