/**
 * Origen público de la app (sin barra final). Úsalo para OAuth y enlaces absolutos.
 *
 * En producción define `NEXT_PUBLIC_SITE_URL` (ej. `https://www.sportmatch.cl`) en el
 * hosting; debe coincidir con **Site URL** en Supabase Auth (`www` ≠ apex).
 */
export function getPublicSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '')
  return ''
}
