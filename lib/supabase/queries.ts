import type { SupabaseClient } from '@supabase/supabase-js'
import type { Gender } from '@/lib/types'
import type { MatchOpportunity, User } from '@/lib/types'
import {
  mapMatchOpportunityFromDb,
  profileRowToUser,
  type CreatorSnippet,
  type MatchOpportunityRow,
  type ProfileRow,
} from '@/lib/supabase/mappers'

export async function fetchProfileForUser(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null
  return profileRowToUser(data as ProfileRow, email)
}

export async function fetchMatchOpportunities(
  supabase: SupabaseClient
): Promise<MatchOpportunity[]> {
  const { data: opps, error } = await supabase
    .from('match_opportunities')
    .select('*')
    .order('date_time', { ascending: true })

  if (error || !opps?.length) return []

  const rows = opps as MatchOpportunityRow[]
  const opportunityIds = rows.map((r) => r.id)
  const creatorIds = [...new Set(rows.map((r) => r.creator_id))]
  const { data: creators } = await supabase
    .from('profiles')
    .select('id, name, photo_url')
    .in('id', creatorIds)

  // Fallback robusto: contamos participantes desde la tabla relacional.
  // Esto evita desajustes visuales si el trigger de players_joined no está aplicado.
  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select('opportunity_id, status')
    .in('opportunity_id', opportunityIds)

  const byId = new Map(
    (creators ?? []).map((c) => [c.id, c as CreatorSnippet])
  )
  const joinedByOpportunity = new Map<string, number>()
  for (const p of parts ?? []) {
    const oid = p.opportunity_id as string
    const status = p.status as string
    if (status !== 'pending' && status !== 'confirmed') continue
    joinedByOpportunity.set(oid, (joinedByOpportunity.get(oid) ?? 0) + 1)
  }

  return rows.map((row) => {
    const joined = joinedByOpportunity.get(row.id)
    const withSafeJoined: MatchOpportunityRow =
      joined === undefined ? row : { ...row, players_joined: joined }
    return mapMatchOpportunityFromDb(
      withSafeJoined,
      byId.get(row.creator_id) ?? null
    )
  })
}

/** Email no expuesto por RLS para terceros; placeholder para la UI. */
function placeholderEmail(id: string) {
  return `jugador-${id.slice(0, 8)}@pichanga.local`
}

export async function fetchOtherProfiles(
  supabase: SupabaseClient,
  currentUserId: string,
  gender: Gender
): Promise<User[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('gender', gender)
    .eq('account_type', 'player')
    .neq('id', currentUserId)

  if (error || !data) return []

  const rows = data as ProfileRow[]
  return rows.map((row) => profileRowToUser(row, placeholderEmail(row.id)))
}
