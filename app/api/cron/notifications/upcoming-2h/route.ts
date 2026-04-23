import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const { data, error } = await admin.rpc(
      'create_match_upcoming_2h_notifications'
    )
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, created: Number(data ?? 0) })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
