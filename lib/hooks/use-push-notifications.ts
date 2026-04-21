'use client'

import { useCallback, useMemo, useState } from 'react'
import { urlBase64ToUint8Array } from '@/lib/push/url-base64'

export type PushSubscribeState =
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'subscribed'
  | 'denied'
  | 'error'

export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'error'; message?: string }

export function usePushNotifications() {
  const [state, setState] = useState<PushSubscribeState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const supported = useMemo(() => {
    if (typeof window === 'undefined') return false
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    )
  }, [])

  const ensureServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (!supported) return null
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      })
      await reg.update()
      return await navigator.serviceWorker.ready
    } catch {
      return null
    }
  }, [supported])

  const subscribeAndSync = useCallback(async (): Promise<PushSubscribeResult> => {
    setErrorMessage(null)
    if (!supported) {
      setState('unsupported')
      return { ok: false, reason: 'unsupported' }
    }

    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
    if (!vapid) {
      const msg = 'Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY'
      setState('error')
      setErrorMessage(msg)
      return { ok: false, reason: 'error', message: msg }
    }

    setState('requesting')
    try {
      const reg = await ensureServiceWorker()
      if (!reg) {
        const msg = 'No se pudo registrar el service worker'
        setState('error')
        setErrorMessage(msg)
        return { ok: false, reason: 'error', message: msg }
      }

      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState('denied')
        return { ok: false, reason: 'denied' }
      }

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            vapid
          ) as BufferSource,
        })
      }

      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        const msg = 'Suscripción incompleta'
        setState('error')
        setErrorMessage(msg)
        return { ok: false, reason: 'error', message: msg }
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        const msg = err?.error ?? `Error ${res.status}`
        setState('error')
        setErrorMessage(msg)
        return { ok: false, reason: 'error', message: msg }
      }

      setState('subscribed')
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setState('error')
      setErrorMessage(msg)
      return { ok: false, reason: 'error', message: msg }
    }
  }, [ensureServiceWorker, supported])

  const unsubscribeLocal = useCallback(async (): Promise<void> => {
    if (!supported) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
    } catch {
      /* silencioso */
    }
    setState('idle')
  }, [supported])

  return {
    supported,
    state,
    errorMessage,
    subscribeAndSync,
    unsubscribeLocal,
  }
}
