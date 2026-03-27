import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'No autenticado' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.account_type !== 'admin') {
    return { ok: false as const, error: 'No autorizado' }
  }
  return { ok: true as const, userId: user.id }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }

    const body = (await req.json()) as {
      email?: string
      password?: string
      venueName?: string
      city?: string
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
