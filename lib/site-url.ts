/**
 * Origen público de la app (sin barra final). Úsalo para OAuth y enlaces absolutos.
 *
 * En producción define `NEXT_PUBLIC_SITE_URL` (ej. `https://tu-dominio.com`) en el
 * hosting; si no, en el navegador se usa `window.location.origin`.
 */
export function getPublicSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}
