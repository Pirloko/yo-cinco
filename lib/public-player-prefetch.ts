import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { QUERY_STALE_TIME_MS } from '@/lib/query-defaults'
import { isValidTeamInviteId } from '@/lib/team-invite-url'
import { fetchPublicPlayerProfile } from '@/lib/public-player-profile-fetch'

/**
 * Prefetch del perfil público: optimización de UX, NO crítico (el sheet usa
 * useQuery con la misma queryKey y hace fetch si hace falta).
 *
 * Egress / frecuencia:
 * - Debounce por userId para no disparar en cada movimiento de puntero.
 * - Tras un prefetch exitoso, no repetir para el mismo id en la sesión de pestaña.
 * - staleTime alineado con defaults globales (≈ 5 min); refetchOnWindowFocus ya
 *   es false en el QueryClient por defecto del proyecto.
 */
const PREFETCH_DEBOUNCE_MS = 200

/** userId ya prefetcheado con éxito en esta pestaña (evita repetir egress). */
const sessionPrefetchedUserIds = new Set<string>()

/** En el navegador `setTimeout` devuelve `number` (id de timer). */
const debounceTimers = new Map<string, number>()

export function prefetchPublicPlayerProfile(
  queryClient: QueryClient,
  userId: string
): void {
  const id = userId.trim()
  if (!id || !isValidTeamInviteId(id)) return
  if (typeof window === 'undefined') return
  if (sessionPrefetchedUserIds.has(id)) return

  const prev = debounceTimers.get(id)
  if (prev !== undefined) {
    window.clearTimeout(prev)
  }

  debounceTimers.set(
    id,
    window.setTimeout(() => {
      debounceTimers.delete(id)
      if (sessionPrefetchedUserIds.has(id)) return

      void queryClient
        .prefetchQuery({
          queryKey: queryKeys.publicPlayer.detail(id),
          queryFn: ({ signal }) => fetchPublicPlayerProfile(id, signal),
          staleTime: QUERY_STALE_TIME_MS,
        })
        .then(() => {
          sessionPrefetchedUserIds.add(id)
        })
        .catch(() => {
          /* no marcar: permite reintentar con otro hover */
        })
    }, PREFETCH_DEBOUNCE_MS)
  )
}
