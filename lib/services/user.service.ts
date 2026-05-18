import type { SupabaseClient } from '@supabase/supabase-js'
import type { Gender, User } from '@/lib/types'
import { fetchOtherProfiles, fetchProfileForUser } from '@/lib/supabase/queries'

export async function loadOtherPlayersForUser(
  supabase: SupabaseClient,
  userId: string,
  gender: Gender
): Promise<User[]> {
  return fetchOtherProfiles(supabase, userId, gender)
}

export async function loadProfileForUser(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<User | null> {
  return fetchProfileForUser(supabase, userId, email)
}

/** Tras OAuth el trigger `handle_new_user` puede tardar unos ms en crear `profiles`. */
export async function loadProfileForUserWithRetry(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  opts?: { maxAttempts?: number; delayMs?: number }
): Promise<User | null> {
  const maxAttempts = opts?.maxAttempts ?? 6
  const delayMs = opts?.delayMs ?? 350
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const profile = await fetchProfileForUser(supabase, userId, email)
    if (profile) return profile
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)))
    }
  }
  return null
}
