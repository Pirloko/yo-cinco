import { createSupabaseWithUserJwt, requireSession } from '@/lib/supabase/require-session'
import {
  apiLog,
  checkRateLimit,
  createApiContext,
  errorJson,
  reportServerError,
  successJson,
} from '@/lib/server/api-utils'

/**
 * Heartbeat de presencia: actualiza `profiles.last_seen_at` para el usuario autenticado.
 * Llamar periódicamente desde el cliente (p. ej. cada 60–90 s) mientras la app está activa.
 */
export async function POST(req: Request) {
  const ctx = createApiContext(req)
  const rl = checkRateLimit(req, {
    bucket: 'api:presence:post',
    limit: 90,
    windowMs: 60_000,
  })
  if (!rl.ok) {
    apiLog('warn', 'rate_limited', ctx, {
      route: 'presence',
      retryAfterSec: rl.retryAfterSec,
    })
    return errorJson(
      ctx,
      429,
      'Demasiadas solicitudes de presencia.',
      'rate_limited',
      undefined,
      { 'Retry-After': String(rl.retryAfterSec) }
    )
  }
  try {
    const auth = await requireSession(req)
    if (!auth.ok) {
      return errorJson(ctx, 401, auth.error, 'unauthorized')
    }
    const supabase = createSupabaseWithUserJwt(auth.accessToken)
    const now = new Date().toISOString()
    const { error } = await supabase.from('profiles').update({ last_seen_at: now }).eq('id', auth.userId)
    if (error) {
      apiLog('warn', 'presence_update_failed', ctx, {
        userId: auth.userId,
        message: error.message,
      })
      return errorJson(ctx, 400, error.message, 'presence_update_failed')
    }
    return successJson(ctx, {})
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    apiLog('error', 'presence_unhandled_error', ctx, { message: msg })
    void reportServerError(e, ctx, { route: 'presence' })
    return errorJson(ctx, 500, msg, 'internal_error')
  }
}
