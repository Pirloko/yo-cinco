import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicVenueReviewSnippet, PublicVenueReviewStats } from '@/lib/types'

export type SoloVenueReviewSummary = {
  venueReservationId: string
  courtQuality: number
  managementRating: number
  facilitiesRating: number
  comment: string | null
}

function mapReviewRow(r: Record<string, unknown>): PublicVenueReviewSnippet {
  return {
    id: r.id as string,
    courtQuality: Number(r.court_quality),
    managementRating: Number(r.management_rating),
    facilitiesRating: Number(r.facilities_rating),
    comment: (r.comment as string | null) ?? null,
    reviewerNameSnapshot: String(r.reviewer_name_snapshot ?? '').trim() || 'Jugador',
    createdAt: new Date(r.created_at as string),
  }
}

export function mapStatsRow(
  row: Record<string, unknown> | null | undefined
): PublicVenueReviewStats | null {
  if (!row) return null
  const n = (k: string) => Number(row[k])
  const count = Number(row.review_count)
  if (!Number.isFinite(count) || count < 1) return null
  return {
    reviewCount: count,
    avgCourtQuality: n('avg_court_quality'),
    avgManagement: n('avg_management'),
    avgFacilities: n('avg_facilities'),
    avgOverall: n('avg_overall'),
  }
}

export async function fetchVenueReviewsByReservationIds(
  supabase: SupabaseClient,
  reservationIds: string[]
): Promise<Map<string, SoloVenueReviewSummary>> {
  const out = new Map<string, SoloVenueReviewSummary>()
  if (reservationIds.length === 0) return out
  const { data, error } = await supabase
    .from('sports_venue_reviews')
    .select(
      'venue_reservation_id, court_quality, management_rating, facilities_rating, comment'
    )
    .in('venue_reservation_id', reservationIds)
  if (error || !data?.length) return out
  for (const r of data) {
    const id = r.venue_reservation_id as string
    out.set(id, {
      venueReservationId: id,
      courtQuality: Number(r.court_quality),
      managementRating: Number(r.management_rating),
      facilitiesRating: Number(r.facilities_rating),
      comment: (r.comment as string | null) ?? null,
    })
  }
  return out
}

export async function fetchPublicVenueReviewStats(
  supabase: SupabaseClient,
  venueId: string
): Promise<PublicVenueReviewStats | null> {
  const { data, error } = await supabase
    .from('sports_venue_review_stats')
    .select('*')
    .eq('venue_id', venueId)
    .maybeSingle()
  if (error || !data) return null
  return mapStatsRow(data as Record<string, unknown>)
}

export async function fetchPublicVenueReviewsForPage(
  supabase: SupabaseClient,
  venueId: string,
  limit = 12
): Promise<PublicVenueReviewSnippet[]> {
  const { data, error } = await supabase
    .from('sports_venue_reviews')
    .select(
      'id, court_quality, management_rating, facilities_rating, comment, reviewer_name_snapshot, created_at'
    )
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data?.length) return []
  return data.map((r) => mapReviewRow(r as Record<string, unknown>))
}

export type InsertSportsVenueReviewInput = {
  venueId: string
  venueReservationId: string
  reviewerId: string
  courtQuality: number
  managementRating: number
  facilitiesRating: number
  comment: string | null
  reviewerNameSnapshot: string
}

export async function insertSportsVenueReview(
  supabase: SupabaseClient,
  input: InsertSportsVenueReviewInput
): Promise<{ error: string | null }> {
  const snap = input.reviewerNameSnapshot.trim().slice(0, 80)
  if (snap.length < 1) {
    return { error: 'Indica cómo quieres figurar como autor de la opinión.' }
  }
  const { error } = await supabase.from('sports_venue_reviews').insert({
    venue_id: input.venueId,
    venue_reservation_id: input.venueReservationId,
    reviewer_id: input.reviewerId,
    court_quality: input.courtQuality,
    management_rating: input.managementRating,
    facilities_rating: input.facilitiesRating,
    comment: input.comment,
    reviewer_name_snapshot: snap,
  })
  if (error) return { error: error.message }
  return { error: null }
}
