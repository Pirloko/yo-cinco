import type { PublicPlayerProfile } from '@/lib/types'
import { isValidTeamInviteId } from '@/lib/team-invite-url'

/** Misma ruta que el sheet y el prefetch; `no-store` para alinear con TanStack staleTime. */
export async function fetchPublicPlayerProfile(
  userId: string,
  signal?: AbortSignal
): Promise<PublicPlayerProfile | null> {
  const id = userId.trim()
  if (!id || !isValidTeamInviteId(id)) return null
  const res = await fetch(
    `/api/public-player-profile?userId=${encodeURIComponent(id)}`,
    { signal, cache: 'no-store' }
  )
  if (!res.ok) return null
  const json = (await res.json()) as { profile?: PublicPlayerProfile | null }
  return json.profile ?? null
}
