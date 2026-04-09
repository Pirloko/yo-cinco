/**
 * Politica central de cache para server/client.
 * Mantener aqui los TTL evita divergencias entre paginas, APIs y helpers.
 */
export const CACHE_REVALIDATE_SECONDS = {
  /** Contenido publico con cambios poco frecuentes. */
  publicStatic: 300,
  /** Contenido publico sensible a cambios recientes (cupos, participantes, moderacion). */
  publicDynamic: 60,
} as const

/** TTL local de cliente para snapshots publicos ya obtenidos via API cacheada. */
export const CLIENT_PROFILE_CACHE_TTL_MS = 60_000
/** Cache corto para datos publicos dinamicos (perfiles/snapshots que cambian seguido). */
export const CACHE_SERVER_DYNAMIC_SHORT_S = 60

/** Cache medio para listados SEO/publicos con menor volatilidad. */
export const CACHE_SERVER_PUBLIC_LIST_S = 300

/** Cache largo para artefactos casi estaticos (ej. sitemap). */
export const CACHE_SERVER_STATIC_LONG_S = 3600

/** Margen SWR recomendado para CDN/proxy sobre datos dinamicos. */
export const CACHE_SERVER_STALE_WHILE_REVALIDATE_S = 300
