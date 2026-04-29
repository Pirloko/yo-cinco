import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  VenueBiCourtBreakdown,
  VenueBiIncomePoint,
  VenueBiSnapshot,
} from '@/lib/venue-bi/types'

type SnapshotRpcPayload = {
  ok?: boolean
  meta?: {
    venueId?: string
    from?: string
    to?: string
    timezone?: string
    durationDays?: number
  }
  kpis?: VenueBiSnapshot['kpis']
  comparative?: VenueBiSnapshot['comparative']
  alerts?: VenueBiSnapshot['alerts']
}

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export async function fetchVenueBiSnapshot(
  supabase: SupabaseClient,
  venueId: string,
  fromIso: string,
  toIso: string,
  timezone = 'America/Santiago'
): Promise<VenueBiSnapshot | null> {
  const { data, error } = await supabase.rpc('bi_venue_kpis_snapshot', {
    p_venue_id: venueId,
    p_from: fromIso,
    p_to: toIso,
    p_tz: timezone,
  })
  if (error || !data) return null
  const payload = data as SnapshotRpcPayload
  if (!payload.ok || !payload.kpis || !payload.comparative || !payload.meta) {
    return null
  }
  return {
    meta: {
      venueId: payload.meta.venueId ?? venueId,
      from: payload.meta.from ?? fromIso,
      to: payload.meta.to ?? toIso,
      timezone: payload.meta.timezone ?? timezone,
      durationDays: safeNum(payload.meta.durationDays),
    },
    kpis: {
      ...payload.kpis,
      occupancyConfirmedPct: safeNum(payload.kpis.occupancyConfirmedPct),
      occupancyOperationalPct: safeNum(payload.kpis.occupancyOperationalPct),
      deadHours: safeNum(payload.kpis.deadHours),
      revenueTotal: safeNum(payload.kpis.revenueTotal),
      revPath: safeNum(payload.kpis.revPath),
      avgTicket: safeNum(payload.kpis.avgTicket),
      cancellationRatePct: safeNum(payload.kpis.cancellationRatePct),
      reservationsTotal: safeNum(payload.kpis.reservationsTotal),
      reservationsConfirmed: safeNum(payload.kpis.reservationsConfirmed),
      reservationsCancelled: safeNum(payload.kpis.reservationsCancelled),
      peakCount: safeNum(payload.kpis.peakCount),
      valleyCount: safeNum(payload.kpis.valleyCount),
      recurringClients: safeNum(payload.kpis.recurringClients),
      openHours: safeNum(payload.kpis.openHours),
    },
    comparative: {
      previousRevenueTotal: safeNum(payload.comparative.previousRevenueTotal),
      revenueDeltaAbs: safeNum(payload.comparative.revenueDeltaAbs),
      revenueDeltaPct: safeNum(payload.comparative.revenueDeltaPct),
    },
    alerts: (payload.alerts ?? []).map((a) => ({
      kind: typeof a.kind === 'string' ? a.kind : 'unknown',
      severity:
        a.severity === 'critical' || a.severity === 'warning' ? a.severity : 'info',
      message: typeof a.message === 'string' ? a.message : 'Sin detalle',
    })),
  }
}

export async function fetchVenueBiIncomeSeries(
  supabase: SupabaseClient,
  venueId: string,
  fromIso: string,
  toIso: string,
  timezone = 'America/Santiago'
): Promise<VenueBiIncomePoint[]> {
  const { data, error } = await supabase.rpc('bi_venue_income_timeseries', {
    p_venue_id: venueId,
    p_from: fromIso,
    p_to: toIso,
    p_tz: timezone,
  })
  if (error || !data) return []
  const rows = data as Array<{
    bucket_date: string
    revenue_collected: number
    reservations_confirmed: number
  }>
  return rows.map((r) => ({
    bucketDate: r.bucket_date,
    revenueCollected: safeNum(r.revenue_collected),
    reservationsConfirmed: safeNum(r.reservations_confirmed),
  }))
}

export async function fetchVenueBiCourtsBreakdown(
  supabase: SupabaseClient,
  venueId: string,
  fromIso: string,
  toIso: string
): Promise<VenueBiCourtBreakdown[]> {
  const { data, error } = await supabase.rpc('bi_venue_courts_breakdown', {
    p_venue_id: venueId,
    p_from: fromIso,
    p_to: toIso,
  })
  if (error || !data) return []
  const rows = data as Array<{
    court_id: string
    court_name: string
    reservations_total: number
    reservations_confirmed: number
    reservations_cancelled: number
    revenue_collected: number
  }>
  return rows.map((r) => ({
    courtId: r.court_id,
    courtName: r.court_name,
    reservationsTotal: safeNum(r.reservations_total),
    reservationsConfirmed: safeNum(r.reservations_confirmed),
    reservationsCancelled: safeNum(r.reservations_cancelled),
    revenueCollected: safeNum(r.revenue_collected),
  }))
}
