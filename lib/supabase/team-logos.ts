import type { SupabaseClient } from '@supabase/supabase-js'

export const TEAM_LOGOS_BUCKET = 'team-logos'

export function teamLogoStoragePath(teamId: string): string {
  return `${teamId}/logo`
}

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function uploadTeamLogoFile(
  supabase: SupabaseClient,
  teamId: string,
  file: File
): Promise<{ publicUrl: string } | { error: string }> {
  if (!ALLOWED.includes(file.type)) {
    return { error: 'Usa JPG, PNG, WebP o GIF.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'La imagen no puede superar 2 MB.' }
  }

  const path = teamLogoStoragePath(teamId)
  const { error: upErr } = await supabase.storage
    .from(TEAM_LOGOS_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    })

  if (upErr) {
    return { error: upErr.message }
  }

  const { data } = supabase.storage.from(TEAM_LOGOS_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl }
}

export async function deleteTeamLogoFile(
  supabase: SupabaseClient,
  teamId: string
): Promise<{ ok: true } | { error: string }> {
  const path = teamLogoStoragePath(teamId)
  const { error } = await supabase.storage.from(TEAM_LOGOS_BUCKET).remove([path])
  if (error) {
    return { error: error.message }
  }
  return { ok: true }
}
