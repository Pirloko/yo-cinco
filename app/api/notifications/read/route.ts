import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSupabaseWithUserJwt,
  requireSession,
} from '@/lib/supabase/require-session'

export const runtime = 'nodejs'

const bodySchema = z.object({
  notificationId: z.string().uuid(),
})

export async function POST(req: Request) {
  try {
    const sessionResult = await requireSession(req)
    if (!sessionResult.ok) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const raw: unknown = await req.json()
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const supabase = createSupabaseWithUserJwt(sessionResult.accessToken)
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', parsed.data.notificationId)
      .eq('user_id', sessionResult.userId)
      .eq('is_read', false)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
