import type { QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { queryKeys } from '@/lib/query-keys'
import { DEFAULT_AVATAR } from '@/lib/supabase/mappers'
import type { EncounterLineupRole, PickTeamSide } from '@/lib/types'
import {
  fetchParticipantsForOpportunity,
  type OpportunityParticipantRow,
} from '@/lib/supabase/message-queries'

function parsePickTeam(raw: unknown): PickTeamSide | undefined {
  if (raw === 'A' || raw === 'B') return raw
  return undefined
}

function parseEncounterLineupRole(
  raw: unknown
): EncounterLineupRole | undefined {
  if (
    raw === 'gk' ||
    raw === 'defensa' ||
    raw === 'mediocampista' ||
    raw === 'delantero'
  ) {
    return raw
  }
  return undefined
}

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
): Promise<{ name: string; photo: string; whatsappPhone: string | null }> {
  const { data } = await supabase
    .from('profiles')
    .select('name, photo_url, whatsapp_phone')
    .eq('id', userId)
    .maybeSingle()
  return {
    name: (data?.name as string)?.trim() || 'Jugador',
    photo: (data?.photo_url as string)?.trim() || DEFAULT_AVATAR,
    whatsappPhone: (data?.whatsapp_phone as string | null | undefined) ?? null,
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
    const pickTeam = parsePickTeam(row.pick_team)
    const encounterLineupRole = parseEncounterLineupRole(
      row.encounter_lineup_role
    )

    if (cid && userId === cid) {
      const idx = findCreatorIndex()
      if (idx < 0) return 'refetch'
      next[idx] = {
        ...next[idx],
        isGoalkeeper: isGk,
        pickTeam: pickTeam ?? next[idx].pickTeam,
        encounterLineupRole: encounterLineupRole ?? next[idx].encounterLineupRole,
      }
      continue
    }

    const existingIdx = next.findIndex((p) => p.id === userId)
    if (existingIdx >= 0) {
      const cur = next[existingIdx]
      if (cur.status === 'creator') {
        next[existingIdx] = {
          ...cur,
          isGoalkeeper: isGk,
          pickTeam: pickTeam ?? cur.pickTeam,
          encounterLineupRole: encounterLineupRole ?? cur.encounterLineupRole,
        }
      } else {
        next[existingIdx] = {
          ...cur,
          status,
          isGoalkeeper: isGk,
          pickTeam: pickTeam ?? cur.pickTeam,
          encounterLineupRole: encounterLineupRole ?? cur.encounterLineupRole,
          cancelledReason: null,
        }
      }
      continue
    }

    if (ev.eventType === 'INSERT' || ev.eventType === 'UPDATE') {
      const { name, photo, whatsappPhone } = await fetchProfileBasics(
        supabase,
        userId
      )
      next.push({
        id: userId,
        name,
        photo,
        whatsappPhone,
        status,
        isGoalkeeper: isGk,
        pickTeam,
        encounterLineupRole,
        cancelledReason: null,
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
