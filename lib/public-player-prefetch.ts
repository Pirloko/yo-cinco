import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { QUERY_STALE_TIME_MS } from '@/lib/query-defaults'
import { isValidTeamInviteId } from '@/lib/team-invite-url'
import { fetchPublicPlayerProfile } from '@/lib/public-player-profile-fetch'

/**
 * Prefetch del perfil público (Fase 6): TanStack deduplica con el sheet y otros
 * prefetch en vuelo; staleTime alineado con defaults globales.
 */
export function prefetchPublicPlayerProfile(
  queryClient: QueryClient,
  userId: string
): Promise<void> {
  const id = userId.trim()
  if (!id || !isValidTeamInviteId(id)) return Promise.resolve()
  if (typeof window === 'undefined') return Promise.resolve()
  return queryClient
    .prefetchQuery({
      queryKey: queryKeys.publicPlayer.detail(id),
      queryFn: ({ signal }) => fetchPublicPlayerProfile(id, signal),
      staleTime: QUERY_STALE_TIME_MS,
    })
    .then(() => {})
}
