import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export type AppUserFeedbackProfile = {
  whatsapp_phone: string | null
  name: string | null
}

export type AppUserFeedbackRow = {
  id: string
  user_id: string
  message: string
  app_version: string | null
  created_at: string
  /** Join opcional desde `profiles` (lectura admin). */
  profiles?: AppUserFeedbackProfile | AppUserFeedbackProfile[] | null
}

function normalizeFeedbackProfiles(
  row: AppUserFeedbackRow
): AppUserFeedbackRow & { profiles: AppUserFeedbackProfile | null } {
  const raw = row.profiles
  const profiles = Array.isArray(raw) ? raw[0] ?? null : raw ?? null
  return { ...row, profiles }
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
): Promise<{
  rows: Array<AppUserFeedbackRow & { profiles: AppUserFeedbackProfile | null }>
  error: PostgrestError | null
}> {
  const { data, error } = await supabase
    .from('app_user_feedback')
    .select(
      `
      id,
      user_id,
      message,
      app_version,
      created_at,
      profiles ( whatsapp_phone, name )
    `
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  const rows = (data ?? []).map((r) => normalizeFeedbackProfiles(r as AppUserFeedbackRow))
  return { rows, error }
}
