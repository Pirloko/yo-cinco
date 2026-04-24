import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { EncounterLineupRole, PickTeamSide } from '@/lib/types'
import { DEFAULT_AVATAR } from '@/lib/supabase/mappers'

export async function fetchParticipatingOpportunityIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select('opportunity_id')
    .eq('user_id', userId)
    /** Misma regla que `can_access_opportunity_thread` (mensajes). */
    .in('status', ['pending', 'confirmed'])

  return [
    ...new Set(
      (parts ?? []).map((p) => p.opportunity_id as string)
    ),
  ]
}

export async function fetchInvitedOpportunityIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select('opportunity_id')
    .eq('user_id', userId)
    .eq('status', 'invited')

  return [...new Set((parts ?? []).map((p) => p.opportunity_id as string))]
}

export type ChatMessageRow = {
  id: string
  senderId: string
  content: string
  createdAt: Date
  senderName: string
  senderPhoto: string
}

export async function fetchMessagesForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<ChatMessageRow[]> {
  const { data: msgs, error } = await supabase
    .from('messages')
    .select('id, sender_id, content, created_at')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true })

  if (error || !msgs?.length) return []

  const senderIds = [...new Set(msgs.map((m) => m.sender_id as string))]
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, photo_url')
    .in('id', senderIds)

  const pmap = new Map(
    (profs ?? []).map((p) => [p.id as string, p] as const)
  )

  return msgs.map((m) => {
    const p = pmap.get(m.sender_id as string)
    return {
      id: m.id as string,
      senderId: m.sender_id as string,
      content: m.content as string,
      createdAt: new Date(m.created_at as string),
      senderName: p?.name ?? 'Jugador',
      senderPhoto: p?.photo_url || DEFAULT_AVATAR,
    }
  })
}

export type LastMessagePreview = {
  opportunityId: string
  content: string
  createdAt: Date
}

export async function fetchLastMessagesForOpportunities(
  supabase: SupabaseClient,
  opportunityIds: string[]
): Promise<Map<string, LastMessagePreview>> {
  const map = new Map<string, LastMessagePreview>()
  if (opportunityIds.length === 0) return map

  const { data: rows, error } = await supabase
    .from('messages')
    .select('opportunity_id, content, created_at')
    .in('opportunity_id', opportunityIds)
    .order('created_at', { ascending: false })

  if (error || !rows) return map

  for (const r of rows) {
    const oid = r.opportunity_id as string
    if (map.has(oid)) continue
    map.set(oid, {
      opportunityId: oid,
      content: r.content as string,
      createdAt: new Date(r.created_at as string),
    })
  }

  return map
}


export type OpportunityParticipantRow = {
  id: string
  name: string
  photo: string
  /** `profiles.whatsapp_phone` si la política permite leerlo al viewer. */
  whatsappPhone?: string | null
  status: 'creator' | 'confirmed' | 'pending' | 'invited' | 'cancelled'
  /** Solo revuelta (open): participante eligió ir de arquero. */
  isGoalkeeper?: boolean
  /** Modo selección de equipos: bando A o B. */
  pickTeam?: PickTeamSide
  /** Modo selección de equipos: rol solo para este encuentro. */
  encounterLineupRole?: EncounterLineupRole
  /** Motivo al pasar a cancelado (p. ej. salida voluntaria con RPC). */
  cancelledReason?: string | null
}

/**
 * Quien se salió (`cancelled`) solo debe listarse para el organizador o admin.
 */
export function participantsVisibleForMatchUi(
  rows: OpportunityParticipantRow[],
  opts: { viewerMaySeeCancelled: boolean }
): OpportunityParticipantRow[] {
  if (opts.viewerMaySeeCancelled) return rows
  return rows.filter((p) => p.status !== 'cancelled')
}

export async function fetchParticipantsForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<OpportunityParticipantRow[]> {
  const { data: opp } = await supabase
    .from('match_opportunities')
    .select('creator_id')
    .eq('id', opportunityId)
    .maybeSingle()

  const creatorId = opp?.creator_id as string | undefined

  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select(
      'user_id, status, is_goalkeeper, pick_team, encounter_lineup_role, cancelled_reason'
    )
    .eq('opportunity_id', opportunityId)

  const userIds = new Set<string>()
  if (creatorId) userIds.add(creatorId)
  for (const p of parts ?? []) userIds.add(p.user_id as string)

  if (userIds.size === 0) return []

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, photo_url, whatsapp_phone, account_type')
    .in('id', [...userIds])

  const byId = new Map((profs ?? []).map((r) => [r.id as string, r] as const))

  const partByUser = new Map(
    (parts ?? []).map((p) => [p.user_id as string, p] as const)
  )
  const creatorPart = creatorId ? partByUser.get(creatorId) : undefined
  const creatorProfile = creatorId ? byId.get(creatorId) : undefined
  const creatorIsAdmin =
    ((creatorProfile?.account_type as string | null | undefined) ?? null) === 'admin'

  const out: OpportunityParticipantRow[] = []
  if (creatorId && !creatorIsAdmin) {
    const c = byId.get(creatorId)
    out.push({
      id: creatorId,
      name: (c?.name as string) || 'Organizador',
      photo: (c?.photo_url as string) || DEFAULT_AVATAR,
      whatsappPhone: (c?.whatsapp_phone as string | null | undefined) ?? null,
      status: 'creator',
      isGoalkeeper: creatorPart ? creatorPart.is_goalkeeper === true : false,
      pickTeam: (creatorPart?.pick_team as PickTeamSide | undefined) ?? undefined,
      encounterLineupRole:
        (creatorPart?.encounter_lineup_role as EncounterLineupRole | undefined) ??
        undefined,
      cancelledReason:
        (creatorPart?.cancelled_reason as string | null | undefined) ?? null,
    })
  }

  for (const p of parts ?? []) {
    const uid = p.user_id as string
    if (uid === creatorId) continue
    const u = byId.get(uid)
    out.push({
      id: uid,
      name: (u?.name as string) || 'Jugador',
      photo: (u?.photo_url as string) || DEFAULT_AVATAR,
      whatsappPhone: (u?.whatsapp_phone as string | null | undefined) ?? null,
      status: (p.status as OpportunityParticipantRow['status']) || 'pending',
      isGoalkeeper: p.is_goalkeeper === true,
      pickTeam: (p.pick_team as PickTeamSide | undefined) ?? undefined,
      encounterLineupRole:
        (p.encounter_lineup_role as EncounterLineupRole | undefined) ?? undefined,
      cancelledReason: (p.cancelled_reason as string | null | undefined) ?? null,
    })
  }

  return out
}

export type ParticipantLeaveReasonRow = {
  userId: string
  cancelledReason: string
  cancelledAt: Date | null
}

/**
 * Solo organizador del partido o perfil admin. Usa RPC SECURITY DEFINER.
 */
export async function fetchMatchOpportunityParticipantLeaveReasons(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<Map<string, ParticipantLeaveReasonRow>> {
  const map = new Map<string, ParticipantLeaveReasonRow>()
  const { data, error } = await supabase.rpc(
    'get_match_opportunity_participant_leave_reasons',
    { p_opportunity_id: opportunityId }
  )
  if (error) return map
  const payload = data as
    | {
        ok?: boolean
        error?: string
        items?: Array<{
          user_id?: string
          cancelled_reason?: string | null
          cancelled_at?: string | null
        }>
      }
    | null
  if (!payload?.ok || !Array.isArray(payload.items)) return map
  for (const row of payload.items) {
    const uid = row.user_id
    const reason = row.cancelled_reason?.trim()
    if (typeof uid !== 'string' || !reason) continue
    map.set(uid, {
      userId: uid,
      cancelledReason: reason,
      cancelledAt: row.cancelled_at
        ? new Date(row.cancelled_at as string)
        : null,
    })
  }
  return map
}

export async function insertMatchChatMessage(
  supabase: SupabaseClient,
  params: {
    opportunityId: string
    senderId: string
    content: string
  }
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('messages').insert({
    opportunity_id: params.opportunityId,
    sender_id: params.senderId,
    content: params.content,
  })
  return { error }
}
