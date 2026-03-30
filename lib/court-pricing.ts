import type { MatchOpportunity } from '@/lib/types'

export function formatClp(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function courtTotalFromPricing(
  pricing: NonNullable<MatchOpportunity['venueReservationPricing']>
): number | null {
  const { pricePerHour, startsAt, endsAt } = pricing
  if (pricePerHour == null || pricePerHour <= 0) return null
  const hours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000
  if (hours <= 0) return null
  return Math.round(hours * pricePerHour)
}

/** Cupo planeando el partido (players_needed) o jugadores ya unidos. */
export function divisorForCourtShare(opp: MatchOpportunity): number {
  const cap = opp.playersNeeded
  if (cap != null && cap > 0) return cap
  return Math.max(1, opp.playersJoined ?? 1)
}

export function perPlayerCourtShare(opp: MatchOpportunity): number | null {
  const p = opp.venueReservationPricing
  if (!p) return null
  const total = courtTotalFromPricing(p)
  if (total == null) return null
  const d = divisorForCourtShare(opp)
  return Math.round(total / d)
}

export function shortCourtPricingLine(opp: MatchOpportunity): string | null {
  const total = opp.venueReservationPricing
    ? courtTotalFromPricing(opp.venueReservationPricing!)
    : null
  const share = perPlayerCourtShare(opp)
  if (total == null || share == null) return null
  return `Cancha ${formatClp(total)} · ~${formatClp(share)} c/u`
}

/** Texto largo para diálogos y detalle. */
export function payOrganizerFullNotice(opp: MatchOpportunity): string | null {
  const share = perPlayerCourtShare(opp)
  const total = opp.venueReservationPricing
    ? courtTotalFromPricing(opp.venueReservationPricing)
    : null
  if (share == null || total == null || !opp.venueReservationPricing) return null
  const d = divisorForCourtShare(opp)
  return `Debes pagar al organizador (${opp.creatorName}) ${formatClp(share)} para tu parte de la cancha (total ${formatClp(total)} dividido entre ${d} jugadores).`
}

export function payOrganizerToastMessage(opp: MatchOpportunity): string | null {
  const share = perPlayerCourtShare(opp)
  if (share == null) return null
  return `Paga al organizador (${opp.creatorName}) ${formatClp(share)} por tu parte de la cancha.`
}

/** Estimación al publicar (antes de conocer la cancha asignada por el RPC). */
export function venueCourtPricingHint(
  courts: Array<{ pricePerHour?: number | null }>,
  slotMinutes: number
): string | null {
  const prices = courts
    .map((c) => c.pricePerHour)
    .filter((n): n is number => n != null && n > 0)
  if (prices.length === 0) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const h = slotMinutes / 60
  const estMin = Math.round(min * h)
  const estMax = Math.round(max * h)
  if (estMin === estMax) {
    return `Total cancha estimado ~${formatClp(estMin)} por ${slotMinutes} min (precio/hora del centro).`
  }
  return `Total cancha estimado ~${formatClp(estMin)}–${formatClp(estMax)} por ${slotMinutes} min (según cancha asignada).`
}
