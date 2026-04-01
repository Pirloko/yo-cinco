import type { SupabaseClient } from '@supabase/supabase-js'

export type PendingRevueltaExternalRequest = {
  id: string
  requesterId: string
  requesterName: string
  requesterPhoto: string
  isGoalkeeper: boolean
  createdAt: Date
}

export async function fetchPendingRevueltaExternalRequests(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<PendingRevueltaExternalRequest[]> {
  const { data, error } = await supabase
    .from('revuelta_external_join_requests')
    .select('id, requester_id, is_goalkeeper, created_at')
    .eq('opportunity_id', opportunityId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error || !data?.length) return []

  const ids = [...new Set(data.map((r) => r.requester_id as string))]
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, photo_url')
    .in('id', ids)
  const byId = new Map((profs ?? []).map((p) => [p.id as string, p]))

  return data.map((r) => {
    const p = byId.get(r.requester_id as string)
    return {
      id: r.id as string,
      requesterId: r.requester_id as string,
      requesterName: (p?.name as string) ?? 'Jugador',
      requesterPhoto: (p?.photo_url as string) ?? '',
      isGoalkeeper: r.is_goalkeeper === true,
      createdAt: new Date(r.created_at as string),
    }
  })
}

export async function fetchMyPendingRevueltaExternalRequest(
  supabase: SupabaseClient,
  opportunityId: string,
  userId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('revuelta_external_join_requests')
    .select('id')
    .eq('opportunity_id', opportunityId)
    .eq('requester_id', userId)
    .eq('status', 'pending')
    .maybeSingle()
  if (error || !data) return null
  return { id: data.id as string }
}
