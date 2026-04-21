import { createAdminClient } from '@/lib/supabase/admin'
import { configureWebPush, webpush } from '@/lib/push/web-push-server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const sendSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  /** Ruta relativa (ej. /matches) o URL absoluta para notificationclick */
  openPath: z.string().max(1024).optional(),
})

function authorizeSend(req: Request): boolean {
  const secret = process.env.PUSH_SEND_SECRET?.trim()
  if (!secret) return false
  return req.headers.get('x-sportmatch-push-secret') === secret
}

function buildOpenUrl(openPath: string | undefined): string {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'https://www.sportmatch.cl'
  if (!openPath || openPath.length === 0) return `${site}/`
  if (openPath.startsWith('http://') || openPath.startsWith('https://')) {
    return openPath
  }
  const path = openPath.startsWith('/') ? openPath : `/${openPath}`
  return `${site}${path}`
}

type SubRow = {
  id: string
  endpoint: string
  p256dh_key: string
  auth_key: string
}

/**
 * Envía un push a todas las suscripciones de los userIds indicados.
 * Requiere header x-sportmatch-push-secret = PUSH_SEND_SECRET (solo backend / automatización).
 * Usa service role para leer filas y eliminar suscripciones expiradas (410/404).
 */
export async function POST(req: Request) {
  if (!authorizeSend(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json(
      { error: 'Servidor sin SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    )
  }

  try {
    configureWebPush()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'VAPID no configurado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  try {
    const raw: unknown = await req.json()
    const parsed = sendSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const { userIds, title, body, openPath } = parsed.data
    const url = buildOpenUrl(openPath)
    const payload = JSON.stringify({
      title,
      body,
      data: { url },
    })

    const { data: rows, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh_key, auth_key')
      .in('user_id', userIds)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const list = (rows ?? []) as SubRow[]
    let sent = 0
    let removed = 0

    for (const row of list) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: {
              p256dh: row.p256dh_key,
              auth: row.auth_key,
            },
          },
          payload,
          { TTL: 3600 }
        )
        sent += 1
      } catch (e: unknown) {
        const statusCode =
          e && typeof e === 'object' && 'statusCode' in e
            ? Number((e as { statusCode: number }).statusCode)
            : 0
        if (statusCode === 410 || statusCode === 404) {
          await admin.from('push_subscriptions').delete().eq('id', row.id)
          removed += 1
        }
      }
    }

    return NextResponse.json({
      ok: true,
      targets: list.length,
      sent,
      removedInvalid: removed,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
