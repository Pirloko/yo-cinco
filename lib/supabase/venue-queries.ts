import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SportsVenue,
  VenueCourt,
  VenueReservationRow,
  VenueWeeklyHour,
} from '@/lib/types'

export function mapVenueRow(r: Record<string, unknown>): SportsVenue {
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    name: r.name as string,
    address: (r.address as string) ?? '',
    mapsUrl: (r.maps_url as string | null) ?? null,
    phone: (r.phone as string) ?? '',
    city: (r.city as string) ?? 'Rancagua',
    slotDurationMinutes: (r.slot_duration_minutes as number) ?? 60,
    createdAt: new Date(r.created_at as string),
  }
}

export async function fetchSportsVenuesList(
  supabase: SupabaseClient
): Promise<SportsVenue[]> {
  const { data, error } = await supabase
    .from('sports_venues')
    .select('*')
    .order('name', { ascending: true })
  if (error || !data?.length) return []
  return data.map((r) => mapVenueRow(r as Record<string, unknown>))
}

export async function fetchVenueById(
  supabase: SupabaseClient,
  venueId: string
): Promise<SportsVenue | null> {
  const { data, error } = await supabase
    .from('sports_venues')
    .select('*')
    .eq('id', venueId)
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
    .select('*')
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
    .select('*')
    .eq('venue_id', venueId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    venueId: r.venue_id as string,
    name: r.name as string,
    sortOrder: (r.sort_order as number) ?? 0,
  }))
}

export async function fetchVenueWeeklyHours(
  supabase: SupabaseClient,
  venueId: string
): Promise<VenueWeeklyHour[]> {
  const { data, error } = await supabase
    .from('venue_weekly_hours')
    .select('*')
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

/** Reservas “solo cancha” del jugador (sin partido vinculado), aún vigentes desde `fromEndsAtIso`. */
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
}

export async function fetchPlayerUpcomingVenueReservationsOnly(
  supabase: SupabaseClient,
  bookerUserId: string,
  fromEndsAtIso: string
): Promise<PlayerVenueReservationListItem[]> {
  const { data: rows, error } = await supabase
    .from('venue_reservations')
    .select('id, court_id, starts_at, ends_at, status, payment_status')
    .eq('booker_user_id', bookerUserId)
    .is('match_opportunity_id', null)
    .in('status', ['pending', 'confirmed'])
    .gte('ends_at', fromEndsAtIso)
    .order('starts_at', { ascending: true })

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
    .select('id, name, city')
    .in('id', venueIds)
  const venueMap = new Map((venues ?? []).map((v) => [v.id as string, v]))

  return rows.map((r) => {
    const c = courtMap.get(r.court_id as string)
    const v = c ? venueMap.get(c.venue_id as string) : undefined
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
      venueCity: (v?.city as string) ?? '',
    }
  })
}

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
    .select('*')
    .in('court_id', courtIds)
    .lt('starts_at', toIso)
    .gt('ends_at', fromIso)
    .order('starts_at', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({
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
  }))
}
