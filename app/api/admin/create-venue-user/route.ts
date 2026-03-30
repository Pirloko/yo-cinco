import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchDefaultCityId } from '@/lib/supabase/geo-queries'
import { requireAdmin } from '@/lib/supabase/require-admin'

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }

    const body = (await req.json()) as {
      email?: string
      password?: string
      venueName?: string
      city?: string
      cityId?: string
      address?: string
      phone?: string
      mapsUrl?: string
    }

    const email = body.email?.trim().toLowerCase() ?? ''
    const password = body.password ?? ''
    const venueName = body.venueName?.trim() ?? ''
    if (!email || !password || !venueName) {
      return NextResponse.json(
        { error: 'Email, clave y nombre del centro son obligatorios.' },
        { status: 400 }
      )
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La clave debe tener al menos 6 caracteres.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const defaultCityId = await fetchDefaultCityId(admin)
    if (!defaultCityId) {
      return NextResponse.json(
        { error: 'No hay ciudad por defecto en el catálogo geo (ej. Rancagua).' },
        { status: 500 }
      )
    }
    const resolvedCityId = body.cityId?.trim() || defaultCityId
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: venueName, name: venueName },
    })
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? 'No se pudo crear el usuario.' },
        { status: 400 }
      )
    }

    const userId = created.user.id
    const { error: profileErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        name: venueName,
        city: body.city?.trim() || 'Rancagua',
        city_id: resolvedCityId,
        account_type: 'venue',
      },
      { onConflict: 'id' }
    )
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 400 })
    }

    const { error: venueErr } = await admin.from('sports_venues').insert({
      owner_id: userId,
      name: venueName,
      address: body.address?.trim() || '',
      phone: body.phone?.trim() || '',
      city: body.city?.trim() || 'Rancagua',
      city_id: resolvedCityId,
      maps_url: body.mapsUrl?.trim() || null,
      slot_duration_minutes: 60,
    })
    if (venueErr) {
      return NextResponse.json(
        { error: `Usuario creado, pero no se pudo crear el centro: ${venueErr.message}` },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, userId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
