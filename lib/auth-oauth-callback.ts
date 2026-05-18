/**
 * Detección del retorno OAuth (Google, etc.) en la SPA.
 * Tras el redirect, Supabase puede emitir INITIAL_SESSION con session=null
 * antes de intercambiar el `code` de la URL; no hay que tratar eso como logout.
 */

export function urlHasPendingAuthCallback(): boolean {
  if (typeof window === 'undefined') return false
  const search = window.location.search
  const hash = window.location.hash
  return (
    search.includes('code=') ||
    search.includes('error=') ||
    search.includes('error_description=') ||
    hash.includes('access_token=') ||
    hash.includes('refresh_token=')
  )
}

/** Quita tokens/código OAuth de la barra de direcciones (sin recargar). */
export function stripAuthParamsFromUrl(): void {
  if (typeof window === 'undefined') return
  if (!urlHasPendingAuthCallback()) return
  const u = new URL(window.location.href)
  u.searchParams.delete('code')
  u.searchParams.delete('error')
  u.searchParams.delete('error_description')
  u.hash = ''
  window.history.replaceState(window.history.state, '', u.pathname + u.search)
}
