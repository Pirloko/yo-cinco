import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export type AppUserFeedbackRow = {
  id: string
  user_id: string
  message: string
  app_version: string | null
  created_at: string
}

export async function insertAppUserFeedback(
  supabase: SupabaseClient,
  params: {
    userId: string
    message: string
    appVersion?: string | null
  }
): Promise<{ error: PostgrestError | null }> {
  const msg = params.message.trim().slice(0, 4000)
  const { error } = await supabase.from('app_user_feedback').insert({
    user_id: params.userId,
    message: msg,
    app_version: params.appVersion?.trim() || null,
  })
  return { error }
}

export async function fetchAppUserFeedbackForAdmin(
  supabase: SupabaseClient,
  limit = 300
): Promise<{ rows: AppUserFeedbackRow[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('app_user_feedback')
    .select('id, user_id, message, app_version, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  return { rows: (data ?? []) as AppUserFeedbackRow[], error }
}
