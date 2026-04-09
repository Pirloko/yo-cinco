/**
 * Defaults globales de TanStack Query (Fase 1 — menos refetch y egress).
 * Importar desde `query-client-provider`; si una query necesita otro comportamiento,
 * sobrescribir solo esa query (p. ej. staleTime más bajo para datos en vivo puros).
 */

/** Ventana en la que los datos se consideran frescos (sin refetch al montar / navegar). Rango pedido: 2–5 min. */
export const QUERY_STALE_TIME_MS = 3 * 60 * 1000

/**
 * Tiempo que los datos inactivos permanecen en caché tras desmontar el último observador.
 * TanStack Query v5: `gcTime` (antes cacheTime). Rango pedido: 10–30 min.
 */
export const QUERY_GC_TIME_MS = 20 * 60 * 1000
