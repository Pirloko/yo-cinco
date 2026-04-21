import {
  createSupabaseWithUserJwt,
  requireSession,
} from '@/lib/supabase/require-session'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const bodySchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
})

/**
 * Guarda o actualiza la suscripción push del usuario autenticado.
 * Acepta cookies SSR o Authorization: Bearer (SPA con sesión en localStorage).
 * user_id sale del JWT; no se acepta user_id del body.
 */
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

    const { endpoint, keys } = parsed.data
    const supabase = createSupabaseWithUserJwt(sessionResult.accessToken)
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: sessionResult.userId,
        endpoint,
        p256dh_key: keys.p256dh,
        auth_key: keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' }
    )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
