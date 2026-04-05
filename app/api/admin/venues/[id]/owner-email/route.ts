import { NextResponse } from 'next/server'

import {
  isValidEmailFormat,
  normalizeAdminEmail,
  requireVenueOwnerId,
} from '@/lib/supabase/admin-venue-owner'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * Admin: nuevo email de acceso para el dueño del centro (Auth).
 * `email_confirm: true` para que pueda entrar de inmediato sin flujo de confirmación.
 */
export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }

    const { id: venueId } = await ctx.params
    if (!venueId) {
      return NextResponse.json({ error: 'Falta id del centro.' }, { status: 400 })
    }

    const body = (await req.json()) as { newEmail?: string }
    const newEmail = normalizeAdminEmail(body.newEmail ?? '')
    if (!newEmail || !isValidEmailFormat(newEmail)) {
      return NextResponse.json({ error: 'Ingresa un correo electrónico válido.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const resolved = await requireVenueOwnerId(admin, venueId)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const { error: uErr } = await admin.auth.admin.updateUserById(resolved.ownerId, {
      email: newEmail,
      email_confirm: true,
    })

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, email: newEmail })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
