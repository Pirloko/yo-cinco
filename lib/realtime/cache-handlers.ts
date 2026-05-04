/**
 * Handlers de merge para Realtime del jugador (Fase 7).
 * Evitan refetch masivo: combinan listas en memoria + escritura en TanStack Query como espejo.
 *
 * Planificación WAL → `foldMatchRealtimeBatch` en `realtime-decision-engine` (única fuente).
 */
import type { QueryClient } from '@tanstack/react-query'
import type { MatchOpportunity, RivalChallenge } from '@/lib/types'
import { queryKeys } from '@/lib/query-keys'
import type { PlayerMatchBundle } from '@/lib/services/match.service'
import { foldMatchRealtimeBatch } from '@/lib/architecture/realtime-decision-engine'

export type { MatchRealtimeRowEvent } from '@/lib/architecture/realtime-types'

/** @deprecated usar `foldMatchRealtimeBatch` — alias retrocompatible */
export const reduceMatchRealtimeEvents = foldMatchRealtimeBatch

export function mergeMatchOpportunitiesAfterFetch(params: {
  previous: MatchOpportunity[]
  deletedIds: Set<string>
  upsert: MatchOpportunity[]
  requestedIds: Set<string>
}): MatchOpportunity[] {
  const { previous, deletedIds, upsert, requestedIds } = params
  const map = new Map(previous.map((o) => [o.id, o]))
  for (const id of deletedIds) {
    map.delete(id)
  }
  for (const row of upsert) {
    map.set(row.id, row)
  }
  for (const id of requestedIds) {
    if (!upsert.some((r) => r.id === id)) {
      map.delete(id)
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.dateTime.getTime() - b.dateTime.getTime()
  )
}

export function mergeRivalChallengesAfterFetch(params: {
  previous: RivalChallenge[]
  deletedIds: Set<string>
  upsert: RivalChallenge[]
}): RivalChallenge[] {
  const { previous, deletedIds, upsert } = params
  const map = new Map(previous.map((c) => [c.id, c]))
  for (const id of deletedIds) {
    map.delete(id)
  }
  for (const row of upsert) {
    map.set(row.id, row)
  }
  return Array.from(map.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
}

export function writePlayerMatchBundleQueryCache(
  queryClient: QueryClient,
  userId: string,
  bundle: PlayerMatchBundle
): void {
  queryClient.setQueryData(queryKeys.playerSession.matchBundle(userId), bundle)
}
