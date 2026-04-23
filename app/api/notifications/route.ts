import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSupabaseWithUserJwt,
  requireSession,
} from '@/lib/supabase/require-session'

export const runtime = 'nodejs'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
})

type NotificationRow = {
  id: string
  type: string
  title: string
  body: string
  payload: unknown
  is_read: boolean
  created_at: string
}

export async function GET(req: Request) {
  try {
    const sessionResult = await requireSession(req)
    if (!sessionResult.ok) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    const url = new URL(req.url)
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }
    const limit = parsed.data.limit ?? 10
    const supabase = createSupabaseWithUserJwt(sessionResult.accessToken)

    const [{ data, error }, unread] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, type, title, body, payload, is_read, created_at')
        .eq('user_id', sessionResult.userId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', sessionResult.userId)
        .eq('is_read', false),
    ])

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (unread.error) {
      return NextResponse.json({ error: unread.error.message }, { status: 500 })
    }

    const items = ((data ?? []) as NotificationRow[]).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      payload:
        n.payload && typeof n.payload === 'object'
          ? (n.payload as Record<string, unknown>)
          : {},
      isRead: n.is_read,
      createdAt: n.created_at,
    }))

    return NextResponse.json({
      items,
      unreadCount: unread.count ?? 0,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
