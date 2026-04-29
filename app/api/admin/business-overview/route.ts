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
import { parseAdminCeoSnapshot } from '@/lib/admin/ceo-snapshot'

type RangeKey = 'day' | '7d' | '15d' | 'month' | 'semester' | 'year'

function buildFromDate(range: RangeKey): Date {
  const now = new Date()
  const d = new Date(now)
  switch (range) {
    case 'day':
      d.setHours(0, 0, 0, 0)
      return d
    case '7d':
      d.setDate(d.getDate() - 7)
      return d
    case '15d':
      d.setDate(d.getDate() - 15)
      return d
    case 'month':
      d.setMonth(d.getMonth() - 1)
      return d
    case 'semester':
      d.setMonth(d.getMonth() - 6)
      return d
    case 'year':
      d.setFullYear(d.getFullYear() - 1)
      return d
    default:
      d.setMonth(d.getMonth() - 1)
      return d
  }
}

export async function GET(req: Request) {
  const ctx = createApiContext(req)
  const rl = checkRateLimit(req, {
    bucket: 'api:admin:business-overview:get',
    limit: 60,
    windowMs: 60_000,
  })
  if (!rl.ok) {
    return errorJson(
      ctx,
      429,
      'Demasiadas solicitudes.',
      'rate_limited',
      undefined,
      { 'Retry-After': String(rl.retryAfterSec) }
    )
  }
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return errorJson(ctx, 403, auth.error, 'forbidden')
    }
    const reqUrl = new URL(req.url)
    const range = (reqUrl.searchParams.get('range') ?? 'month') as RangeKey
    if (!['day', '7d', '15d', 'month', 'semester', 'year'].includes(range)) {
      return errorJson(ctx, 400, 'Rango inválido', 'bad_request')
    }

    const pFrom = buildFromDate(range)
    const pTo = new Date()
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('admin_ceo_business_snapshot', {
      p_from: pFrom.toISOString(),
      p_to: pTo.toISOString(),
      p_tz: 'America/Santiago',
    })
    if (error) {
      apiLog('error', 'admin_ceo_snapshot_rpc_error', ctx, { message: error.message })
      return errorJson(ctx, 500, error.message, 'rpc_error')
    }
    const parsed = parseAdminCeoSnapshot(data)
    if (!parsed) {
      return errorJson(ctx, 500, 'Respuesta RPC inválida', 'invalid_payload')
    }
    apiLog('info', 'admin_business_overview_served', ctx, { range })
    return successJson(ctx, { range, snapshot: parsed })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    apiLog('error', 'admin_business_overview_unhandled', ctx, { message: msg })
    void reportServerError(e, ctx, { route: 'admin/business-overview' })
    return errorJson(ctx, 500, msg, 'internal_error')
  }
}
