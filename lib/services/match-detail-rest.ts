import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchMyRatingForOpportunity,
  fetchRatingSummaryForOpportunity,
  fetchRecentRatingCommentsForOpportunity,
  type MatchOpportunityRatingRow,
  type RatingSummary,
} from '@/lib/supabase/rating-queries'

export type MatchDetailRatingsBlock = {
  summary: RatingSummary
  comments: Array<{ comment: string; createdAt: Date }>
  myRating: MatchOpportunityRatingRow | null
}

/** Fallback REST (3 lecturas en paralelo) si el RPC no existe. */
export async function fetchMatchDetailRatingsBlockViaRest(
  supabase: SupabaseClient,
  opportunityId: string,
  userId: string
): Promise<MatchDetailRatingsBlock> {
  const [summary, comments, myRating] = await Promise.all([
    fetchRatingSummaryForOpportunity(supabase, opportunityId),
    fetchRecentRatingCommentsForOpportunity(supabase, opportunityId),
    fetchMyRatingForOpportunity(supabase, opportunityId, userId),
  ])
  return { summary, comments, myRating }
}
