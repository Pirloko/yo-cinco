import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

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
  | {
      action: 'resetCards'
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

    if (body.action === 'applyCard') {
      const { error } = await admin.rpc('admin_apply_card', {
        p_user_id: body.userId,
        p_card: body.card,
        p_reason: body.reason ?? null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'ban') {
      const { error } = await admin.rpc('admin_ban_user', {
        p_user_id: body.userId,
        p_reason: body.reason ?? null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'clearSuspension') {
      const { error } = await admin
        .from('profiles')
        .update({ mod_suspended_until: null })
        .eq('id', body.userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'clearBan') {
      const { error } = await admin
        .from('profiles')
        .update({ mod_banned_at: null, mod_ban_reason: null })
        .eq('id', body.userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'resetCards') {
      const { error } = await admin
        .from('profiles')
        .update({ mod_yellow_cards: 0, mod_red_cards: 0 })
        .eq('id', body.userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

