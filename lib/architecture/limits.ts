/**
 * Límites y temporización globales — Realtime, hub y batches.
 * Una sola fuente para evitar drift entre módulos.
 */

/** Debounce del flush de eventos match (postgres_changes). */
export const DEBOUNCE_MATCH_MS = 250

/** Espera máxima antes de forzar flush match (cola). */
export const MAX_WAIT_MATCH_MS = 2000

/** Hub secundario: máximo de ids por categoría en RPC `matches_hub_secondary_bundle` + fallback REST. */
export const MAX_HUB_SECONDARY_IDS = 20

/** Alias semántico (documentación / imports cortos). */
export const MAX_HUB_IDS = MAX_HUB_SECONDARY_IDS

/** Límite de eventos WAL procesados por flush (evita picos de CPU/memoria). El resto queda en cola siguiente. */
export const MAX_REALTIME_BATCH_EVENTS = 50
