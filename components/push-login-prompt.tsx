'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppAuth } from '@/lib/app-context'
import {
  usePushNotifications,
  type PushSubscribeResult,
} from '@/lib/hooks/use-push-notifications'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const STORAGE_PREFIX = 'sportmatch_push_login_prompt_snooze_until'
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

function getSnoozeKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`
}

async function needsPushActivation(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false
  if (Notification.permission === 'denied') return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (Notification.permission === 'granted' && sub) return false
    return true
  } catch {
    return Notification.permission === 'default'
  }
}

function toastFromResult(r: PushSubscribeResult) {
  if (r.ok) {
    toast.success('Notificaciones activadas en este dispositivo.')
    return
  }
  if (r.reason === 'denied') {
    toast.message('Permiso denegado', {
      description:
        'Puedes activarlas desde el icono del candado en la barra del navegador.',
    })
    return
  }
  toast.error(r.message ?? 'No se pudieron activar las notificaciones.')
}

export function PushLoginPrompt() {
  const { authLoading, currentUser } = useAppAuth()
  const push = usePushNotifications()
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const previousUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (authLoading || !currentUser?.id || !push.supported) return
    if (push.state === 'subscribed' || push.state === 'denied') return

    const previousUserId = previousUserIdRef.current
    const userId = currentUser.id
    previousUserIdRef.current = userId

    // Mostrar al iniciar sesión (o primera carga autenticada) respetando snooze.
    if (previousUserId === userId && open) return

    let cancelled = false
    void (async () => {
      if (!(await needsPushActivation())) return
      const snoozeUntil = parseInt(localStorage.getItem(getSnoozeKey(userId)) ?? '0', 10)
      if (snoozeUntil > Date.now()) return
      if (!cancelled) setOpen(true)
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, currentUser?.id, open, push.state, push.supported])

  useEffect(() => {
    if (push.state === 'subscribed') setOpen(false)
  }, [push.state])

  const snooze = () => {
    if (currentUser?.id) {
      localStorage.setItem(
        getSnoozeKey(currentUser.id),
        String(Date.now() + SNOOZE_MS)
      )
    }
    setOpen(false)
  }

  const activate = async () => {
    setWorking(true)
    try {
      const result = await push.subscribeAndSync()
      toastFromResult(result)
      if (result.ok) setOpen(false)
    } finally {
      setWorking(false)
    }
  }

  if (!currentUser) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Activa tus notificaciones
          </DialogTitle>
          <DialogDescription>
            Te avisaremos cuando haya novedades importantes de partidos y mensajes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={snooze} disabled={working}>
            Ahora no
          </Button>
          <Button type="button" onClick={() => void activate()} disabled={working}>
            {working ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Activando…
              </>
            ) : (
              'Activar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
