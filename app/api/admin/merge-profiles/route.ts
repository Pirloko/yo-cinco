import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'
import {
  apiLog,
  checkRateLimit,
  createApiContext,
  errorJson,
  reportServerError,
  successJson,
} from '@/lib/server/api-utils'

type MergeBody = {
  sourceUserId?: string
  targetUserId?: string
}

export async function POST(req: Request) {
  const ctx = createApiContext(req)
  const rl = checkRateLimit(req, {
    bucket: 'api:admin:merge-profiles:post',
    limit: 20,
    windowMs: 60_000,
  })
  if (!rl.ok) {
    return errorJson(
      ctx,
      429,
      'Demasiadas solicitudes para fusionar cuentas.',
      'rate_limited',
      undefined,
      { 'Retry-After': String(rl.retryAfterSec) }
    )
  }

  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return errorJson(ctx, 403, auth.error, 'forbidden')

    const body = (await req.json()) as MergeBody
    const sourceUserId = body.sourceUserId?.trim() ?? ''
    const targetUserId = body.targetUserId?.trim() ?? ''
    if (!sourceUserId || !targetUserId) {
      return errorJson(
        ctx,
        400,
        'Debes enviar sourceUserId y targetUserId.',
        'invalid_input'
      )
    }
    if (sourceUserId === targetUserId) {
      return errorJson(ctx, 400, 'Las cuentas deben ser distintas.', 'invalid_input')
    }

    const admin = createAdminClient()
    const { data, error } = await admin.rpc('admin_merge_profile_accounts', {
      p_source_user_id: sourceUserId,
      p_target_user_id: targetUserId,
    })
    if (error) {
      apiLog('error', 'admin_merge_profiles_failed', ctx, { message: error.message })
      return errorJson(ctx, 500, error.message, 'merge_failed')
    }

    const { error: creatorError } = await admin.rpc('admin_reassign_match_creators', {
      p_source_user_id: sourceUserId,
      p_target_user_id: targetUserId,
    })
    if (creatorError) {
      apiLog('warn', 'admin_reassign_match_creators_failed', ctx, {
        message: creatorError.message,
      })
    }

    apiLog('info', 'admin_merge_profiles_ok', ctx, {
      sourceUserId,
      targetUserId,
      adminUserId: auth.userId,
    })
    return successJson(ctx, { merged: data ?? { ok: true } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    apiLog('error', 'admin_merge_profiles_unhandled_error', ctx, { message: msg })
    void reportServerError(e, ctx, { route: 'admin/merge-profiles' })
    return errorJson(ctx, 500, msg, 'internal_error')
  }
}
