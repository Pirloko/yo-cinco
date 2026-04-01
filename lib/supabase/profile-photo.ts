import type { SupabaseClient } from '@supabase/supabase-js'
import { convertImageFileToWebP } from '@/lib/image-webp'

export const PROFILE_AVATARS_BUCKET = 'profile-avatars'

export function profileAvatarStoragePath(userId: string): string {
  return `${userId}/avatar`
}

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_INPUT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function uploadProfileAvatarFile(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<{ publicUrl: string } | { error: string }> {
  if (!ALLOWED_INPUT.includes(file.type)) {
    return { error: 'Usa una imagen JPG, PNG, WebP o GIF.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'La imagen no puede superar 2 MB.' }
  }

  const toUpload =
    typeof document !== 'undefined'
      ? await convertImageFileToWebP(file)
      : file
  if (toUpload.size > MAX_BYTES) {
    return { error: 'La imagen no puede superar 2 MB tras optimizar.' }
  }

  const path = profileAvatarStoragePath(userId)
  const { error: upErr } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .upload(path, toUpload, {
      upsert: true,
      contentType: toUpload.type || 'image/webp',
      cacheControl: '3600',
    })

  if (upErr) {
    return { error: upErr.message }
  }

  const { data } = supabase.storage.from(PROFILE_AVATARS_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl }
}

/** Misma URL pública tras upsert → el navegador puede seguir mostrando la imagen en caché. Usar versión distinta en `src` para forzar recarga. */
export function cacheBustPublicUrl(url: string, version: number): string {
  if (!url || !url.startsWith('http')) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${version}`
}
