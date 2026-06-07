import type { SupabaseClient } from '@supabase/supabase-js'
import type { LastMessagePreview } from '@/lib/supabase/message-queries'
import { fetchLastMessagesForOpportunities } from '@/lib/supabase/message-queries'
import type { RatingSummary } from '@/lib/supabase/rating-queries'
import {
  fetchRatingSummariesForOpportunities,
  mapRatingPartialRowsToSummariesMap,
  type RatingPartialRow,
} from '@/lib/supabase/rating-queries'
import type { SoloVenueReviewSummary } from '@/lib/supabase/venue-review-queries'
import { fetchVenueReviewsByReservationIds } from '@/lib/supabase/venue-review-queries'
import { MAX_HUB_SECONDARY_IDS } from '@/lib/architecture/limits'

function capHubIdList(ids: string[]): string[] {
  if (ids.length <= MAX_HUB_SECONDARY_IDS) return ids
  return ids.slice(0, MAX_HUB_SECONDARY_IDS)
}

/**
 * Fase 4: hub Partidos — preferir RPC `matches_hub_secondary_bundle` (1 HTTP);
 * si falla (migración no aplicada), Promise.all de 3 lecturas.
 */
export type MatchesHubSecondaryBundle = {
  ratingByOpp: Map<string, RatingSummary>
  lastByOpp: Map<string, LastMessagePreview>
  venueReviewByReservationId: Map<string, SoloVenueReviewSummary>
}

type HubRpcRow = {
  rating_rows?: unknown
  last_messages?: unknown
  venue_reviews?: unknown
}

function parseVenueReviewsJson(rows: unknown): Map<string, SoloVenueReviewSummary> {
  const out = new Map<string, SoloVenueReviewSummary>()
  if (!Array.isArray(rows)) return out
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const id = r.venue_reservation_id as string
    if (!id) continue
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

function parseLastMessagesJson(rows: unknown): Map<string, LastMessagePreview> {
  const out = new Map<string, LastMessagePreview>()
  if (!Array.isArray(rows)) return out
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const oid = r.opportunity_id as string
    if (!oid || typeof r.content !== 'string' || !r.created_at) continue
    out.set(oid, {
      opportunityId: oid,
      content: r.content,
      createdAt: new Date(r.created_at as string),
    })
  }
  return out
}

function parseHubRpcPayload(
  data: unknown,
  finishedIds: string[]
): MatchesHubSecondaryBundle | null {
  if (!data || typeof data !== 'object') return null
  const d = data as HubRpcRow
  const ratingArr = Array.isArray(d.rating_rows) ? d.rating_rows : []
  const ratingRows: RatingPartialRow[] = []
  for (const raw of ratingArr) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const oid = r.opportunity_id as string
    if (!oid) continue
    ratingRows.push({
      opportunity_id: oid,
      venue_rating: (r.venue_rating as number | null) ?? null,
      match_rating: Number(r.match_rating),
      level_rating: Number(r.level_rating),
      mvp_user_id: (r.mvp_user_id as string | null) ?? null,
      organizer_rating: (r.organizer_rating as number | null) ?? null,
    })
  }
  const ratingByOpp = mapRatingPartialRowsToSummariesMap(finishedIds, ratingRows)
  const lastByOpp = parseLastMessagesJson(d.last_messages)
  const venueReviewByReservationId = parseVenueReviewsJson(d.venue_reviews)
  return { ratingByOpp, lastByOpp, venueReviewByReservationId }
}

async function fetchMatchesHubSecondaryBundleViaRest(
  supabase: SupabaseClient,
  args: {
    finishedOpportunityIds: string[]
    activeChatOpportunityIds: string[]
    pastSoloReservationIds: string[]
  }
): Promise<MatchesHubSecondaryBundle> {
  const [ratingByOpp, lastByOpp, venueReviewByReservationId] = await Promise.all([
    fetchRatingSummariesForOpportunities(
      supabase,
      args.finishedOpportunityIds
    ),
    fetchLastMessagesForOpportunities(
      supabase,
      args.activeChatOpportunityIds
    ),
    fetchVenueReviewsByReservationIds(
      supabase,
      args.pastSoloReservationIds
    ),
  ])
  return { ratingByOpp, lastByOpp, venueReviewByReservationId }
}

export async function fetchMatchesHubSecondaryBundle(
  supabase: SupabaseClient,
  args: {
    finishedOpportunityIds: string[]
    activeChatOpportunityIds: string[]
    pastSoloReservationIds: string[]
  }
): Promise<MatchesHubSecondaryBundle> {
  const finishedIds = capHubIdList(args.finishedOpportunityIds)
  const chatIds = capHubIdList(args.activeChatOpportunityIds)
  const reservationIds = capHubIdList(args.pastSoloReservationIds)

  const { data, error } = await supabase.rpc('matches_hub_secondary_bundle', {
    p_finished_opp_ids: finishedIds,
    p_chat_opp_ids: chatIds,
    p_reservation_ids: reservationIds,
  })

  if (!error && data != null) {
    const parsed = parseHubRpcPayload(data, finishedIds)
    if (parsed) return parsed
  }

  if (process.env.NODE_ENV === 'development' && error) {
    console.warn(
      '[matches-hub] RPC matches_hub_secondary_bundle no disponible, usando REST:',
      error.message
    )
  }

  return fetchMatchesHubSecondaryBundleViaRest(supabase, {
    finishedOpportunityIds: finishedIds,
    activeChatOpportunityIds: chatIds,
    pastSoloReservationIds: reservationIds,
  })
}
