import type { SupabaseClient } from '@supabase/supabase-js'
import type { RivalChallenge } from '@/lib/types'

type RivalChallengeRow = {
  id: string
  opportunity_id: string
  challenger_team_id: string
  challenger_captain_id: string
  challenged_team_id: string | null
  challenged_captain_id: string | null
  accepted_team_id: string | null
  accepted_captain_id: string | null
  mode: 'direct' | 'open'
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  created_at: string
  responded_at: string | null
}

export async function fetchRivalChallengesForUser(
  supabase: SupabaseClient,
  _userId: string
): Promise<RivalChallenge[]> {
  void _userId
  const { data: rows, error } = await supabase
    .from('rival_challenges')
    .select(
      'id, opportunity_id, challenger_team_id, challenger_captain_id, challenged_team_id, challenged_captain_id, accepted_team_id, accepted_captain_id, mode, status, created_at, responded_at'
    )
    .order('created_at', { ascending: false })

  if (error || !rows?.length) return []

  const all = rows as RivalChallengeRow[]
  const teamIds = [
    ...new Set(
      all.flatMap((r) =>
        [r.challenger_team_id, r.challenged_team_id, r.accepted_team_id].filter(
          Boolean
        )
      ) as string[]
    ),
  ]
  const oppIds = [...new Set(all.map((r) => r.opportunity_id))]

  const [{ data: teams }, { data: opps }] = await Promise.all([
    teamIds.length > 0
      ? supabase.from('teams').select('id, name, captain_id').in('id', teamIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; captain_id: string }[],
          error: null,
        }),
    oppIds.length > 0
      ? supabase.from('match_opportunities').select('id, title').in('id', oppIds)
      : Promise.resolve({
          data: [] as { id: string; title: string }[],
          error: null,
        }),
  ])

  const teamById = new Map(
    (teams ?? []).map((t) => [t.id as string, t] as const)
  )
  const oppById = new Map(
    (opps ?? []).map((o) => [o.id as string, o.title as string] as const)
  )

  return all.map((r) => ({
    id: r.id,
    opportunityId: r.opportunity_id,
    opportunityTitle: oppById.get(r.opportunity_id) ?? 'Desafío',
    mode: r.mode,
    status: r.status,
    challengerTeamId: r.challenger_team_id,
    challengerTeamName:
      (teamById.get(r.challenger_team_id)?.name as string) ?? 'Equipo',
    challengerCaptainId:
      (teamById.get(r.challenger_team_id)?.captain_id as string) ??
      r.challenger_captain_id,
    challengedTeamId: r.challenged_team_id ?? undefined,
    challengedTeamName: r.challenged_team_id
      ? ((teamById.get(r.challenged_team_id)?.name as string) ?? 'Equipo')
      : undefined,
    challengedCaptainId: r.challenged_captain_id ?? undefined,
    acceptedTeamId: r.accepted_team_id ?? undefined,
    acceptedTeamName: r.accepted_team_id
      ? ((teamById.get(r.accepted_team_id)?.name as string) ?? 'Equipo')
      : undefined,
    acceptedCaptainId: r.accepted_captain_id ?? undefined,
    createdAt: new Date(r.created_at),
    respondedAt: r.responded_at ? new Date(r.responded_at) : undefined,
  }))
}
