import { NextResponse } from 'next/server'

import { requireVenueOwnerId } from '@/lib/supabase/admin-venue-owner'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * Admin: nueva contraseña para el usuario dueño del centro (`sports_venues.owner_id`).
 * Solo si el perfil asociado es `account_type = venue`.
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

    const body = (await req.json()) as { newPassword?: string }
    const newPassword = body.newPassword ?? ''
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const resolved = await requireVenueOwnerId(admin, venueId)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const { error: uErr } = await admin.auth.admin.updateUserById(resolved.ownerId, {
      password: newPassword,
    })

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
