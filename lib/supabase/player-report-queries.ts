import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export async function insertPublicProfilePlayerReport(
  supabase: SupabaseClient,
  params: {
    reporterId: string
    reportedUserId: string
    reason: string
    details: string | null
  }
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('player_reports').insert({
    reporter_id: params.reporterId,
    reported_user_id: params.reportedUserId,
    context_type: 'public_profile',
    context_id: null,
    reason: params.reason,
    details: params.details,
  })
  return { error }
}
