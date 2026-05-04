import type { VenueBiCourtBreakdown, VenueBiIncomePoint } from '@/lib/venue-bi/types'

/**
 * Series ficticias para la landing /para-centros (mismo formato que el panel BI real).
 * Solo demostración visual — no son datos de ninguna sede.
 */
export const VENUE_B2B_DEMO_INCOME_SERIES: VenueBiIncomePoint[] = [
  {
    bucketDate: '2026-04-28',
    revenueCollected: 142000,
    reservationsConfirmed: 6,
  },
  {
    bucketDate: '2026-04-29',
    revenueCollected: 198000,
    reservationsConfirmed: 9,
  },
  {
    bucketDate: '2026-04-30',
    revenueCollected: 175500,
    reservationsConfirmed: 8,
  },
  {
    bucketDate: '2026-05-01',
    revenueCollected: 221000,
    reservationsConfirmed: 11,
  },
  {
    bucketDate: '2026-05-02',
    revenueCollected: 189000,
    reservationsConfirmed: 9,
  },
  {
    bucketDate: '2026-05-03',
    revenueCollected: 256000,
    reservationsConfirmed: 12,
  },
  {
    bucketDate: '2026-05-04',
    revenueCollected: 234500,
    reservationsConfirmed: 11,
  },
]

export const VENUE_B2B_DEMO_COURTS_BREAKDOWN: VenueBiCourtBreakdown[] = [
  {
    courtId: 'demo-1',
    courtName: 'Cancha 1',
    reservationsTotal: 44,
    reservationsConfirmed: 40,
    reservationsCancelled: 4,
    revenueCollected: 920000,
  },
  {
    courtId: 'demo-2',
    courtName: 'Cancha 2',
    reservationsTotal: 38,
    reservationsConfirmed: 36,
    reservationsCancelled: 2,
    revenueCollected: 788000,
  },
  {
    courtId: 'demo-3',
    courtName: 'Cancha 3',
    reservationsTotal: 31,
    reservationsConfirmed: 29,
    reservationsCancelled: 2,
    revenueCollected: 651000,
  },
]
