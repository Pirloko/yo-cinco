import type { SupabaseClient } from '@supabase/supabase-js'
import { configureWebPush, webpush } from '@/lib/push/web-push-server'

type NotificationRow = {
  id: string
  user_id: string
  title: string
  body: string
  payload: Record<string, unknown> | null
}

type PushSubRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh_key: string
  auth_key: string
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'https://www.sportmatch.cl'
  )
}

function resolveOpenPath(payload: Record<string, unknown> | null): string {
  const matchId =
    typeof payload?.matchId === 'string' ? payload.matchId.trim() : ''
  const targetTab =
    typeof payload?.targetTab === 'string' ? payload.targetTab.trim() : ''
  if (matchId) return `/revuelta/${matchId}`
  if (targetTab) return `/?screen=matches&tab=${encodeURIComponent(targetTab)}`
  return '/?screen=matches'
}

export async function dispatchPendingNotificationPushes(
  admin: SupabaseClient,
  limit = 150
): Promise<{
  scanned: number
  sent: number
  marked: number
  removedInvalid: number
}> {
  configureWebPush()

  const { data: rows, error } = await admin
    .from('notifications')
    .select('id, user_id, title, body, payload')
    .is('push_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  const notifications = (rows ?? []) as NotificationRow[]
  if (notifications.length === 0) {
    return { scanned: 0, sent: 0, marked: 0, removedInvalid: 0 }
  }

  const userIds = [...new Set(notifications.map((n) => n.user_id))]
  const { data: subRows, error: subError } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh_key, auth_key')
    .in('user_id', userIds)
  if (subError) throw new Error(subError.message)
  const subs = (subRows ?? []) as PushSubRow[]
  const subsByUser = new Map<string, PushSubRow[]>()
  for (const sub of subs) {
    const list = subsByUser.get(sub.user_id) ?? []
    list.push(sub)
    subsByUser.set(sub.user_id, list)
  }

  let sent = 0
  let removedInvalid = 0
  const toMarkSent = new Set<string>()
  const origin = siteOrigin()

  for (const n of notifications) {
    const mySubs = subsByUser.get(n.user_id) ?? []
    if (mySubs.length === 0) {
      toMarkSent.add(n.id)
      continue
    }
    const path = resolveOpenPath(n.payload)
    const url =
      path.startsWith('http://') || path.startsWith('https://')
        ? path
        : `${origin}${path.startsWith('/') ? path : `/${path}`}`
    const payload = JSON.stringify({
      title: n.title,
      body: n.body,
      data: { url },
    })
    let deliveredToAtLeastOne = false
    for (const sub of mySubs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh_key,
              auth: sub.auth_key,
            },
          },
          payload,
          { TTL: 3600 }
        )
        deliveredToAtLeastOne = true
        sent += 1
      } catch (e: unknown) {
        const statusCode =
          e && typeof e === 'object' && 'statusCode' in e
            ? Number((e as { statusCode: number }).statusCode)
            : 0
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
          removedInvalid += 1
        }
      }
    }
    if (deliveredToAtLeastOne || mySubs.length > 0) {
      toMarkSent.add(n.id)
    }
  }

  let marked = 0
  if (toMarkSent.size > 0) {
    const ids = [...toMarkSent]
    const { error: markError } = await admin
      .from('notifications')
      .update({ push_sent_at: new Date().toISOString() })
      .in('id', ids)
      .is('push_sent_at', null)
    if (markError) throw new Error(markError.message)
    marked = ids.length
  }

  return {
    scanned: notifications.length,
    sent,
    marked,
    removedInvalid,
  }
}
