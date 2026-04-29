export function calcRevPath(revenueTotal: number, openHours: number): number {
  if (!Number.isFinite(revenueTotal) || !Number.isFinite(openHours) || openHours <= 0) {
    return 0
  }
  return revenueTotal / openHours
}

/** Ingreso cobrado ÷ cantidad de reservas que aportan a ese ingreso (p. ej. pagadas o con abono). */
export function calcAvgTicket(revenueTotal: number, reservationsWithRevenue: number): number {
  if (
    !Number.isFinite(revenueTotal) ||
    !Number.isFinite(reservationsWithRevenue) ||
    reservationsWithRevenue <= 0
  ) {
    return 0
  }
  return revenueTotal / reservationsWithRevenue
}

export function calcRevenueDeltaPct(
  currentRevenue: number,
  previousRevenue: number
): number {
  if (!Number.isFinite(currentRevenue) || !Number.isFinite(previousRevenue)) return 0
  if (previousRevenue <= 0) return currentRevenue > 0 ? 100 : 0
  return ((currentRevenue - previousRevenue) / previousRevenue) * 100
}

