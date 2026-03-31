import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const status = (searchParams.get('status') ?? 'pending').trim()

    const admin = createAdminClient()
    const q = admin
      .from('player_reports')
      .select(
        'id, reporter_id, reported_user_id, context_type, context_id, reason, details, status, reviewed_by, reviewed_at, resolution, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(200)

    const { data, error } =
      status === 'all' ? await q : await q.eq('status', status)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ reports: data ?? [] })
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
    const admin = createAdminClient()

    const now = new Date().toISOString()

    if (body.action === 'markReviewed') {
      const { error } = await admin
        .from('player_reports')
        .update({
          status: 'reviewed',
          reviewed_by: auth.userId,
          reviewed_at: now,
          resolution: body.resolution ?? null,
        })
        .eq('id', body.reportId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'dismiss') {
      const { error } = await admin
        .from('player_reports')
        .update({
          status: 'dismissed',
          reviewed_by: auth.userId,
          reviewed_at: now,
          resolution: body.resolution ?? null,
        })
        .eq('id', body.reportId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'actionTaken') {
      const { error } = await admin
        .from('player_reports')
        .update({
          status: 'action_taken',
          reviewed_by: auth.userId,
          reviewed_at: now,
          resolution: body.resolution ?? null,
        })
        .eq('id', body.reportId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

