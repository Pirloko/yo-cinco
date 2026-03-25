import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Gender, Level, MatchType } from '@/lib/types'
import { DEFAULT_AVATAR } from '@/lib/supabase/mappers'
import { isValidOpportunityInviteId } from '@/lib/match-invite-url'

export type PublicRevueltaParticipant = {
  id: string
  name: string
  photo: string
  isGoalkeeper: boolean
  isCreator: boolean
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
}

type PartRow = { user_id: string; is_goalkeeper?: boolean | null }

function buildSnapshot(
  row: Record<string, unknown>,
  parts: PartRow[],
  profileById: Map<string, { name: string; photo: string }>,
  creatorId: string
): PublicRevueltaSnapshot {
  const gk = parts.filter((p) => p.is_goalkeeper === true).length
  const participants: PublicRevueltaParticipant[] = []
  const cr = profileById.get(creatorId)
  participants.push({
    id: creatorId,
    name: cr?.name ?? 'Organizador',
    photo: cr?.photo ?? DEFAULT_AVATAR,
    isGoalkeeper: false,
    isCreator: true,
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
    })
  }

  const needed = (row.players_needed as number | null) ?? 12

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
  }
}

export async function fetchPublicRevueltaSnapshot(
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
      .select('*')
      .eq('id', opportunityId)
      .maybeSingle()
    if (error || !row) return null
    const r = row as Record<string, unknown>
    if (r.type !== 'open') return null
    const creatorId = r.creator_id as string

    const { data: partRows } = await admin
      .from('match_opportunity_participants')
      .select('user_id, is_goalkeeper')
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

  const cookieStore = await cookies()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {},
    },
  })

  const { data: row, error } = await supabase
    .from('match_opportunities')
    .select('*')
    .eq('id', opportunityId)
    .maybeSingle()

  if (error || !row) return null
  const r = row as Record<string, unknown>
  if (r.type !== 'open') return null
  const creatorId = r.creator_id as string

  const { data: partRows } = await supabase
    .from('match_opportunity_participants')
    .select('user_id, is_goalkeeper')
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
