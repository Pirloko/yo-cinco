import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SportsVenue,
  VenueCourt,
  VenueReservationRow,
  VenueWeeklyHour,
} from '@/lib/types'
import { SPORTS_VENUE_SELECT_WITH_GEO } from '@/lib/supabase/geo-queries'

type VenueGeoCityEmbed = { id: string; name: string; slug: string }

export function mapVenueRow(r: Record<string, unknown>): SportsVenue {
  const geo = r.geo_city as VenueGeoCityEmbed | null | undefined
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    name: r.name as string,
    address: (r.address as string) ?? '',
    mapsUrl: (r.maps_url as string | null) ?? null,
    phone: (r.phone as string) ?? '',
    cityId: (r.city_id as string) ?? '',
    city: geo?.name?.trim() || (r.city as string) || 'Rancagua',
    isPaused: (r.is_paused as boolean) ?? false,
    slotDurationMinutes: (r.slot_duration_minutes as number) ?? 60,
    createdAt: new Date(r.created_at as string),
  }
}

export async function fetchSportsVenuesList(
  supabase: SupabaseClient
): Promise<SportsVenue[]> {
  const { data, error } = await supabase
    .from('sports_venues')
    .select(SPORTS_VENUE_SELECT_WITH_GEO)
    .eq('is_paused', false)
    .order('name', { ascending: true })
  if (error || !data?.length) return []
  return data.map((r) => mapVenueRow(r as Record<string, unknown>))
}

/** Ciudades de la región donde existe al menos un `sports_venues` (opciones de filtro). */
export async function fetchGeoCitiesWithVenuesInRegion(
  supabase: SupabaseClient,
  regionId: string
): Promise<Array<{ id: string; name: string }>> {
  const { data: cities, error: cErr } = await supabase
    .from('geo_cities')
    .select('id, name')
    .eq('region_id', regionId)
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (cErr || !cities?.length) return []
  const cityIds = cities.map((c) => c.id as string)
  const { data: used, error: uErr } = await supabase
    .from('sports_venues')
    .select('city_id')
    .eq('is_paused', false)
    .in('city_id', cityIds)
  if (uErr || !used?.length) return []
  const withVenue = new Set(
    used.map((r) => r.city_id as string).filter(Boolean)
  )
  return cities
    .filter((c) => withVenue.has(c.id as string))
    .map((c) => ({ id: c.id as string, name: c.name as string }))
}

/** Centros deportivos cuya ciudad pertenece a la región. */
export async function fetchSportsVenuesInRegion(
  supabase: SupabaseClient,
  regionId: string
): Promise<SportsVenue[]> {
  const { data: cities } = await supabase
    .from('geo_cities')
    .select('id')
    .eq('region_id', regionId)
    .eq('is_active', true)
  const ids = cities?.map((c) => c.id as string) ?? []
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('sports_venues')
    .select(SPORTS_VENUE_SELECT_WITH_GEO)
    .eq('is_paused', false)
    .in('city_id', ids)
    .order('name', { ascending: true })
  if (error || !data?.length) return []
  return data.map((r) => mapVenueRow(r as Record<string, unknown>))
}

/** Centros en una ciudad concreta (`profiles.city_id`). */
export async function fetchSportsVenuesInCity(
  supabase: SupabaseClient,
  cityId: string
): Promise<SportsVenue[]> {
  if (!cityId) return []
  const { data, error } = await supabase
    .from('sports_venues')
    .select(SPORTS_VENUE_SELECT_WITH_GEO)
    .eq('is_paused', false)
    .eq('city_id', cityId)
    .order('name', { ascending: true })
  if (error || !data?.length) return []
  return data.map((r) => mapVenueRow(r as Record<string, unknown>))
}

/**
 * Lista de centros para crear partido / reservar: misma región o ciudad del jugador.
 * Prioriza región (más opciones en la zona); si no hay región, filtra por ciudad.
 */
export async function fetchSportsVenuesForPlayerGeo(
  supabase: SupabaseClient,
  regionId: string | undefined,
  cityId: string | undefined
): Promise<SportsVenue[]> {
  if (regionId) return fetchSportsVenuesInRegion(supabase, regionId)
  if (cityId) return fetchSportsVenuesInCity(supabase, cityId)
  return fetchSportsVenuesList(supabase)
}

export async function fetchVenueById(
  supabase: SupabaseClient,
  venueId: string
): Promise<SportsVenue | null> {
  const { data, error } = await supabase
    .from('sports_venues')
    .select(SPORTS_VENUE_SELECT_WITH_GEO)
    .eq('id', venueId)
    .eq('is_paused', false)
    .maybeSingle()
  if (error || !data) return null
  return mapVenueRow(data as Record<string, unknown>)
}

export async function fetchVenueForOwner(
  supabase: SupabaseClient,
  ownerId: string
): Promise<SportsVenue | null> {
  const { data, error } = await supabase
    .from('sports_venues')
    .select(SPORTS_VENUE_SELECT_WITH_GEO)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error || !data) return null
  return mapVenueRow(data as Record<string, unknown>)
}

export async function fetchVenueCourts(
  supabase: SupabaseClient,
  venueId: string
): Promise<VenueCourt[]> {
  const { data, error } = await supabase
    .from('venue_courts')
    .select('id, venue_id, name, sort_order, price_per_hour')
    .eq('venue_id', venueId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    venueId: r.venue_id as string,
    name: r.name as string,
    sortOrder: (r.sort_order as number) ?? 0,
    pricePerHour:
      r.price_per_hour != null ? (r.price_per_hour as number) : null,
  }))
}

export async function fetchVenueWeeklyHours(
  supabase: SupabaseClient,
  venueId: string
): Promise<VenueWeeklyHour[]> {
  const { data, error } = await supabase
    .from('venue_weekly_hours')
    .select('id, venue_id, day_of_week, open_time, close_time')
    .eq('venue_id', venueId)
    .order('day_of_week', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    venueId: r.venue_id as string,
    dayOfWeek: r.day_of_week as number,
    openTime: (r.open_time as string).slice(0, 5),
    closeTime: (r.close_time as string).slice(0, 5),
  }))
}

/** Reservas “solo cancha” del jugador (sin partido vinculado). */
export type PlayerVenueReservationListItem = {
  id: string
  courtId: string
  venueId: string
  startsAt: Date
  endsAt: Date
  status: VenueReservationRow['status']
  paymentStatus?: VenueReservationRow['paymentStatus']
  courtName: string
  venueName: string
  venueCity: string
  /** Teléfono del centro para WhatsApp (`sports_venues.phone`). */
  venuePhone: string
  pricePerHour: number | null
  currency: string
}

/**
 * Reservas solo cancha del jugador (sin partido). Incluye canceladas;
 * la UI separa Próximos / Finalizados según si la franja ya terminó (`ends_at`).
 */
export async function fetchPlayerVenueReservationsSoloForHub(
  supabase: SupabaseClient,
  bookerUserId: string
): Promise<PlayerVenueReservationListItem[]> {
  const { data: rows, error } = await supabase
    .from('venue_reservations')
    .select(
      'id, court_id, starts_at, ends_at, status, payment_status, price_per_hour, currency'
    )
    .eq('booker_user_id', bookerUserId)
    .is('match_opportunity_id', null)
    .in('status', ['pending', 'confirmed', 'cancelled'])
    .order('starts_at', { ascending: false })
    .limit(150)

  if (error || !rows?.length) return []

  const courtIds = [...new Set(rows.map((r) => r.court_id as string))]
  const { data: courts } = await supabase
    .from('venue_courts')
    .select('id, name, venue_id')
    .in('id', courtIds)
  if (!courts?.length) return []

  const courtMap = new Map(courts.map((c) => [c.id as string, c]))
  const venueIds = [...new Set(courts.map((c) => c.venue_id as string))]
  const { data: venues } = await supabase
    .from('sports_venues')
    .select(SPORTS_VENUE_SELECT_WITH_GEO)
    .in('id', venueIds)
  const venueMap = new Map((venues ?? []).map((v) => [v.id as string, v]))

  return rows.map((r) => {
    const c = courtMap.get(r.court_id as string)
    const v = c ? venueMap.get(c.venue_id as string) : undefined
    const vRow = v as Record<string, unknown> | undefined
    const mappedVenue = vRow != null ? mapVenueRow(vRow) : null
    const venueCity = mappedVenue?.city ?? ''
    return {
      id: r.id as string,
      courtId: r.court_id as string,
      venueId: (v?.id as string) ?? (c?.venue_id as string) ?? '',
      startsAt: new Date(r.starts_at as string),
      endsAt: new Date(r.ends_at as string),
      status: r.status as VenueReservationRow['status'],
      paymentStatus:
        (r.payment_status as VenueReservationRow['paymentStatus']) ?? undefined,
      courtName: (c?.name as string) ?? 'Cancha',
      venueName: (v?.name as string) ?? 'Centro',
      venueCity,
      venuePhone: mappedVenue?.phone ?? '',
      pricePerHour: (r.price_per_hour as number | null) ?? null,
      currency: ((r.currency as string) ?? 'CLP').trim() || 'CLP',
    }
  })
}

function mapVenueReservationDbRow(r: Record<string, unknown>): VenueReservationRow {
  return {
    id: r.id as string,
    courtId: r.court_id as string,
    startsAt: new Date(r.starts_at as string),
    endsAt: new Date(r.ends_at as string),
    bookerUserId: (r.booker_user_id as string | null) ?? null,
    matchOpportunityId: (r.match_opportunity_id as string | null) ?? null,
    status: r.status as VenueReservationRow['status'],
    paymentStatus:
      (r.payment_status as VenueReservationRow['paymentStatus']) ?? undefined,
    pricePerHour: (r.price_per_hour as number | null) ?? undefined,
    currency: (r.currency as string | null) ?? undefined,
    depositAmount: (r.deposit_amount as number | null) ?? undefined,
    paidAmount: (r.paid_amount as number | null) ?? undefined,
    confirmedAt: r.confirmed_at ? new Date(r.confirmed_at as string) : null,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at as string) : null,
    cancelledReason: (r.cancelled_reason as string | null) ?? null,
    confirmedByUserId: (r.confirmed_by_user_id as string | null) ?? null,
    confirmationSource:
      (r.confirmation_source as VenueReservationRow['confirmationSource']) ?? null,
    confirmationNote: (r.confirmation_note as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }
}

const VENUE_RESERVATIONS_RANGE_SELECT =
  'id, court_id, starts_at, ends_at, booker_user_id, match_opportunity_id, status, payment_status, price_per_hour, currency, deposit_amount, paid_amount, confirmed_at, cancelled_at, cancelled_reason, confirmed_by_user_id, confirmation_source, confirmation_note, notes'

export async function fetchVenueReservationsRange(
  supabase: SupabaseClient,
  venueId: string,
  fromIso: string,
  toIso: string
): Promise<VenueReservationRow[]> {
  const courts = await fetchVenueCourts(supabase, venueId)
  if (!courts.length) return []
  const courtIds = courts.map((c) => c.id)
  const { data, error } = await supabase
    .from('venue_reservations')
    .select(VENUE_RESERVATIONS_RANGE_SELECT)
    .in('court_id', courtIds)
    .lt('starts_at', toIso)
    .gt('ends_at', fromIso)
    .order('starts_at', { ascending: true })
  if (error || !data) return []
  return data.map((r) => mapVenueReservationDbRow(r as Record<string, unknown>))
}

/**
 * Fase 4 — Explorar: canchas, horarios y reservas para muchos centros en 3 queries.
 */
export async function fetchExploreVenueAvailabilityInputsBatch(
  supabase: SupabaseClient,
  venueIds: string[],
  fromIso: string,
  toIso: string
): Promise<{
  courtsByVenue: Map<string, VenueCourt[]>
  hoursByVenue: Map<string, VenueWeeklyHour[]>
  reservationsByVenue: Map<string, VenueReservationRow[]>
}> {
  const uniq = [...new Set(venueIds.filter(Boolean))]
  const courtsByVenue = new Map<string, VenueCourt[]>()
  const hoursByVenue = new Map<string, VenueWeeklyHour[]>()
  const reservationsByVenue = new Map<string, VenueReservationRow[]>()
  for (const id of uniq) {
    courtsByVenue.set(id, [])
    hoursByVenue.set(id, [])
    reservationsByVenue.set(id, [])
  }
  if (uniq.length === 0) {
    return { courtsByVenue, hoursByVenue, reservationsByVenue }
  }

  const [courtsRes, hoursRes] = await Promise.all([
    supabase
      .from('venue_courts')
      .select('id, venue_id, name, sort_order, price_per_hour')
      .in('venue_id', uniq)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('venue_weekly_hours')
      .select('id, venue_id, day_of_week, open_time, close_time')
      .in('venue_id', uniq)
      .order('day_of_week', { ascending: true }),
  ])

  for (const r of courtsRes.data ?? []) {
    const vid = r.venue_id as string
    const list = courtsByVenue.get(vid) ?? []
    list.push({
      id: r.id as string,
      venueId: vid,
      name: r.name as string,
      sortOrder: (r.sort_order as number) ?? 0,
      pricePerHour:
        r.price_per_hour != null ? (r.price_per_hour as number) : null,
    })
    courtsByVenue.set(vid, list)
  }

  for (const r of hoursRes.data ?? []) {
    const vid = r.venue_id as string
    const list = hoursByVenue.get(vid) ?? []
    list.push({
      id: r.id as string,
      venueId: vid,
      dayOfWeek: r.day_of_week as number,
      openTime: (r.open_time as string).slice(0, 5),
      closeTime: (r.close_time as string).slice(0, 5),
    })
    hoursByVenue.set(vid, list)
  }

  const allCourts = [...courtsByVenue.values()].flat()
  const courtIds = allCourts.map((c) => c.id)
  if (courtIds.length === 0) {
    return { courtsByVenue, hoursByVenue, reservationsByVenue }
  }

  const courtToVenue = new Map(allCourts.map((c) => [c.id, c.venueId] as const))

  const { data: resRows, error: resErr } = await supabase
    .from('venue_reservations')
    .select(VENUE_RESERVATIONS_RANGE_SELECT)
    .in('court_id', courtIds)
    .lt('starts_at', toIso)
    .gt('ends_at', fromIso)
    .order('starts_at', { ascending: true })

  if (!resErr && resRows?.length) {
    for (const raw of resRows) {
      const r = raw as Record<string, unknown>
      const courtId = r.court_id as string
      const vid = courtToVenue.get(courtId)
      if (!vid) continue
      const row = mapVenueReservationDbRow(r)
      const list = reservationsByVenue.get(vid) ?? []
      list.push(row)
      reservationsByVenue.set(vid, list)
    }
  }

  return { courtsByVenue, hoursByVenue, reservationsByVenue }
}

export async function fetchSportsVenueContactById(
  supabase: SupabaseClient,
  venueId: string,
  fallbackName: string
): Promise<{ name: string; phone: string | null } | null> {
  const { data } = await supabase
    .from('sports_venues')
    .select('name, phone')
    .eq('id', venueId)
    .maybeSingle()
  if (!data) return null
  return {
    name: (data.name as string) ?? fallbackName,
    phone: ((data.phone as string | null) ?? '').trim() || null,
  }
}

/** RPC pública: ocupación del día para la ficha `/centro/...`. */
export async function fetchVenuePublicReservationsAsRowsForDay(
  supabase: SupabaseClient,
  venueId: string,
  day: Date
): Promise<VenueReservationRow[]> {
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(day)
  end.setHours(23, 59, 59, 999)
  const { data, error } = await supabase.rpc('venue_public_reservations_in_range', {
    p_venue_id: venueId,
    p_from: start.toISOString(),
    p_to: end.toISOString(),
  })
  if (error || !data) return []
  const rows = data as { court_id: string; starts_at: string; ends_at: string }[]
  return rows.map((r) => ({
    id: `${r.court_id}-${r.starts_at}`,
    courtId: r.court_id,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
    bookerUserId: null,
    matchOpportunityId: null,
    status: 'confirmed' as const,
  }))
}
