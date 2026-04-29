import type {
  VenueBiCourtBreakdown,
  VenueBiIncomePoint,
  VenueBiSnapshot,
} from '@/lib/venue-bi/types'

export const venueBiSnapshotMock: VenueBiSnapshot = {
  meta: {
    venueId: 'mock-venue',
    from: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
    timezone: 'America/Santiago',
    durationDays: 7,
  },
  kpis: {
    occupancyConfirmedPct: 62,
    occupancyOperationalPct: 74,
    deadHours: 41,
    revenueTotal: 842000,
    revPath: 14800,
    avgTicket: 22157,
    cancellationRatePct: 8.4,
    reservationsTotal: 46,
    reservationsConfirmed: 38,
    reservationsCancelled: 4,
    peakHour: 20,
    peakCount: 11,
    valleyHour: 15,
    valleyCount: 2,
    recurringClients: 9,
    openHours: 56,
  },
  comparative: {
    previousRevenueTotal: 725000,
    revenueDeltaAbs: 117000,
    revenueDeltaPct: 16.14,
  },
  alerts: [
    {
      kind: 'valley_window',
      severity: 'info',
      message: 'Baja actividad entre 15:00-18:00. Evalúa promociones por tramo.',
    },
  ],
}

export const venueBiIncomeSeriesMock: VenueBiIncomePoint[] = [
  { bucketDate: '2026-04-22', revenueCollected: 98000, reservationsConfirmed: 4 },
  { bucketDate: '2026-04-23', revenueCollected: 124000, reservationsConfirmed: 6 },
  { bucketDate: '2026-04-24', revenueCollected: 133000, reservationsConfirmed: 7 },
  { bucketDate: '2026-04-25', revenueCollected: 154000, reservationsConfirmed: 8 },
  { bucketDate: '2026-04-26', revenueCollected: 99000, reservationsConfirmed: 4 },
  { bucketDate: '2026-04-27', revenueCollected: 121000, reservationsConfirmed: 5 },
  { bucketDate: '2026-04-28', revenueCollected: 113000, reservationsConfirmed: 4 },
]

export const venueBiCourtsBreakdownMock: VenueBiCourtBreakdown[] = [
  {
    courtId: 'court-a',
    courtName: 'Cancha A',
    reservationsTotal: 18,
    reservationsConfirmed: 16,
    reservationsCancelled: 1,
    revenueCollected: 342000,
  },
  {
    courtId: 'court-b',
    courtName: 'Cancha B',
    reservationsTotal: 14,
    reservationsConfirmed: 11,
    reservationsCancelled: 2,
    revenueCollected: 278000,
  },
  {
    courtId: 'court-c',
    courtName: 'Cancha C',
    reservationsTotal: 14,
    reservationsConfirmed: 11,
    reservationsCancelled: 1,
    revenueCollected: 222000,
  },
]
