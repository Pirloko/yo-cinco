'use client'

import { useEffect } from 'react'

/**
 * Registra el SW en segundo plano. Errores silenciosos (HTTP local, permisos, etc.).
 * No suscribe a push aquí: eso lo hace usePushNotifications cuando el usuario activa avisos.
 */
export function PushServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }, [])
  return null
}
