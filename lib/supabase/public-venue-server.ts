import { createClient } from '@supabase/supabase-js'
import { isValidTeamInviteId } from '@/lib/team-invite-url'
import { mapVenueRow } from '@/lib/supabase/venue-queries'
import type { SportsVenue, VenueCourt, VenueWeeklyHour } from '@/lib/types'

export type PublicVenuePageData = {
  venue: SportsVenue
  courts: VenueCourt[]
  weeklyHours: VenueWeeklyHour[]
}

/** SSR: metadata y datos públicos del centro (políticas SELECT anon). */
export async function fetchPublicVenuePageData(
  venueId: string
): Promise<PublicVenuePageData | null> {
  if (!isValidTeamInviteId(venueId)) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: row, error: vErr } = await supabase
    .from('sports_venues')
    .select('*')
    .eq('id', venueId)
    .maybeSingle()

  if (vErr || !row) return null

  const venue = mapVenueRow(row as Record<string, unknown>)

  const [{ data: courtsRaw }, { data: hoursRaw }] = await Promise.all([
    supabase
      .from('venue_courts')
      .select('*')
      .eq('venue_id', venueId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('venue_weekly_hours')
      .select('*')
      .eq('venue_id', venueId)
      .order('day_of_week', { ascending: true }),
  ])

  const courts: VenueCourt[] = (courtsRaw ?? []).map((r) => ({
    id: r.id as string,
    venueId: r.venue_id as string,
    name: r.name as string,
    sortOrder: (r.sort_order as number) ?? 0,
  }))

  const weeklyHours: VenueWeeklyHour[] = (hoursRaw ?? []).map((r) => ({
    id: r.id as string,
    venueId: r.venue_id as string,
    dayOfWeek: r.day_of_week as number,
    openTime: (r.open_time as string).slice(0, 5),
    closeTime: (r.close_time as string).slice(0, 5),
  }))

  return { venue, courts, weeklyHours }
}
