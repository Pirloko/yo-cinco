import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import type {
  EncounterLineupRole,
  Gender,
  Level,
  MatchType,
  PickTeamSide,
} from '@/lib/types'
import { CACHE_REVALIDATE_SECONDS } from '@/lib/cache-policy'
import { DEFAULT_AVATAR } from '@/lib/supabase/mappers'
import { isValidOpportunityInviteId } from '@/lib/match-invite-url'
import { teamPickColorsForUi } from '@/lib/team-pick-ui'

export type PublicRevueltaParticipant = {
  id: string
  name: string
  photo: string
  isGoalkeeper: boolean
  isCreator: boolean
  pickTeam?: PickTeamSide
  encounterLineupRole?: EncounterLineupRole
}

export type PublicRevueltaSnapshot = {
  id: string
  type: MatchType
  title: string
  description?: string
  location: string
  venue: string
  dateTimeIso: string
  level: Level
  gender: Gender
  creatorId: string
  playersNeeded: number
  playersJoined: number
  goalkeeperCount: number
  participants: PublicRevueltaParticipant[]
  /** Solo `team_pick_public` en página pública. */
  teamPickColorA?: string
  teamPickColorB?: string
}

type PartRow = {
  user_id: string
  is_goalkeeper?: boolean | null
  pick_team?: string | null
  encounter_lineup_role?: string | null
}

function isPublicSeoMatchType(t: unknown): t is 'open' | 'team_pick_public' {
  return t === 'open' || t === 'team_pick_public'
}

function buildSnapshot(
  row: Record<string, unknown>,
  parts: PartRow[],
  profileById: Map<string, { name: string; photo: string }>,
  creatorId: string
): PublicRevueltaSnapshot {
  const matchType = row.type as MatchType
  const gk = parts.filter((p) => {
    if (p.is_goalkeeper === true) return true
    if (
      (matchType === 'team_pick_public' || matchType === 'team_pick_private') &&
      p.encounter_lineup_role === 'gk'
    ) {
      return true
    }
    return false
  }).length
  const participants: PublicRevueltaParticipant[] = []
  const cr = profileById.get(creatorId)
  const creatorPart = parts.find((p) => p.user_id === creatorId)
  const creatorPick = creatorPart?.pick_team as PickTeamSide | undefined
  const creatorRole = creatorPart?.encounter_lineup_role as
    | EncounterLineupRole
    | undefined
  participants.push({
    id: creatorId,
    name: cr?.name ?? 'Organizador',
    photo: cr?.photo ?? DEFAULT_AVATAR,
    isGoalkeeper: creatorPart ? creatorPart.is_goalkeeper === true : false,
    isCreator: true,
    pickTeam: creatorPick,
    encounterLineupRole: creatorRole,
  })
  for (const p of parts) {
    const uid = p.user_id as string
    if (uid === creatorId) continue
    const pr = profileById.get(uid)
    participants.push({
      id: uid,
      name: pr?.name ?? 'Jugador',
      photo: pr?.photo ?? DEFAULT_AVATAR,
      isGoalkeeper: p.is_goalkeeper === true,
      isCreator: false,
      pickTeam: (p.pick_team as PickTeamSide | undefined) ?? undefined,
      encounterLineupRole:
        (p.encounter_lineup_role as EncounterLineupRole | undefined) ?? undefined,
    })
  }

  const needed = (row.players_needed as number | null) ?? 12

  const colorExtras =
    matchType === 'team_pick_public'
      ? teamPickColorsForUi({
          type: matchType,
          teamPickColorA: row.team_pick_color_a as string | undefined,
          teamPickColorB: row.team_pick_color_b as string | undefined,
        })
      : null

  return {
    id: row.id as string,
    type: row.type as MatchType,
    title: row.title as string,
    description: (row.description as string | null) ?? undefined,
    location: row.location as string,
    venue: row.venue as string,
    dateTimeIso: row.date_time as string,
    level: row.level as Level,
    gender: row.gender as Gender,
    creatorId,
    playersNeeded: needed,
    playersJoined: (row.players_joined as number) ?? 0,
    goalkeeperCount: gk,
    participants,
    ...(colorExtras
      ? { teamPickColorA: colorExtras.colorA, teamPickColorB: colorExtras.colorB }
      : {}),
  }
}

async function fetchPublicRevueltaSnapshotUncached(
  opportunityId: string
): Promise<PublicRevueltaSnapshot | null> {
  if (!isValidOpportunityInviteId(opportunityId)) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const loadWithAdmin = async () => {
    const admin = createClient(url, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: row, error } = await admin
      .from('match_opportunities')
      .select(
        'id, type, title, description, location, venue, date_time, level, gender, creator_id, players_needed, players_joined, team_pick_color_a, team_pick_color_b'
      )
      .eq('id', opportunityId)
      .maybeSingle()
    if (error || !row) return null
    const r = row as Record<string, unknown>
    if (!isPublicSeoMatchType(r.type)) return null
    const creatorId = r.creator_id as string

    const { data: partRows } = await admin
      .from('match_opportunity_participants')
      .select('user_id, is_goalkeeper, pick_team, encounter_lineup_role')
      .eq('opportunity_id', opportunityId)

    const parts = (partRows ?? []) as PartRow[]
    const uids = new Set<string>([creatorId])
    for (const p of parts) uids.add(p.user_id)
    const { data: profs } = await admin
      .from('profiles')
      .select('id, name, photo_url')
      .in('id', [...uids])

    const pmap = new Map(
      (profs ?? []).map((p) => [
        p.id as string,
        {
          name: (p.name as string) || 'Jugador',
          photo: (p.photo_url as string) || DEFAULT_AVATAR,
        },
      ])
    )
    return buildSnapshot(r, parts, pmap, creatorId)
  }

  if (serviceKey) {
    return loadWithAdmin()
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: row, error } = await supabase
    .from('match_opportunities')
    .select(
      'id, type, title, description, location, venue, date_time, level, gender, creator_id, players_needed, players_joined, team_pick_color_a, team_pick_color_b'
    )
    .eq('id', opportunityId)
    .maybeSingle()

  if (error || !row) return null
  const r = row as Record<string, unknown>
  if (!isPublicSeoMatchType(r.type)) return null
  const creatorId = r.creator_id as string

  const { data: partRows } = await supabase
    .from('match_opportunity_participants')
    .select('user_id, is_goalkeeper, pick_team, encounter_lineup_role')
    .eq('opportunity_id', opportunityId)

  const parts = (partRows ?? []) as PartRow[]
  const pmap = new Map<string, { name: string; photo: string }>()
  pmap.set(creatorId, { name: 'Organizador', photo: DEFAULT_AVATAR })
  for (const p of parts) {
    if (p.user_id !== creatorId && !pmap.has(p.user_id)) {
      pmap.set(p.user_id, { name: 'Jugador', photo: DEFAULT_AVATAR })
    }
  }

  return buildSnapshot(r, parts, pmap, creatorId)
}

const fetchPublicRevueltaSnapshotCached = unstable_cache(
  async (opportunityId: string) => fetchPublicRevueltaSnapshotUncached(opportunityId),
  ['public-revuelta-snapshot-v3'],
  { revalidate: CACHE_REVALIDATE_SECONDS.publicDynamic }
)

export async function fetchPublicRevueltaSnapshot(
  opportunityId: string
): Promise<PublicRevueltaSnapshot | null> {
  return fetchPublicRevueltaSnapshotCached(opportunityId)
}
