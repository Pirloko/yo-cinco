/**
 * Unificación Context (estado visual) ↔ TanStack Query (caché de datos externos).
 *
 * - Context: fuente principal para la UI del jugador (listas globales).
 * - Query (`playerSession.matchBundle`): ⚠️ solo espejo sincronizado; no sustituir Context.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'
import type { MatchOpportunity, RivalChallenge } from '@/lib/types'
import type { PlayerMatchBundle } from '@/lib/services/match.service'
import { writePlayerMatchBundleQueryCache } from '@/lib/realtime/cache-handlers'

export type MatchBundleSetters = {
  setMatchOpportunities: Dispatch<SetStateAction<MatchOpportunity[]>>
  setParticipatingOpportunityIds: Dispatch<SetStateAction<string[]>>
  setRivalChallenges: Dispatch<SetStateAction<RivalChallenge[]>>
}

/**
 * Aplica el bundle derivado (post-fetch) al Context y replica en Query.
 */
export function syncPlayerMatchBundleToContextAndCache(params: {
  queryClient: QueryClient
  userId: string
  bundle: PlayerMatchBundle
  setters: MatchBundleSetters
}): void {
  const { bundle, setters, queryClient, userId } = params
  setters.setMatchOpportunities(bundle.matchOpportunities)
  setters.setParticipatingOpportunityIds(bundle.participatingOpportunityIds)
  setters.setRivalChallenges(bundle.rivalChallenges)
  writePlayerMatchBundleQueryCache(queryClient, userId, bundle)
}

/** Alias semántico: participantes viven en TanStack en pantallas detalle/chat (no en este bundle). */
export function syncParticipantsToQuery(): void {
  /* Los participantes se gestionan en use-match-opportunity-participants-realtime + queryKeys.matchOpportunity.participants */
}
