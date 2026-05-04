/**
 * Clasificación explícita de entidades para política Realtime + fetch.
 *
 * Principio: payload Realtime ≠ contrato UI. Entidades derivadas siempre vía fetch controlado.
 */

import type { MatchRealtimeRowEvent } from '@/lib/architecture/realtime-types'

/** Filas planas o mergeables en cliente con reglas acotadas (nunca sustituyen vistas enmascaradas). */
export type EntityTierBase = 'base_mergeable'

/** Requieren vista/joins/reglas (`fetchMatchOpportunitiesByIds`, `fetchRivalChallengesByIds`, …). */
export type EntityTierDerived = 'derived_fetch'

/** Agregaciones multi-query o RPC (`playerMatchBundle`, hub secundario, team bundle). */
export type EntityTierAggregated = 'aggregated_bundle'

export type EntityClassificationRecord = {
  tier: EntityTierBase | EntityTierDerived | EntityTierAggregated
  /** Tabla física asociada si aplica */
  table?: string
  notes?: string
}

/** Por tabla Postgres (Realtime). */
export const realtimeTableClassification: Record<
  MatchRealtimeRowEvent['table'],
  EntityClassificationRecord
> = {
  match_opportunities: {
    tier: 'derived_fetch',
    table: 'match_opportunities',
    notes:
      'Contrato UI = match_opportunities_masked + joins; WAL es tabla base — siempre fetch por ids.',
  },
  match_opportunity_participants: {
    tier: 'base_mergeable',
    table: 'match_opportunity_participants',
    notes:
      'Lista global: refresh ids participación; detalle chat/detalle partido: TanStack merge o fetchParticipantsForOpportunity.',
  },
  rival_challenges: {
    tier: 'derived_fetch',
    table: 'rival_challenges',
    notes: 'UI necesita teams + match_opportunities.title — fetchRivalChallengesByIds.',
  },
}

/** Tablas no escuchadas en el canal match pero referenciadas en política. */
export const entityClassificationByName = {
  profiles: {
    tier: 'base_mergeable' as const,
    notes: 'Usuario actual: merge selectivo en Context; lista otros jugadores: batch fetch.',
  },
  messages: {
    tier: 'base_mergeable' as const,
    notes: 'Chat: INSERT → append/invalidate controlado en chat-screen + TanStack.',
  },
  MatchOpportunity: {
    tier: 'derived_fetch' as const,
    notes: 'Siempre desde vista en cliente + enriquecimiento queries.ts.',
  },
  RivalChallenge: {
    tier: 'derived_fetch' as const,
    notes: 'Siempre hidratado rival-challenge-queries.',
  },
  playerMatchBundle: {
    tier: 'aggregated_bundle' as const,
    notes: 'Context + espejo queryKeys.playerSession.matchBundle.',
  },
  teamBundle: {
    tier: 'aggregated_bundle' as const,
    notes: 'loadPlayerTeamBundle — canal team sin cambiar en esta capa.',
  },
  matchesHubSecondary: {
    tier: 'aggregated_bundle' as const,
    notes: 'RPC matches_hub_secondary_bundle + límites MAX_HUB_SECONDARY_IDS.',
  },
} as const
