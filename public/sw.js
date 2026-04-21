/* eslint-disable no-undef */
/**
 * Service worker mínimo solo para Web Push.
 * Sin fetch/cache: no interceptamos peticiones ni HTML (evita romper auth/Supabase).
 */
self.addEventListener('push', (event) => {
  let title = 'SPORTMATCH'
  let body = ''
  let data = { url: '/' }

  try {
    if (event.data) {
      const parsed = event.data.json()
      if (typeof parsed.title === 'string') title = parsed.title
      if (typeof parsed.body === 'string') body = parsed.body
      if (parsed.data && typeof parsed.data === 'object') data = { ...data, ...parsed.data }
    }
  } catch (_) {
    try {
      const t = event.data?.text()
      if (t) body = t
    } catch (_) {}
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: '/sportmatch-logo.png',
      badge: '/sportmatch-logo.png',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawUrl = event.notification.data && event.notification.data.url
  const url =
    typeof rawUrl === 'string' && rawUrl.length > 0 ? rawUrl : self.location.origin + '/'

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of all) {
        try {
          if (client.url === url && 'focus' in client) {
            return client.focus()
          }
        } catch (_) {}
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })()
  )
})
