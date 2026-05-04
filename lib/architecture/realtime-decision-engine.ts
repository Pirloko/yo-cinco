/**
 * Motor central: Realtime es señal; esta capa decide fetch vs merge vs ignorar.
 */
import type { MatchRealtimeRowEvent } from '@/lib/architecture/realtime-types'

export type RealtimeStrategy = 'MERGE' | 'FETCH_BY_IDS' | 'INVALIDATE' | 'IGNORE'

export type RealtimeDecisionTarget =
  | 'matchOpportunities'
  | 'participatingOpportunityIds'
  | 'rivalChallenges'
  | 'profilesCurrentUser'
  | 'profilesOtherPlayers'

export type RealtimeDecision = {
  strategy: RealtimeStrategy
  target: RealtimeDecisionTarget
  ids?: string[]
}

function rtDevLog(tag: string, msg: string, data?: unknown) {
  if (process.env.NODE_ENV !== 'development') return
  if (data !== undefined) {
    console.debug(`[${tag}]`, msg, data)
  } else {
    console.debug(`[${tag}]`, msg)
  }
}

/**
 * Decisión documental por **un** evento WAL (estrategia esperada).
 */
export function handleRealtimeEvent(ev: MatchRealtimeRowEvent): RealtimeDecision {
  if (ev.table === 'match_opportunities') {
    const id =
      ev.eventType === 'DELETE'
        ? typeof ev.old?.id === 'string'
          ? ev.old.id
          : undefined
        : typeof ev.new?.id === 'string'
          ? ev.new.id
          : undefined
    return {
      strategy: ev.eventType === 'DELETE' ? 'INVALIDATE' : 'FETCH_BY_IDS',
      target: 'matchOpportunities',
      ids: id ? [id] : [],
    }
  }

  if (ev.table === 'match_opportunity_participants') {
    const oid =
      (typeof ev.new?.opportunity_id === 'string'
        ? ev.new.opportunity_id
        : null) ??
      (typeof ev.old?.opportunity_id === 'string' ? ev.old.opportunity_id : null)
    return {
      strategy: 'FETCH_BY_IDS',
      target: 'participatingOpportunityIds',
      ids: oid ? [oid] : [],
    }
  }

  if (ev.table === 'rival_challenges') {
    const id =
      ev.eventType === 'DELETE'
        ? typeof ev.old?.id === 'string'
          ? ev.old.id
          : undefined
        : typeof ev.new?.id === 'string'
          ? ev.new.id
          : undefined
    return {
      strategy: ev.eventType === 'DELETE' ? 'INVALIDATE' : 'FETCH_BY_IDS',
      target: 'rivalChallenges',
      ids: id ? [id] : [],
    }
  }

  return { strategy: 'IGNORE', target: 'matchOpportunities' }
}

export type MatchRealtimeFetchPlan = {
  deletedOpportunityIds: Set<string>
  opportunityIdsToFetch: Set<string>
  challengeIdsToFetch: Set<string>
  deletedChallengeIds: Set<string>
  refreshParticipatingIds: boolean
}

/**
 * Plan único de trabajo para un lote de eventos (orden FIFO del array).
 */
export function foldMatchRealtimeBatch(
  events: MatchRealtimeRowEvent[]
): MatchRealtimeFetchPlan {
  const deletedOpportunityIds = new Set<string>()
  const opportunityIdsToFetch = new Set<string>()
  const challengeIdsToFetch = new Set<string>()
  const deletedChallengeIds = new Set<string>()
  let refreshParticipatingIds = false

  for (const ev of events) {
    const decision = handleRealtimeEvent(ev)
    rtDevLog('REALTIME_ENGINE', `${ev.table}:${ev.eventType}`, decision)

    if (ev.table === 'match_opportunities') {
      if (ev.eventType === 'DELETE') {
        const id =
          typeof ev.old?.id === 'string' ? ev.old.id : null
        if (id) {
          deletedOpportunityIds.add(id)
          opportunityIdsToFetch.delete(id)
          rtDevLog('INVALIDATE_TRIGGERED', 'local remove opportunity id', id)
        }
      } else {
        const id =
          typeof ev.new?.id === 'string' ? ev.new.id : null
        if (id) {
          deletedOpportunityIds.delete(id)
          opportunityIdsToFetch.add(id)
          rtDevLog('FETCH_BY_IDS', 'match_opportunities row', id)
        }
      }
      continue
    }

    if (ev.table === 'match_opportunity_participants') {
      refreshParticipatingIds = true
      const oid =
        (typeof ev.new?.opportunity_id === 'string'
          ? ev.new.opportunity_id
          : null) ??
        (typeof ev.old?.opportunity_id === 'string'
          ? ev.old.opportunity_id
          : null)
      if (oid) {
        opportunityIdsToFetch.add(oid)
        rtDevLog('FETCH_BY_IDS', 'participants → opportunity refresh', oid)
      }
      continue
    }

    if (ev.table === 'rival_challenges') {
      if (ev.eventType === 'DELETE') {
        const id =
          typeof ev.old?.id === 'string' ? ev.old.id : null
        if (id) {
          deletedChallengeIds.add(id)
          challengeIdsToFetch.delete(id)
          rtDevLog('INVALIDATE_TRIGGERED', 'rival_challenge remove', id)
        }
      } else {
        const id =
          typeof ev.new?.id === 'string' ? ev.new.id : null
        if (id) {
          deletedChallengeIds.delete(id)
          challengeIdsToFetch.add(id)
          rtDevLog('FETCH_BY_IDS', 'rival_challenges row', id)
        }
      }
    }
  }

  for (const id of deletedOpportunityIds) {
    opportunityIdsToFetch.delete(id)
  }

  if (
    deletedOpportunityIds.size ||
    opportunityIdsToFetch.size ||
    challengeIdsToFetch.size ||
    deletedChallengeIds.size ||
    refreshParticipatingIds
  ) {
    rtDevLog('MERGE_SAFE', 'plan ready', {
      deletedOpp: [...deletedOpportunityIds],
      fetchOpp: [...opportunityIdsToFetch],
      fetchCh: [...challengeIdsToFetch],
      deletedCh: [...deletedChallengeIds],
      refreshPart: refreshParticipatingIds,
    })
  }

  return {
    deletedOpportunityIds,
    opportunityIdsToFetch,
    challengeIdsToFetch,
    deletedChallengeIds,
    refreshParticipatingIds,
  }
}
