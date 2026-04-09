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
