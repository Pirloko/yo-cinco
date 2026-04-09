import { fetchPublicPlayerProfileServer } from '@/lib/supabase/public-player-server'
import { CACHE_REVALIDATE_SECONDS } from '@/lib/cache-policy'
import { isValidTeamInviteId } from '@/lib/team-invite-url'
import {
  apiLog,
  checkRateLimit,
  createApiContext,
  errorJson,
  reportServerError,
  successJson,
} from '@/lib/server/api-utils'

export const revalidate = 60

export async function GET(request: Request) {
  const ctx = createApiContext(request)
  const rl = checkRateLimit(request, {
    bucket: 'api:public-player-profile:get',
    limit: 180,
    windowMs: 60_000,
  })
  if (!rl.ok) {
    apiLog('warn', 'rate_limited', ctx, {
      route: 'public-player-profile',
      retryAfterSec: rl.retryAfterSec,
    })
    return errorJson(
      ctx,
      429,
      'Demasiadas solicitudes, intenta nuevamente en unos segundos.',
      'rate_limited',
      undefined,
      { 'Retry-After': String(rl.retryAfterSec) }
    )
  }
  const { searchParams } = new URL(request.url)
  const userId = (searchParams.get('userId') ?? '').trim()
  if (!userId || !isValidTeamInviteId(userId)) {
    apiLog('warn', 'invalid_user_id', ctx, { userId })
    return errorJson(ctx, 400, 'invalid_user_id', 'invalid_user_id')
  }
  try {
    const profile = await fetchPublicPlayerProfileServer(userId)
    apiLog('info', 'public_profile_served', ctx, {
      hasProfile: Boolean(profile),
      remaining: rl.remaining,
    })
    return successJson(
      ctx,
      { profile },
      200,
      {
        'Cache-Control': `public, s-maxage=${CACHE_REVALIDATE_SECONDS.publicDynamic}, stale-while-revalidate=${CACHE_REVALIDATE_SECONDS.publicDynamic}`,
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    apiLog('error', 'public_profile_failed', ctx, { message })
    void reportServerError(error, ctx, { route: 'public-player-profile' })
    return errorJson(ctx, 500, message, 'internal_error')
  }
}
