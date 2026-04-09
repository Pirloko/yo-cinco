import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { isValidTeamInviteId } from '@/lib/team-invite-url'
import { CACHE_REVALIDATE_SECONDS } from '@/lib/cache-policy'
import { SPORTS_VENUE_SELECT_WITH_GEO } from '@/lib/supabase/geo-queries'
import { mapVenueRow } from '@/lib/supabase/venue-queries'
import {
  fetchPublicVenueReviewStats,
  fetchPublicVenueReviewsForPage,
} from '@/lib/supabase/venue-review-queries'
import type {
  PublicVenueReviewSnippet,
  PublicVenueReviewStats,
  SportsVenue,
  VenueCourt,
  VenueWeeklyHour,
} from '@/lib/types'

export type PublicVenuePageData = {
  venue: SportsVenue
  courts: VenueCourt[]
  weeklyHours: VenueWeeklyHour[]
  reviewStats: PublicVenueReviewStats | null
  recentReviews: PublicVenueReviewSnippet[]
}

/** SSR: metadata y datos públicos del centro (políticas SELECT anon). */
async function fetchPublicVenuePageDataUncached(
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
    .select(SPORTS_VENUE_SELECT_WITH_GEO)
    .eq('id', venueId)
    .eq('is_paused', false)
    .maybeSingle()

  if (vErr || !row) return null

  const venue = mapVenueRow(row as Record<string, unknown>)

  const [{ data: courtsRaw }, { data: hoursRaw }, reviewStats, recentReviews] =
    await Promise.all([
      supabase
        .from('venue_courts')
        .select('id, venue_id, name, sort_order, price_per_hour')
        .eq('venue_id', venueId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('venue_weekly_hours')
        .select('id, venue_id, day_of_week, open_time, close_time')
        .eq('venue_id', venueId)
        .order('day_of_week', { ascending: true }),
      fetchPublicVenueReviewStats(supabase, venueId),
      fetchPublicVenueReviewsForPage(supabase, venueId, 12),
    ])

  const courts: VenueCourt[] = (courtsRaw ?? []).map((r) => ({
    id: r.id as string,
    venueId: r.venue_id as string,
    name: r.name as string,
    sortOrder: (r.sort_order as number) ?? 0,
    pricePerHour:
      r.price_per_hour != null ? (r.price_per_hour as number) : null,
  }))

  const weeklyHours: VenueWeeklyHour[] = (hoursRaw ?? []).map((r) => ({
    id: r.id as string,
    venueId: r.venue_id as string,
    dayOfWeek: r.day_of_week as number,
    openTime: (r.open_time as string).slice(0, 5),
    closeTime: (r.close_time as string).slice(0, 5),
  }))

  return { venue, courts, weeklyHours, reviewStats, recentReviews }
}

const fetchPublicVenuePageDataCached = unstable_cache(
  async (venueId: string) => fetchPublicVenuePageDataUncached(venueId),
  ['public-venue-page-data-v1'],
  { revalidate: CACHE_REVALIDATE_SECONDS.publicStatic }
)

export async function fetchPublicVenuePageData(
  venueId: string
): Promise<PublicVenuePageData | null> {
  return fetchPublicVenuePageDataCached(venueId)
}
