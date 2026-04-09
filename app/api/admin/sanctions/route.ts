import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

/** Cliente con JWT del admin: las RPC `admin_*` comprueban `is_admin()` vía `auth.uid()`. */
function createSupabaseWithUserJwt(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

type Body =
  | {
      action: 'applyCard'
      userId: string
      card: 'yellow' | 'red'
      reason?: string
    }
  | {
      action: 'ban'
      userId: string
      reason?: string
    }
  | {
      action: 'clearSuspension'
      userId: string
    }
  | {
      action: 'clearBan'
      userId: string
    }

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }
    const body = (await req.json()) as Body
    const admin = createAdminClient()

    if (body.action === 'applyCard' || body.action === 'ban') {
      let rpcClient
      try {
        rpcClient = createSupabaseWithUserJwt(auth.accessToken)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Configuración Supabase incompleta'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
      if (body.action === 'applyCard') {
        const { error } = await rpcClient.rpc('admin_apply_card', {
          p_user_id: body.userId,
          p_card: body.card,
          p_reason: body.reason ?? null,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }
      const { error } = await rpcClient.rpc('admin_ban_user', {
        p_user_id: body.userId,
        p_reason: body.reason ?? null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'clearSuspension') {
      let rpcClient
      try {
        rpcClient = createSupabaseWithUserJwt(auth.accessToken)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Configuración Supabase incompleta'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
      const { error } = await rpcClient.rpc('admin_clear_suspension', {
        p_user_id: body.userId,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'clearBan') {
      let rpcClient
      try {
        rpcClient = createSupabaseWithUserJwt(auth.accessToken)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Configuración Supabase incompleta'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
      const { error } = await rpcClient.rpc('admin_clear_ban', {
        p_user_id: body.userId,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

