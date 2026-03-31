import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Gender, Level, Position } from '@/lib/types'
import { DEFAULT_AVATAR } from '@/lib/supabase/mappers'
import { TEAM_SELECT_WITH_GEO } from '@/lib/supabase/geo-queries'
import { isValidTeamInviteId } from '@/lib/team-invite-url'

export type PublicTeamMemberRow = {
  id: string
  name: string
  photo: string
  position: Position
  status: 'confirmed' | 'pending'
  isCaptain: boolean
}

export type PublicTeamSnapshot = {
  id: string
  name: string
  logo?: string
  description?: string
  cityId: string
  city: string
  level: Level
  gender: Gender
  captainId: string
  members: PublicTeamMemberRow[]
  statsWins: number
  statsDraws: number
  statsLosses: number
  statsWinStreak: number
  statsLossStreak: number
}

function mapSnapshot(
  team: Record<string, unknown>,
  members: PublicTeamMemberRow[]
): PublicTeamSnapshot {
  const geo = team.geo_city as { name?: string } | null | undefined
  return {
    id: team.id as string,
    name: team.name as string,
    logo: (team.logo_url as string | null) ?? undefined,
    description: (team.description as string | null) ?? undefined,
    cityId: (team.city_id as string) ?? '',
    city: geo?.name?.trim() || (team.city as string) || '',
    level: team.level as Level,
    gender: team.gender as Gender,
    captainId: team.captain_id as string,
    members,
    statsWins: Math.max(0, (team.stats_wins as number | null) ?? 0),
    statsDraws: Math.max(0, (team.stats_draws as number | null) ?? 0),
    statsLosses: Math.max(0, (team.stats_losses as number | null) ?? 0),
    statsWinStreak: Math.max(0, (team.stats_win_streak as number | null) ?? 0),
    statsLossStreak: Math.max(0, (team.stats_loss_streak as number | null) ?? 0),
  }
}

/** Servidor: datos de equipo para /equipo/[id]. Service role si existe (nombres en plantilla); si no, anon + “Jugador”. */
export async function fetchPublicTeamSnapshot(
  teamId: string
): Promise<PublicTeamSnapshot | null> {
  if (!isValidTeamInviteId(teamId)) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (serviceKey) {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: team, error: teamErr } = await admin
      .from('teams')
      .select(TEAM_SELECT_WITH_GEO)
      .eq('id', teamId)
      .maybeSingle()

    if (teamErr || !team) return null

    const { data: memberRows } = await admin
      .from('team_members')
      .select('team_id, user_id, position, photo_url, status')
      .eq('team_id', teamId)

    const userIds = [...new Set((memberRows ?? []).map((m) => m.user_id as string))]
    const profileById = new Map<string, { name: string; photo: string }>()
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, name, photo_url')
        .in('id', userIds)
      for (const p of profiles ?? []) {
        profileById.set(p.id as string, {
          name: (p.name as string) || 'Jugador',
          photo: (p.photo_url as string) || DEFAULT_AVATAR,
        })
      }
    }

    const captainId = team.captain_id as string
    const members: PublicTeamMemberRow[] = (memberRows ?? []).map((m) => {
      const uid = m.user_id as string
      const prof = profileById.get(uid)
      const photo =
        (m.photo_url as string)?.trim() ||
        prof?.photo ||
        DEFAULT_AVATAR
      return {
        id: uid,
        name: prof?.name ?? 'Jugador',
        photo,
        position: m.position as Position,
        status: m.status as PublicTeamMemberRow['status'],
        isCaptain: uid === captainId,
      }
    })

    return mapSnapshot(team as Record<string, unknown>, members)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {
        // lectura pública; sin mutar cookies
      },
    },
  })

  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .select(TEAM_SELECT_WITH_GEO)
    .eq('id', teamId)
    .maybeSingle()

  if (teamErr || !team) return null

  const { data: memberRows } = await supabase
    .from('team_members')
    .select('team_id, user_id, position, photo_url, status')
    .eq('team_id', teamId)

  const captainId = team.captain_id as string
  const members: PublicTeamMemberRow[] = (memberRows ?? []).map((m) => {
    const uid = m.user_id as string
    const photo =
      (m.photo_url as string)?.trim() || DEFAULT_AVATAR
    return {
      id: uid,
      name: 'Jugador',
      photo,
      position: m.position as Position,
      status: m.status as PublicTeamMemberRow['status'],
      isCaptain: uid === captainId,
    }
  })

  return mapSnapshot(team as Record<string, unknown>, members)
}
