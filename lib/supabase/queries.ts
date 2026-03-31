import type { SupabaseClient } from '@supabase/supabase-js'
import type { Gender } from '@/lib/types'
import type { MatchOpportunity, PublicPlayerProfile, User } from '@/lib/types'
import {
  mapMatchOpportunityFromDb,
  profileRowToUser,
  type CreatorSnippet,
  type MatchOpportunityRow,
  type ProfileRow,
} from '@/lib/supabase/mappers'
import {
  MATCH_OPPORTUNITY_SELECT_WITH_GEO,
  PROFILE_SELECT_WITH_GEO,
} from '@/lib/supabase/geo-queries'

export async function fetchProfileForUser(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT_WITH_GEO)
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null
  return profileRowToUser(data as ProfileRow, email)
}

/** Solo `stats_organized_completed` (badge nivel organizador en detalle de partido). */
export async function fetchOrganizerCompletedCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('profiles')
    .select('stats_organized_completed')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return 0
  return Math.max(0, (data.stats_organized_completed as number) ?? 0)
}

export async function fetchPublicPlayerProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<PublicPlayerProfile | null> {
  const { data, error } = await supabase.rpc('fetch_public_player_profile', {
    p_user_id: userId,
  })
  if (error || !data || !Array.isArray(data) || data.length === 0) return null
  const r = data[0] as any
  return {
    id: r.id as string,
    name: (r.name as string) ?? 'Jugador',
    photo: (r.photo_url as string) ?? '',
    cityId: (r.city_id as string) ?? '',
    city: (r.city as string) ?? '',
    level: r.level,
    position: r.position,
    availability: (r.availability as string[]) ?? [],
    statsPlayerWins: (r.stats_player_wins as number) ?? 0,
    statsPlayerDraws: (r.stats_player_draws as number) ?? 0,
    statsPlayerLosses: (r.stats_player_losses as number) ?? 0,
    statsOrganizedCompleted: (r.stats_organized_completed as number) ?? 0,
    statsOrganizerWins: (r.stats_organizer_wins as number) ?? 0,
    modYellowCards: (r.mod_yellow_cards as number) ?? 0,
    modRedCards: (r.mod_red_cards as number) ?? 0,
    modSuspendedUntil: r.mod_suspended_until ? new Date(r.mod_suspended_until) : null,
    modBannedAt: r.mod_banned_at ? new Date(r.mod_banned_at) : null,
  }
}

export async function fetchMatchOpportunities(
  supabase: SupabaseClient
): Promise<MatchOpportunity[]> {
  const { data: opps, error } = await supabase
    .from('match_opportunities')
    .select(MATCH_OPPORTUNITY_SELECT_WITH_GEO)
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

  const resIds = [
    ...new Set(
      rows
        .map((r) => r.venue_reservation_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const reservationById = new Map<
    string,
    {
      starts_at: string
      ends_at: string
      price_per_hour: number | null
      currency: string | null
    }
  >()
  if (resIds.length > 0) {
    const { data: resvRows } = await supabase
      .from('venue_reservations')
      .select('id, starts_at, ends_at, price_per_hour, currency')
      .in('id', resIds)
    for (const rv of resvRows ?? []) {
      reservationById.set(rv.id as string, {
        starts_at: rv.starts_at as string,
        ends_at: rv.ends_at as string,
        price_per_hour: (rv.price_per_hour as number | null) ?? null,
        currency: (rv.currency as string | null) ?? null,
      })
    }
  }

  return rows.map((row) => {
    const joined = joinedByOpportunity.get(row.id)
    const withSafeJoined: MatchOpportunityRow =
      joined === undefined ? row : { ...row, players_joined: joined }
    const resId = row.venue_reservation_id
    const vr =
      resId != null ? reservationById.get(resId) ?? null : undefined
    return mapMatchOpportunityFromDb(
      withSafeJoined,
      byId.get(row.creator_id) ?? null,
      vr === undefined ? undefined : vr
    )
  })
}

/** Email no expuesto por RLS para terceros; placeholder para la UI. */
function placeholderEmail(id: string) {
  return `jugador-${id.slice(0, 8)}@sportmatch.local`
}

export async function fetchOtherProfiles(
  supabase: SupabaseClient,
  currentUserId: string,
  gender: Gender
): Promise<User[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT_WITH_GEO)
    .eq('gender', gender)
    .eq('account_type', 'player')
    .neq('id', currentUserId)

  if (error || !data) return []

  const rows = data as ProfileRow[]
  return rows.map((row) => profileRowToUser(row, placeholderEmail(row.id)))
}
