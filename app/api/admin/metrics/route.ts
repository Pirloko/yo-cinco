import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

type ReservationStatus = 'pending' | 'confirmed' | 'cancelled'
type MatchType = 'rival' | 'players' | 'open'
type RangeKey = 'day' | '7d' | '15d' | 'month' | 'semester' | 'year'

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }
    const admin = createAdminClient()
    const reqUrl = new URL(req.url)
    const range = (reqUrl.searchParams.get('range') ?? 'month') as RangeKey
    const from = buildFromDate(range)

    const [{ data: reservations }, { data: courts }, { data: venues }] =
      await Promise.all([
        admin
          .from('venue_reservations')
          .select(
            'id, status, starts_at, created_at, match_opportunity_id, court_id, confirmation_source, payment_status, booker_user_id'
          )
          .gte('starts_at', from.toISOString()),
        admin.from('venue_courts').select('id, venue_id, name'),
        admin.from('sports_venues').select('id, name, city_id, city'),
      ])

    const reservationRows =
      (reservations as
        | Array<{
            id: string
            status: ReservationStatus
            starts_at: string
            created_at: string
            match_opportunity_id: string | null
            court_id: string
            confirmation_source: string | null
            payment_status: 'unpaid' | 'deposit_paid' | 'paid' | null
            booker_user_id: string | null
          }>
        | null) ?? []
    const courtRows =
      (courts as Array<{ id: string; venue_id: string; name?: string }> | null) ?? []
    const venueRows =
      (venues as
        | Array<{ id: string; name: string; city_id: string | null; city: string | null }>
        | null) ?? []

    const cityIds = [...new Set(venueRows.map((v) => v.city_id).filter(Boolean))] as string[]
    let cityRows: Array<{ id: string; name: string; region_id: string }> = []
    let regionRows: Array<{ id: string; name: string }> = []
    if (cityIds.length > 0) {
      const { data: cities } = await admin
        .from('geo_cities')
        .select('id, name, region_id')
        .in('id', cityIds)
      cityRows = (cities as typeof cityRows | null) ?? []
      const regionIds = [...new Set(cityRows.map((c) => c.region_id).filter(Boolean))]
      if (regionIds.length > 0) {
        const { data: regions } = await admin
          .from('geo_regions')
          .select('id, name')
          .in('id', regionIds)
        regionRows = (regions as typeof regionRows | null) ?? []
      }
    }

    const regionNameById = new Map(regionRows.map((r) => [r.id, r.name]))
    const cityMetaById = new Map(
      cityRows.map((c) => [
        c.id,
        { name: c.name, regionId: c.region_id, regionName: regionNameById.get(c.region_id) ?? null },
      ]),
    )

    function venueGeo(venue: (typeof venueRows)[number]) {
      if (venue.city_id) {
        const cm = cityMetaById.get(venue.city_id)
        if (cm) {
          return {
            cityId: venue.city_id as string,
            cityName: cm.name,
            regionId: cm.regionId,
            regionName: cm.regionName,
          }
        }
      }
      return {
        cityId: venue.city_id,
        cityName: (venue.city?.trim() || '—') as string,
        regionId: null as string | null,
        regionName: null as string | null,
      }
    }

    const venueById = new Map(venueRows.map((v) => [v.id, v]))

    const courtToVenue = new Map(courtRows.map((c) => [c.id, c.venue_id]))
    const courtNameById = new Map(courtRows.map((c) => [c.id, c.name ?? 'Cancha']))
    const venueNameById = new Map(venueRows.map((v) => [v.id, v.name]))

    const statusCount: Record<ReservationStatus, number> = {
      pending: 0,
      confirmed: 0,
      cancelled: 0,
    }
    const byVenue = new Map<string, number>()

    const matchIds = [
      ...new Set(
        reservationRows.map((r) => r.match_opportunity_id).filter(Boolean)
      ),
    ] as string[]

    const matchTypeById = new Map<string, MatchType>()
    const matchTitleById = new Map<string, string>()
    if (matchIds.length > 0) {
      const { data: matches } = await admin
        .from('match_opportunities')
        .select('id, type, title')
        .in('id', matchIds)
      for (const m of matches ?? []) {
        matchTypeById.set(m.id as string, m.type as MatchType)
        matchTitleById.set(m.id as string, (m.title as string) ?? 'Partido')
      }
    }

    const bookerIds = [
      ...new Set(reservationRows.map((r) => r.booker_user_id).filter(Boolean)),
    ] as string[]
    const bookerNameById = new Map<string, string>()
    if (bookerIds.length > 0) {
      const { data: bookers } = await admin
        .from('profiles')
        .select('id, name')
        .in('id', bookerIds)
      for (const b of bookers ?? []) {
        bookerNameById.set(b.id as string, (b.name as string) ?? 'Jugador')
      }
    }

    const byType: Record<MatchType | 'reserve_only', number> = {
      rival: 0,
      players: 0,
      open: 0,
      reserve_only: 0,
    }
    let selfConfirmed = 0

    for (const r of reservationRows) {
      statusCount[r.status] += 1
      if (r.confirmation_source === 'booker_self') selfConfirmed += 1

      const venueId = courtToVenue.get(r.court_id)
      if (venueId) byVenue.set(venueId, (byVenue.get(venueId) ?? 0) + 1)

      if (!r.match_opportunity_id) {
        byType.reserve_only += 1
      } else {
        const t = matchTypeById.get(r.match_opportunity_id)
        if (t) byType[t] += 1
      }
    }

    const total = reservationRows.length
    const topVenues = [...byVenue.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([venueId, count]) => ({
        venueId,
        venueName: venueNameById.get(venueId) ?? 'Centro',
        reservations: count,
      }))

    const details = reservationRows
      .map((r) => {
        const venueId = courtToVenue.get(r.court_id) ?? null
        const venueRow = venueId ? venueById.get(venueId) : undefined
        const geo = venueRow ? venueGeo(venueRow) : {
          cityId: null as string | null,
          cityName: '—',
          regionId: null as string | null,
          regionName: null as string | null,
        }
        const matchType = r.match_opportunity_id
          ? (matchTypeById.get(r.match_opportunity_id) ?? null)
          : null
        return {
          id: r.id,
          startsAt: r.starts_at,
          createdAt: r.created_at,
          status: r.status,
          paymentStatus: r.payment_status ?? null,
          confirmationSource: r.confirmation_source ?? null,
          venueId,
          venueName: venueId ? venueNameById.get(venueId) ?? 'Centro' : 'Centro',
          cityId: geo.cityId,
          cityName: geo.cityName,
          regionId: geo.regionId,
          regionName: geo.regionName,
          courtName: courtNameById.get(r.court_id) ?? 'Cancha',
          matchId: r.match_opportunity_id,
          matchType: matchType ?? 'reserve_only',
          matchTitle: r.match_opportunity_id
            ? matchTitleById.get(r.match_opportunity_id) ?? 'Partido'
            : 'Reserva directa',
          bookerName: r.booker_user_id
            ? bookerNameById.get(r.booker_user_id) ?? 'Jugador'
            : 'Jugador',
        }
      })
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .slice(0, 200)

    return NextResponse.json({
      range,
      totals: {
        reservations: total,
        centers: venueRows.length,
        pending: statusCount.pending,
        confirmed: statusCount.confirmed,
        cancelled: statusCount.cancelled,
        selfConfirmed,
        confirmRate: total > 0 ? Math.round((statusCount.confirmed / total) * 100) : 0,
      },
      byType,
      topVenues,
      details,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function buildFromDate(range: RangeKey): Date {
  const now = new Date()
  const d = new Date(now)
  switch (range) {
    case 'day':
      d.setHours(0, 0, 0, 0)
      return d
    case '7d':
      d.setDate(d.getDate() - 7)
      return d
    case '15d':
      d.setDate(d.getDate() - 15)
      return d
    case 'month':
      d.setMonth(d.getMonth() - 1)
      return d
    case 'semester':
      d.setMonth(d.getMonth() - 6)
      return d
    case 'year':
      d.setFullYear(d.getFullYear() - 1)
      return d
    default:
      d.setMonth(d.getMonth() - 1)
      return d
  }
}
