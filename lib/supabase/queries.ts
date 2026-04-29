import type { SupabaseClient } from '@supabase/supabase-js'
import type { Gender } from '@/lib/types'
import type { MatchOpportunity, PublicPlayerProfile, User } from '@/lib/types'
import type { Level, Position } from '@/lib/types'
import {
  mapMatchOpportunityFromDb,
  profileRowToUser,
  type CreatorSnippet,
  type MatchOpportunityRow,
  type ProfileRow,
} from '@/lib/supabase/mappers'
import {
  MATCH_OPPORTUNITY_SELECT_WITH_GEO,
  MATCH_OPPORTUNITIES_CLIENT_VIEW,
  PROFILE_SELECT_WITH_GEO,
} from '@/lib/supabase/geo-queries'

const SPORTMATCH_ORGANIZER_NAME = 'Sportmatch'
const SPORTMATCH_ORGANIZER_PHOTO = '/logohome.webp'

function normalizeMatchVenueLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

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
  // Tipado de embeds de Supabase puede degradar (geo_city como array). Cast explícito para mantener mapper.
  return profileRowToUser(data as unknown as ProfileRow, email)
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
  const r = data[0] as Record<string, unknown>
  const suspendedUntilRaw = r.mod_suspended_until
  const bannedAtRaw = r.mod_banned_at
  return {
    id: r.id as string,
    name: (r.name as string) ?? 'Jugador',
    photo: (r.photo_url as string) ?? '',
    cityId: (r.city_id as string) ?? '',
    city: (r.city as string) ?? '',
    level: (r.level as Level) ?? 'principiante',
    position: (r.position as Position) ?? 'mediocampista',
    availability: (r.availability as string[]) ?? [],
    statsPlayerWins: (r.stats_player_wins as number) ?? 0,
    statsPlayerDraws: (r.stats_player_draws as number) ?? 0,
    statsPlayerLosses: (r.stats_player_losses as number) ?? 0,
    statsOrganizedCompleted: (r.stats_organized_completed as number) ?? 0,
    statsOrganizerWins: (r.stats_organizer_wins as number) ?? 0,
    modYellowCards: (r.mod_yellow_cards as number) ?? 0,
    modRedCards: (r.mod_red_cards as number) ?? 0,
    modSuspendedUntil:
      typeof suspendedUntilRaw === 'string' ||
      typeof suspendedUntilRaw === 'number' ||
      suspendedUntilRaw instanceof Date
        ? new Date(suspendedUntilRaw)
        : null,
    modBannedAt:
      typeof bannedAtRaw === 'string' ||
      typeof bannedAtRaw === 'number' ||
      bannedAtRaw instanceof Date
        ? new Date(bannedAtRaw)
        : null,
  }
}

export async function fetchMatchOpportunities(
  supabase: SupabaseClient
): Promise<MatchOpportunity[]> {
  const { data: opps, error } = await supabase
    .from(MATCH_OPPORTUNITIES_CLIENT_VIEW)
    .select(MATCH_OPPORTUNITY_SELECT_WITH_GEO)
    .order('date_time', { ascending: true })

  if (error || !opps?.length) return []

  // Tipado de embeds de Supabase puede degradar (geo_city como array). Cast explícito para mantener mapper.
  const rows = opps as unknown as MatchOpportunityRow[]
  const opportunityIds = rows.map((r) => r.id)
  const creatorIds = [...new Set(rows.map((r) => r.creator_id))]
  const { data: creators } = await supabase
    .from('profiles')
    .select('id, name, photo_url, account_type')
    .in('id', creatorIds)

  // Fallback robusto: contamos participantes desde la tabla relacional.
  // Esto evita desajustes visuales si el trigger de players_joined no está aplicado.
  const { data: parts } = await supabase
    .from('match_opportunity_participants')
    .select('opportunity_id, user_id, status')
    .in('opportunity_id', opportunityIds)

  const byId = new Map<string, CreatorSnippet>()
  const isAdminCreatorById = new Map<string, boolean>()
  for (const c of creators ?? []) {
    const accountType = c.account_type as string | null | undefined
    isAdminCreatorById.set(c.id as string, accountType === 'admin')
    byId.set(c.id as string, {
      id: c.id as string,
      name:
        accountType === 'admin'
          ? SPORTMATCH_ORGANIZER_NAME
          : ((c.name as string) ?? 'Jugador'),
      photo_url:
        accountType === 'admin'
          ? SPORTMATCH_ORGANIZER_PHOTO
          : ((c.photo_url as string | null) ?? '').trim(),
    })
  }
  const joinedByOpportunity = new Map<string, number>()
  const creatorIdByOpportunity = new Map(rows.map((r) => [r.id, r.creator_id] as const))
  for (const p of parts ?? []) {
    const oid = p.opportunity_id as string
    const uid = p.user_id as string
    const status = p.status as string
    if (status !== 'pending' && status !== 'confirmed') continue
    const creatorId = creatorIdByOpportunity.get(oid)
    if (
      creatorId &&
      uid === creatorId &&
      isAdminCreatorById.get(creatorId) === true
    ) {
      // Admin organiza como Sportmatch pero no ocupa cupo.
      continue
    }
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

  const sportsVenueIds = [
    ...new Set(
      rows
        .map((r) => r.sports_venue_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const venuePhoneById = new Map<string, string>()
  if (sportsVenueIds.length > 0) {
    const { data: venueRows } = await supabase
      .from('sports_venues')
      .select('id, phone')
      .in('id', sportsVenueIds)
    for (const v of venueRows ?? []) {
      venuePhoneById.set(v.id as string, (v.phone as string) ?? '')
    }
  }

  const rowsMissingVenueLink = rows.filter(
    (r) =>
      !r.sports_venue_id &&
      Boolean(r.city_id) &&
      (r.venue ?? '').trim().length >= 2
  )
  const cityIdsForVenueFallback = [
    ...new Set(
      rowsMissingVenueLink
        .map((r) => r.city_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const venueIdByCityAndName = new Map<string, string>()
  if (cityIdsForVenueFallback.length > 0) {
    const { data: fallbackVenueRows } = await supabase
      .from('sports_venues')
      .select('id, name, phone, city_id')
      .eq('is_paused', false)
      .in('city_id', cityIdsForVenueFallback)

    for (const v of fallbackVenueRows ?? []) {
      const cityId = v.city_id as string
      const key = `${cityId}|${normalizeMatchVenueLabel(v.name as string)}`
      if (!venueIdByCityAndName.has(key)) {
        venueIdByCityAndName.set(key, v.id as string)
      }
      venuePhoneById.set(v.id as string, (v.phone as string) ?? '')
    }
  }

  return rows.map((row) => {
    const joined = joinedByOpportunity.get(row.id)
    const withSafeJoined: MatchOpportunityRow =
      joined === undefined ? row : { ...row, players_joined: joined }
    const resId = row.venue_reservation_id
    const vr =
      resId != null ? reservationById.get(resId) ?? null : undefined
    const fallbackKey =
      !row.sports_venue_id && row.city_id && (row.venue ?? '').trim().length >= 2
        ? `${row.city_id}|${normalizeMatchVenueLabel(row.venue)}`
        : null
    const resolvedFromName = fallbackKey
      ? venueIdByCityAndName.get(fallbackKey)
      : undefined
    const resolvedVenueId = row.sports_venue_id ?? resolvedFromName ?? null
    const vPhone =
      resolvedVenueId != null
        ? venuePhoneById.get(resolvedVenueId) ?? null
        : null
    return mapMatchOpportunityFromDb(
      withSafeJoined,
      byId.get(row.creator_id) ?? null,
      vr === undefined ? undefined : vr,
      vPhone,
      row.sports_venue_id ? undefined : resolvedFromName
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

  // Tipado de embeds de Supabase puede degradar (geo_city como array). Cast explícito para mantener mapper.
  const rows = data as unknown as ProfileRow[]
  return rows.map((row) => profileRowToUser(row, placeholderEmail(row.id)))
}
