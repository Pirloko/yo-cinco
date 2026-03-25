import type { SupabaseClient } from '@supabase/supabase-js'

export const PROFILE_AVATARS_BUCKET = 'profile-avatars'

export function profileAvatarStoragePath(userId: string): string {
  return `${userId}/avatar`
}

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function uploadProfileAvatarFile(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<{ publicUrl: string } | { error: string }> {
  if (!ALLOWED.includes(file.type)) {
    return { error: 'Usa una imagen JPG, PNG, WebP o GIF.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'La imagen no puede superar 2 MB.' }
  }

  const path = profileAvatarStoragePath(userId)
  const { error: upErr } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    })

  if (upErr) {
    return { error: upErr.message }
  }

  const { data } = supabase.storage.from(PROFILE_AVATARS_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl }
}
