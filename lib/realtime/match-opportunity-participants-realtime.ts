import type { QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { queryKeys } from '@/lib/query-keys'
import { DEFAULT_AVATAR } from '@/lib/supabase/mappers'
import {
  fetchParticipantsForOpportunity,
  type OpportunityParticipantRow,
} from '@/lib/supabase/message-queries'

export type ParticipantsRealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown> | null
  old: Record<string, unknown> | null
}

function parseParticipantStatus(
  raw: unknown
): OpportunityParticipantRow['status'] {
  if (
    raw === 'confirmed' ||
    raw === 'pending' ||
    raw === 'cancelled' ||
    raw === 'invited'
  ) {
    return raw
  }
  return 'pending'
}

async function fetchProfileBasics(
  supabase: SupabaseClient,
  userId: string
): Promise<{ name: string; photo: string }> {
  const { data } = await supabase
    .from('profiles')
    .select('name, photo_url')
    .eq('id', userId)
    .maybeSingle()
  return {
    name: (data?.name as string)?.trim() || 'Jugador',
    photo: (data?.photo_url as string)?.trim() || DEFAULT_AVATAR,
  }
}

/**
 * Aplica un lote de eventos Realtime de `match_opportunity_participants` sobre la
 * caché de TanStack sin invalidateQueries (Fase 5). Si no hay caché utilizable o
 * el payload no es seguro de fusionar, devuelve `refetch` y el caller debe
 * invalidar o llamar a `fetchParticipantsForOpportunity` + setQueryData.
 */
export async function applyMatchOpportunityParticipantsRealtime(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  opportunityId: string,
  creatorId: string | null | undefined,
  batch: ParticipantsRealtimePayload[]
): Promise<'ok' | 'refetch'> {
  if (batch.length === 0) return 'ok'

  const key = queryKeys.matchOpportunity.participants(opportunityId)
  const prev = queryClient.getQueryData<OpportunityParticipantRow[]>(key)
  if (!prev || prev.length === 0) return 'refetch'

  const cid = creatorId ?? null
  let next = [...prev]

  const findCreatorIndex = () =>
    cid ? next.findIndex((p) => p.id === cid && p.status === 'creator') : -1

  for (const ev of batch) {
    if (ev.eventType === 'DELETE') {
      const userId = ev.old?.user_id
      if (typeof userId !== 'string') return 'refetch'
      if (cid && userId === cid) {
        const idx = findCreatorIndex()
        if (idx < 0) return 'refetch'
        next[idx] = { ...next[idx], isGoalkeeper: false }
        continue
      }
      next = next.filter((p) => p.id !== userId)
      continue
    }

    const row = ev.new
    if (!row) return 'refetch'
    const userId = row.user_id
    if (typeof userId !== 'string') return 'refetch'
    const status = parseParticipantStatus(row.status)
    const isGk = row.is_goalkeeper === true

    if (cid && userId === cid) {
      const idx = findCreatorIndex()
      if (idx < 0) return 'refetch'
      next[idx] = { ...next[idx], isGoalkeeper: isGk }
      continue
    }

    const existingIdx = next.findIndex((p) => p.id === userId)
    if (existingIdx >= 0) {
      const cur = next[existingIdx]
      if (cur.status === 'creator') {
        next[existingIdx] = { ...cur, isGoalkeeper: isGk }
      } else {
        next[existingIdx] = {
          ...cur,
          status,
          isGoalkeeper: isGk,
        }
      }
      continue
    }

    if (ev.eventType === 'INSERT' || ev.eventType === 'UPDATE') {
      const { name, photo } = await fetchProfileBasics(supabase, userId)
      next.push({
        id: userId,
        name,
        photo,
        status,
        isGoalkeeper: isGk,
      })
      continue
    }
  }

  queryClient.setQueryData(key, next)
  return 'ok'
}

/** Un round-trip coherente con el fetch normal de participantes (fallback). */
export async function replaceParticipantsCacheFromServer(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  opportunityId: string
): Promise<void> {
  const rows = await fetchParticipantsForOpportunity(supabase, opportunityId)
  queryClient.setQueryData(
    queryKeys.matchOpportunity.participants(opportunityId),
    rows
  )
}
