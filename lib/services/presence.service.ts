import type { SupabaseClient } from '@supabase/supabase-js'

/** Evita ráfagas de UPDATE a Supabase (p. ej. auth + login duplicados). */
const lastUpdateAtByUser = new Map<string, number>()

/** Intervalo mínimo entre actualizaciones pasivas (sesión / token). */
const DEFAULT_MIN_INTERVAL_MS = 90_000

export type UpdateLastSeenOptions = {
  /** Si true, ignora el throttle (acciones explícitas: chat, crear partido, etc.). */
  force?: boolean
  minIntervalMs?: number
}

/**
 * Actualiza `profiles.last_seen_at` para el usuario autenticado vía cliente Supabase (RLS).
 * Reemplaza el antiguo heartbeat POST `/api/presence` para reducir invocaciones serverless.
 */
export async function updateLastSeen(
  supabase: SupabaseClient,
  userId: string,
  options?: UpdateLastSeenOptions
): Promise<boolean> {
  const min = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  const now = Date.now()
  const prev = lastUpdateAtByUser.get(userId)
  if (!options?.force && prev != null && now - prev < min) {
    return false
  }
  lastUpdateAtByUser.set(userId, now)

  const { error } = await supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[presence] updateLastSeen failed', error.message)
    }
    return false
  }
  return true
}

/** Llamar al cerrar sesión para no arrastrar throttle entre cuentas en el mismo navegador. */
export function resetPresenceDebounceState(): void {
  lastUpdateAtByUser.clear()
}
