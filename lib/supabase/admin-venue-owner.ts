import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient

/** Resuelve `owner_id` del centro y comprueba que el perfil sea cuenta `venue`. */
export async function requireVenueOwnerId(
  admin: AdminClient,
  venueId: string
): Promise<{ ok: true; ownerId: string } | { ok: false; status: number; error: string }> {
  const { data: venue, error: vErr } = await admin
    .from('sports_venues')
    .select('owner_id')
    .eq('id', venueId)
    .maybeSingle()

  if (vErr || !venue?.owner_id) {
    return { ok: false, status: 404, error: 'Centro no encontrado.' }
  }

  const ownerId = venue.owner_id as string

  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('account_type')
    .eq('id', ownerId)
    .maybeSingle()

  if (pErr || !profile) {
    return { ok: false, status: 400, error: 'No se encontró el perfil del dueño.' }
  }
  if (profile.account_type !== 'venue') {
    return {
      ok: false,
      status: 400,
      error:
        'La cuenta vinculada no es de tipo centro; no se gestiona desde este panel.',
    }
  }

  return { ok: true, ownerId }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeAdminEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email)
}
