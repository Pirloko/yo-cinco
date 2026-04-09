/**
 * Defaults globales de TanStack Query (Fases 1 y 3 — menos refetch y egress).
 * Importar desde `query-client-provider`; si una query necesita otro comportamiento,
 * sobrescribir solo esa query (p. ej. staleTime más bajo para datos en vivo puros).
 */

/** Datos “normales”: frescos sin refetch al remontar pestaña mientras dure la ventana (Fase 3: 5 min). */
export const QUERY_STALE_TIME_MS = 5 * 60 * 1000

/**
 * Catálogos / metadata que cambian poco (ciudades, listado de centros, contacto público).
 * Reduce requests al navegar entre home, explorar y crear.
 */
export const QUERY_STALE_TIME_STATIC_MS = 15 * 60 * 1000

/**
 * Tiempo que los datos inactivos permanecen en caché tras desmontar el último observador.
 * TanStack Query v5: `gcTime` (antes cacheTime).
 */
export const QUERY_GC_TIME_MS = 30 * 60 * 1000
