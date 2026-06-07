import type { SupabaseClient } from '@supabase/supabase-js'
import { tallyMvpVotes, type MvpVoteTally } from '@/lib/match-review-eligibility'

export type MatchOpportunityRatingRow = {
  id: string
  opportunity_id: string
  rater_id: string
  /** Legacy; reseñas nuevas usan venue_rating. */
  organizer_rating?: number | null
  venue_rating: number | null
  match_rating: number
  level_rating: number
  mvp_user_id: string | null
  comment: string | null
  created_at: string
}

export type RatingSummary = {
  opportunityId: string
  count: number
  avgVenue: number | null
  avgMatch: number | null
  avgLevel: number | null
  avgOverall: number | null
  mvpTally: MvpVoteTally[]
}

const RATING_SELECT =
  'id, opportunity_id, rater_id, venue_rating, match_rating, level_rating, mvp_user_id, comment, created_at'

const RATING_PARTIAL_SELECT =
  'opportunity_id, venue_rating, match_rating, level_rating, mvp_user_id'

export async function fetchMyRatingForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string,
  userId: string
): Promise<MatchOpportunityRatingRow | null> {
  const { data, error } = await supabase
    .from('match_opportunity_ratings')
    .select(RATING_SELECT)
    .eq('opportunity_id', opportunityId)
    .eq('rater_id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data as MatchOpportunityRatingRow
}

/**
 * ¿Se pueden enviar mensajes en el chat del partido?
 * - Partidos no finalizados: sí.
 * - Cancelados: no.
 * - Finalizados: solo lectura (el hilo queda como historial; las calificaciones no caducan).
 */
export function isMatchChatMessagingOpen(opp: { status: string }): boolean {
  if (opp.status === 'cancelled') return false
  if (opp.status === 'completed') return false
  return true
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function ratingDimensions(row: MatchOpportunityRatingRow): number[] {
  const venue = row.venue_rating
  if (venue != null) {
    return [venue, row.match_rating, row.level_rating]
  }
  const legacyOrg = row.organizer_rating
  if (legacyOrg != null) {
    return [legacyOrg, row.match_rating, row.level_rating]
  }
  return [row.match_rating, row.level_rating]
}

function buildSummary(
  opportunityId: string,
  rows: MatchOpportunityRatingRow[]
): RatingSummary {
  const count = rows.length
  if (count === 0) {
    return {
      opportunityId,
      count: 0,
      avgVenue: null,
      avgMatch: null,
      avgLevel: null,
      avgOverall: null,
      mvpTally: [],
    }
  }

  const venueVals = rows
    .map((r) => r.venue_rating ?? r.organizer_rating)
    .filter((v): v is number => typeof v === 'number')
  const matchVals = rows.map((r) => r.match_rating)
  const levelVals = rows.map((r) => r.level_rating)
  const overallVals = rows.flatMap((r) => ratingDimensions(r))

  const avg = (vals: number[]) =>
    vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null

  return {
    opportunityId,
    count,
    avgVenue: avg(venueVals),
    avgMatch: avg(matchVals),
    avgLevel: avg(levelVals),
    avgOverall: avg(overallVals),
    mvpTally: tallyMvpVotes(rows.map((r) => r.mvp_user_id)),
  }
}

export async function fetchRatingSummaryForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<RatingSummary> {
  const { data, error } = await supabase
    .from('match_opportunity_ratings')
    .select(RATING_PARTIAL_SELECT)
    .eq('opportunity_id', opportunityId)

  const rows =
    error || !data
      ? []
      : (data as Array<
          Pick<
            MatchOpportunityRatingRow,
            | 'opportunity_id'
            | 'venue_rating'
            | 'match_rating'
            | 'level_rating'
            | 'mvp_user_id'
          >
        >)
  return buildSummary(opportunityId, rows as unknown as MatchOpportunityRatingRow[])
}

/** Filas parciales para agregar resúmenes (RPC bundle / tests). */
export type RatingPartialRow = Pick<
  MatchOpportunityRatingRow,
  | 'opportunity_id'
  | 'venue_rating'
  | 'match_rating'
  | 'level_rating'
  | 'mvp_user_id'
> & {
  organizer_rating?: number | null
}

export function mapRatingPartialRowsToSummariesMap(
  opportunityIds: string[],
  rows: RatingPartialRow[]
): Map<string, RatingSummary> {
  const out = new Map<string, RatingSummary>()
  const grouped = new Map<string, MatchOpportunityRatingRow[]>()
  for (const id of opportunityIds) grouped.set(id, [])
  for (const r of rows) {
    const list = grouped.get(r.opportunity_id)
    if (list) list.push(r as unknown as MatchOpportunityRatingRow)
  }
  for (const [oid, list] of grouped) {
    out.set(oid, buildSummary(oid, list))
  }
  return out
}

export async function fetchRatingSummariesForOpportunities(
  supabase: SupabaseClient,
  opportunityIds: string[]
): Promise<Map<string, RatingSummary>> {
  const out = new Map<string, RatingSummary>()
  if (opportunityIds.length === 0) return out

  const { data, error } = await supabase
    .from('match_opportunity_ratings')
    .select(RATING_PARTIAL_SELECT)
    .in('opportunity_id', opportunityIds)

  const rows =
    error || !data
      ? []
      : (data as Array<
          Pick<
            MatchOpportunityRatingRow,
            | 'opportunity_id'
            | 'venue_rating'
            | 'match_rating'
            | 'level_rating'
            | 'mvp_user_id'
          >
        >)
  return mapRatingPartialRowsToSummariesMap(opportunityIds, rows)
}

export async function fetchRecentRatingCommentsForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string,
  limit = 4
): Promise<Array<{ comment: string; createdAt: Date }>> {
  const { data, error } = await supabase
    .from('match_opportunity_ratings')
    .select('comment, created_at')
    .eq('opportunity_id', opportunityId)
    .not('comment', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data
    .filter((r) => !!r.comment)
    .map((r) => ({
      comment: r.comment as string,
      createdAt: new Date(r.created_at as string),
    }))
}
