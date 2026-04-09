import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatchOpportunityRatingRow } from '@/lib/supabase/rating-queries'
import { mapRatingPartialRowsToSummariesMap } from '@/lib/supabase/rating-queries'
import {
  fetchMatchDetailRatingsBlockViaRest,
  type MatchDetailRatingsBlock,
} from '@/lib/services/match-detail-rest'

export type { MatchDetailRatingsBlock }

/**
 * Fase 4: preferir RPC `match_detail_ratings_bundle` (1 HTTP); fallback a 3 lecturas.
 */
export async function fetchMatchDetailRatingsBlock(
  supabase: SupabaseClient,
  opportunityId: string,
  userId: string
): Promise<MatchDetailRatingsBlock> {
  const { data, error } = await supabase.rpc('match_detail_ratings_bundle', {
    p_opportunity_id: opportunityId,
  })

  if (!error && data != null && typeof data === 'object') {
    const parsed = parseDetailRatingsRpc(data, opportunityId)
    if (parsed) return parsed
  }

  if (process.env.NODE_ENV === 'development' && error) {
    console.warn(
      '[match-detail] RPC match_detail_ratings_bundle no disponible, usando REST:',
      error.message
    )
  }

  return fetchMatchDetailRatingsBlockViaRest(supabase, opportunityId, userId)
}

function parseDetailRatingsRpc(
  data: unknown,
  opportunityId: string
): MatchDetailRatingsBlock | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const ratingArr = Array.isArray(d.rating_rows) ? d.rating_rows : []
  const rows = ratingArr
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null
      const r = raw as Record<string, unknown>
      return {
        opportunity_id: (r.opportunity_id as string) ?? opportunityId,
        organizer_rating: (r.organizer_rating as number | null) ?? null,
        match_rating: Number(r.match_rating),
        level_rating: Number(r.level_rating),
      }
    })
    .filter(Boolean) as Array<{
    opportunity_id: string
    organizer_rating: number | null
    match_rating: number
    level_rating: number
  }>

  const summaryMap = mapRatingPartialRowsToSummariesMap([opportunityId], rows)
  const summary = summaryMap.get(opportunityId)
  if (!summary) return null

  const commentsRaw = Array.isArray(d.comments) ? d.comments : []
  const comments: Array<{ comment: string; createdAt: Date }> = []
  for (const raw of commentsRaw) {
    if (!raw || typeof raw !== 'object') continue
    const c = raw as Record<string, unknown>
    if (typeof c.comment !== 'string' || !c.created_at) continue
    comments.push({
      comment: c.comment,
      createdAt: new Date(c.created_at as string),
    })
  }

  let myRating: MatchOpportunityRatingRow | null = null
  const mr = d.my_rating
  if (mr && typeof mr === 'object') {
    const r = mr as Record<string, unknown>
    if (r.id && r.opportunity_id && r.rater_id) {
      myRating = {
        id: r.id as string,
        opportunity_id: r.opportunity_id as string,
        rater_id: r.rater_id as string,
        organizer_rating: (r.organizer_rating as number | null) ?? null,
        match_rating: Number(r.match_rating),
        level_rating: Number(r.level_rating),
        comment: (r.comment as string | null) ?? null,
        created_at: r.created_at as string,
      }
    }
  }

  return { summary, comments, myRating }
}
