import { NextResponse } from 'next/server'

import { parseVenuePhoneChile } from '@/lib/player-whatsapp'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }
    const { id } = await ctx.params
    if (!id) {
      return NextResponse.json({ error: 'Falta id del centro.' }, { status: 400 })
    }

    const body = (await req.json()) as {
      name?: string
      address?: string
      phone?: string
      cityId?: string
      mapsUrl?: string | null
      isPaused?: boolean
    }

    const admin = createAdminClient()
    const patch: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const n = String(body.name).trim()
      if (!n) {
        return NextResponse.json({ error: 'El nombre no puede estar vacío.' }, { status: 400 })
      }
      patch.name = n
    }
    if (body.address !== undefined) {
      patch.address = String(body.address).trim()
    }
    if (body.phone !== undefined) {
      const parsed = parseVenuePhoneChile(body.phone)
      if (!parsed.valid) {
        return NextResponse.json(
          {
            error:
              'Teléfono inválido. Usa móvil chileno: +569 y 8 dígitos, o déjalo vacío.',
          },
          { status: 400 }
        )
      }
      patch.phone = parsed.value
    }
    if (body.mapsUrl !== undefined) {
      const u = body.mapsUrl === null ? '' : String(body.mapsUrl).trim()
      patch.maps_url = u || null
    }
    if (body.isPaused !== undefined) {
      patch.is_paused = Boolean(body.isPaused)
    }
    if (body.cityId !== undefined) {
      const cid = String(body.cityId).trim()
      if (!cid) {
        return NextResponse.json({ error: 'Ciudad inválida.' }, { status: 400 })
      }
      const { data: gc, error: gErr } = await admin
        .from('geo_cities')
        .select('name')
        .eq('id', cid)
        .maybeSingle()
      if (gErr || !gc) {
        return NextResponse.json({ error: 'Ciudad no encontrada en el catálogo.' }, { status: 400 })
      }
      patch.city_id = cid
      patch.city = (gc.name as string) ?? ''
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
    }

    const { error } = await admin.from('sports_venues').update(patch).eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }
    const { id } = await ctx.params
    if (!id) {
      return NextResponse.json({ error: 'Falta id del centro.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.from('sports_venues').delete().eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
