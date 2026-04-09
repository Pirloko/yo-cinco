import type { PublicPlayerProfile } from '@/lib/types'
import { isValidTeamInviteId } from '@/lib/team-invite-url'
import { CACHE_SERVER_DYNAMIC_SHORT_S } from '@/lib/cache-policy'

type CacheEntry = {
  expiresAt: number
  value: PublicPlayerProfile | null
}

const profileCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<PublicPlayerProfile | null>>()

async function fetchProfileFromApi(
  userId: string,
  signal?: AbortSignal
): Promise<PublicPlayerProfile | null> {
  const res = await fetch(
    `/api/public-player-profile?userId=${encodeURIComponent(userId)}`,
    { signal, cache: 'no-store' }
  )
  if (!res.ok) return null
  const json = (await res.json()) as { profile?: PublicPlayerProfile | null }
  return json.profile ?? null
}

export function prefetchPublicPlayerProfile(userId: string) {
  void getPublicPlayerProfileCached(userId).catch(() => {})
}

export async function getPublicPlayerProfileCached(
  userId: string,
  options?: { force?: boolean; signal?: AbortSignal }
): Promise<PublicPlayerProfile | null> {
  const id = userId.trim()
  if (!id || !isValidTeamInviteId(id)) return null
  const now = Date.now()
  if (!options?.force) {
    const hit = profileCache.get(id)
    if (hit && hit.expiresAt > now) {
      return hit.value
    }
  }
  const existing = inFlight.get(id)
  if (existing) return existing
  const req = fetchProfileFromApi(id, options?.signal)
    .then((value) => {
      profileCache.set(id, {
        value,
        expiresAt: Date.now() + CACHE_SERVER_DYNAMIC_SHORT_S * 1000,
      })
      return value
    })
    .finally(() => {
      inFlight.delete(id)
    })
  inFlight.set(id, req)
  return req
}
