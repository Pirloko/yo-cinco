import type { SupabaseClient } from '@supabase/supabase-js'

/** Conteos para diálogos de unión (revuelta / buscan jugadores). */
export async function fetchMatchParticipantGkFieldCounts(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<{ gkCount: number; fieldCount: number; joinedCount: number } | null> {
  const { data, error } = await supabase
    .from('match_opportunity_participants')
    .select('is_goalkeeper, status')
    .eq('opportunity_id', opportunityId)
  if (error) return null
  let gkCount = 0
  let fieldCount = 0
  let joinedCount = 0
  for (const p of data ?? []) {
    const st = p.status as string
    if (st !== 'pending' && st !== 'confirmed') continue
    joinedCount++
    if (p.is_goalkeeper === true) gkCount++
    else fieldCount++
  }
  return { gkCount, fieldCount, joinedCount }
}
