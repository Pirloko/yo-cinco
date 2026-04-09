import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import type { PublicPlayerProfile } from '@/lib/types'
import { CACHE_REVALIDATE_SECONDS } from '@/lib/cache-policy'
import { fetchPublicPlayerProfile } from '@/lib/supabase/queries'
import { isValidTeamInviteId } from '@/lib/team-invite-url'

async function fetchPublicPlayerProfileServerUncached(
  userId: string
): Promise<PublicPlayerProfile | null> {
  if (!isValidTeamInviteId(userId)) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return fetchPublicPlayerProfile(supabase, userId)
}

const fetchPublicPlayerProfileServerCached = unstable_cache(
  async (userId: string) => fetchPublicPlayerProfileServerUncached(userId),
  ['public-player-profile-v1'],
  { revalidate: CACHE_REVALIDATE_SECONDS.publicDynamic }
)

export async function fetchPublicPlayerProfileServer(
  userId: string
): Promise<PublicPlayerProfile | null> {
  return fetchPublicPlayerProfileServerCached(userId)
}
