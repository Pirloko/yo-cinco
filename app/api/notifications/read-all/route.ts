import { NextResponse } from 'next/server'
import {
  createSupabaseWithUserJwt,
  requireSession,
} from '@/lib/supabase/require-session'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const sessionResult = await requireSession(req)
    if (!sessionResult.ok) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const supabase = createSupabaseWithUserJwt(sessionResult.accessToken)
    const { data, error } = await supabase.rpc('mark_all_notifications_read')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, updated: Number(data ?? 0) })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
