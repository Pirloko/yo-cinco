export type VenueBiRangePreset = 'today' | '7d' | '30d' | 'custom'
/** Alias para compatibilidad interna. */
export type VenueBiPresetRange = VenueBiRangePreset

export type VenueBiAlert = {
  kind: string
  severity: 'info' | 'warning' | 'critical'
  message: string
}

export type VenueBiKpis = {
  occupancyConfirmedPct: number
  occupancyOperationalPct: number
  deadHours: number
  revenueTotal: number
  revPath: number
  avgTicket: number
  cancellationRatePct: number
  reservationsTotal: number
  reservationsConfirmed: number
  reservationsCancelled: number
  peakHour: number | null
  peakCount: number
  valleyHour: number | null
  valleyCount: number
  recurringClients: number
  openHours: number
}

export type VenueBiComparative = {
  previousRevenueTotal: number
  revenueDeltaAbs: number
  revenueDeltaPct: number
}

export type VenueBiSnapshot = {
  meta: {
    venueId: string
    from: string
    to: string
    timezone: string
    durationDays: number
  }
  kpis: VenueBiKpis
  comparative: VenueBiComparative
  alerts: VenueBiAlert[]
}

export type VenueBiIncomePoint = {
  bucketDate: string
  revenueCollected: number
  reservationsConfirmed: number
}

export type VenueBiCourtBreakdown = {
  courtId: string
  courtName: string
  reservationsTotal: number
  reservationsConfirmed: number
  reservationsCancelled: number
  revenueCollected: number
}
