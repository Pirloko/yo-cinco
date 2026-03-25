import type { SupabaseClient } from '@supabase/supabase-js'
import type { Gender, Level, Position, Team, TeamInvite, TeamMember } from '@/lib/types'
import { DEFAULT_AVATAR } from '@/lib/supabase/mappers'

export async function fetchTeamsWithMembers(
  supabase: SupabaseClient
): Promise<Team[]> {
  const { data: teamRows, error } = await supabase
    .from('teams')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !teamRows?.length) return []

  const teamIds = teamRows.map((t) => t.id as string)

  const { data: memberRows } = await supabase
    .from('team_members')
    .select('team_id, user_id, position, photo_url, status')
    .in('team_id', teamIds)

  const userIds = [...new Set((memberRows ?? []).map((m) => m.user_id as string))]
  if (userIds.length === 0) {
    return teamRows.map((t) => mapTeamRow(t, []))
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, photo_url')
    .in('id', userIds)

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p] as const)
  )

  const membersByTeam = new Map<string, TeamMember[]>()
  for (const m of memberRows ?? []) {
    const uid = m.user_id as string
    const tid = m.team_id as string
    const p = profileById.get(uid)
    const tm: TeamMember = {
      id: uid,
      name: p?.name ?? 'Jugador',
      position: m.position as Position,
      photo: (m.photo_url as string) || p?.photo_url || DEFAULT_AVATAR,
      status: m.status as TeamMember['status'],
    }
    const list = membersByTeam.get(tid) ?? []
    list.push(tm)
    membersByTeam.set(tid, list)
  }

  return teamRows.map((t) => mapTeamRow(t, membersByTeam.get(t.id as string) ?? []))
}

function mapTeamRow(
  t: Record<string, unknown>,
  members: TeamMember[]
): Team {
  return {
    id: t.id as string,
    name: t.name as string,
    logo: (t.logo_url as string | null) ?? undefined,
    level: t.level as Level,
    captainId: t.captain_id as string,
    members,
    city: t.city as string,
    gender: t.gender as Gender,
    description: (t.description as string | null) ?? undefined,
    createdAt: new Date(t.created_at as string),
  }
}

export async function fetchTeamInvitesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<TeamInvite[]> {
  const { data: invs, error } = await supabase
    .from('team_invites')
    .select('*')
    .or(`invitee_id.eq.${userId},inviter_id.eq.${userId}`)
    .order('created_at', { ascending: false })

  if (error || !invs?.length) return []

  const teamIds = [...new Set(invs.map((i) => i.team_id as string))]
  const inviterIds = [...new Set(invs.map((i) => i.inviter_id as string))]

  const [{ data: teamRows }, { data: profs }] = await Promise.all([
    supabase.from('teams').select('id, name').in('id', teamIds),
    supabase.from('profiles').select('id, name').in('id', inviterIds),
  ])

  const teamName = new Map(
    (teamRows ?? []).map((t) => [t.id as string, t.name as string])
  )
  const inviterName = new Map(
    (profs ?? []).map((p) => [p.id as string, p.name as string])
  )

  return invs.map((i) => ({
    id: i.id as string,
    teamId: i.team_id as string,
    teamName: teamName.get(i.team_id as string) ?? 'Equipo',
    inviterId: i.inviter_id as string,
    inviterName: inviterName.get(i.inviter_id as string) ?? '',
    inviteeId: i.invitee_id as string,
    status: i.status as TeamInvite['status'],
    createdAt: new Date(i.created_at as string),
  }))
}
