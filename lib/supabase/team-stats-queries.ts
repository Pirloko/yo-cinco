import type { SupabaseClient } from '@supabase/supabase-js'

type CountRow = { team_id: string; match_count: number }

export async function fetchTeamMatchCounts(
  supabase: SupabaseClient,
  teamIds: string[]
): Promise<Record<string, number>> {
  if (teamIds.length === 0) return {}
  const { data, error } = await supabase.rpc('team_completed_rival_counts', {
    p_team_ids: teamIds,
  })
  if (error || !data || !Array.isArray(data)) return {}
  const out: Record<string, number> = {}
  for (const row of data as CountRow[]) {
    if (row.team_id) out[row.team_id] = row.match_count ?? 0
  }
  return out
}
