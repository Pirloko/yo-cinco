import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatchOpportunity, RivalChallenge } from '@/lib/types'
import { fetchMatchOpportunities, fetchOtherProfiles } from '@/lib/supabase/queries'
import { fetchParticipatingOpportunityIds } from '@/lib/supabase/message-queries'
import { fetchRivalChallengesForUser } from '@/lib/supabase/rival-challenge-queries'

export type PlayerMatchBundle = {
  matchOpportunities: MatchOpportunity[]
  participatingOpportunityIds: string[]
  rivalChallenges: RivalChallenge[]
}

export async function loadPlayerMatchBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<PlayerMatchBundle> {
  const [matchOpportunities, participatingOpportunityIds, rivalChallenges] =
    await Promise.all([
      fetchMatchOpportunities(supabase),
      fetchParticipatingOpportunityIds(supabase, userId),
      fetchRivalChallengesForUser(supabase, userId),
    ])
  return { matchOpportunities, participatingOpportunityIds, rivalChallenges }
}

export async function fetchLatestMatchOpportunities(
  supabase: SupabaseClient
): Promise<MatchOpportunity[]> {
  return fetchMatchOpportunities(supabase)
}

export async function loadOtherProfilesForPlayer(
  supabase: SupabaseClient,
  userId: string,
  gender: 'male' | 'female'
) {
  return fetchOtherProfiles(supabase, userId, gender)
}
