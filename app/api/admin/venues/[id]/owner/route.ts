import { NextResponse } from 'next/server'

import { requireVenueOwnerId } from '@/lib/supabase/admin-venue-owner'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

type RouteCtx = { params: Promise<{ id: string }> }

/** Admin: email de acceso actual del dueño del centro (Auth). */
export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }

    const { id: venueId } = await ctx.params
    if (!venueId) {
      return NextResponse.json({ error: 'Falta id del centro.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const resolved = await requireVenueOwnerId(admin, venueId)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const { data, error } = await admin.auth.admin.getUserById(resolved.ownerId)
    if (error || !data?.user) {
      return NextResponse.json(
        { error: error?.message ?? 'No se pudo obtener el usuario.' },
        { status: 400 }
      )
    }

    const email = data.user.email ?? ''
    return NextResponse.json({ email })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
