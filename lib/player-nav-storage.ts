/** Última pestaña principal usada en la SPA (para resaltar en rutas públicas como `/centro/...`). */
export const PLAYER_LAST_NAV_STORAGE_KEY = 'pichanga-last-nav-screen'

export type PlayerNavId =
  | 'home'
  | 'explore'
  | 'matches'
  | 'create'
  | 'teams'
  | 'profile'

const IDS = new Set<PlayerNavId>([
  'home',
  'explore',
  'matches',
  'create',
  'teams',
  'profile',
])

export function isPlayerNavId(v: string): v is PlayerNavId {
  return IDS.has(v as PlayerNavId)
}

export function persistPlayerLastNav(id: PlayerNavId): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(PLAYER_LAST_NAV_STORAGE_KEY, id)
  } catch {
    // ignore
  }
}

export function readPlayerLastNav(): PlayerNavId | null {
  if (typeof window === 'undefined') return null
  try {
    const v = sessionStorage.getItem(PLAYER_LAST_NAV_STORAGE_KEY)
    if (!v || !isPlayerNavId(v)) return null
    return v
  } catch {
    return null
  }
}
