import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

/** Cliente con JWT del admin para RPCs `admin_*` (validan con `is_admin()` vía auth.uid()). */
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

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const status = (searchParams.get('status') ?? 'pending').trim()

    const admin = createAdminClient()
    const baseSelect =
      'id, reporter_id, reported_user_id, context_type, context_id, reason, details, status, reviewed_by, reviewed_at, resolution, created_at'

    let query = admin
      .from('player_reports')
      .select(baseSelect)
      .order('created_at', { ascending: false })
      .limit(200)

    if (status === 'history') {
      query = query.in('status', ['dismissed', 'reviewed', 'action_taken'])
    } else if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data ?? []
    const ids = [
      ...new Set(
        rows.flatMap((r) => [r.reporter_id as string, r.reported_user_id as string])
      ),
    ]
    let profileById = new Map<
      string,
      { id: string; name: string; photo_url: string; mod_banned_at: string | null }
    >()
    if (ids.length > 0) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, name, photo_url, mod_banned_at')
        .in('id', ids)
      profileById = new Map(
        (profs ?? []).map((p) => [
          p.id as string,
          {
            id: p.id as string,
            name: (p.name as string) ?? 'Sin nombre',
            photo_url: (p.photo_url as string) ?? '',
            mod_banned_at: (p.mod_banned_at as string | null) ?? null,
          },
        ])
      )
    }

    const reports = rows.map((r) => ({
      ...r,
      reporter_profile: profileById.get(r.reporter_id as string) ?? null,
      reported_profile: profileById.get(r.reported_user_id as string) ?? null,
    }))

    return NextResponse.json({ reports })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

type Body =
  | {
      action: 'markReviewed'
      reportId: string
      resolution?: string
    }
  | {
      action: 'dismiss'
      reportId: string
      resolution?: string
    }
  | {
      action: 'actionTaken'
      reportId: string
      resolution?: string
    }

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }
    const body = (await req.json()) as Body
    let rpcClient
    try {
      rpcClient = createSupabaseWithUserJwt(auth.accessToken)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Configuración Supabase incompleta'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    if (body.action === 'markReviewed') {
      const { error } = await rpcClient.rpc('admin_update_player_report_status', {
        p_report_id: body.reportId,
        p_status: 'reviewed',
        p_resolution: body.resolution ?? null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'dismiss') {
      const { error } = await rpcClient.rpc('admin_update_player_report_status', {
        p_report_id: body.reportId,
        p_status: 'dismissed',
        p_resolution: body.resolution ?? null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'actionTaken') {
      const { error } = await rpcClient.rpc('admin_update_player_report_status', {
        p_report_id: body.reportId,
        p_status: 'action_taken',
        p_resolution: body.resolution ?? null,
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

