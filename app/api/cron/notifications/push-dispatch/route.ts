import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchPendingNotificationPushes } from '@/lib/notifications/push-dispatch'

export const runtime = 'nodejs'

function isAuthorized(req: Request): boolean {
  const expected = process.env.NOTIFICATIONS_CRON_SECRET?.trim()
  if (!expected) return false
  const byHeader = req.headers.get('x-sportmatch-cron-secret')?.trim() ?? ''
  if (byHeader && byHeader === expected) return true
  const auth = req.headers.get('authorization')?.trim() ?? ''
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim() === expected
  }
  return false
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  try {
    const admin = createAdminClient()
    const stats = await dispatchPendingNotificationPushes(admin)
    return NextResponse.json({ ok: true, ...stats })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
