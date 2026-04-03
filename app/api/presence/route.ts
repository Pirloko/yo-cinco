import { NextResponse } from 'next/server'

import { createSupabaseWithUserJwt, requireSession } from '@/lib/supabase/require-session'

/**
 * Heartbeat de presencia: actualiza `profiles.last_seen_at` para el usuario autenticado.
 * Llamar periódicamente desde el cliente (p. ej. cada 60–90 s) mientras la app está activa.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }
    const supabase = createSupabaseWithUserJwt(auth.accessToken)
    const now = new Date().toISOString()
    const { error } = await supabase.from('profiles').update({ last_seen_at: now }).eq('id', auth.userId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
