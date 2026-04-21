'use client'

import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type {
  PushSubscribeResult,
  PushSubscribeState,
} from '@/lib/hooks/use-push-notifications'

const STORAGE_SNOOZE_UNTIL = 'sportmatch_push_nudge_snooze_until'
const STORAGE_VISIT_COUNT = 'sportmatch_push_profile_visit_count'
const SNOOZE_MS = 5 * 24 * 60 * 60 * 1000
/** Tras estas visitas al perfil, el aviso solo aparece a veces (evita fatiga). */
const ALWAYS_SHOW_VISITS = 2
const OCCASIONAL_CHANCE = 0.35

type Props = {
  supported: boolean
  isBanned: boolean
  state: PushSubscribeState
  subscribeAndSync: () => Promise<PushSubscribeResult>
  onActivated?: () => void
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

export function ProfilePushNudge({
  supported,
  isBanned,
  state,
  subscribeAndSync,
  onActivated,
}: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!supported || isBanned) {
      setVisible(false)
      return
    }

    let cancelled = false

    void (async () => {
      if (!(await needsPushActivation())) {
        if (!cancelled) setVisible(false)
        return
      }

      const snoozeUntil = parseInt(
        localStorage.getItem(STORAGE_SNOOZE_UNTIL) ?? '0',
        10
      )
      if (snoozeUntil > Date.now()) {
        if (!cancelled) setVisible(false)
        return
      }

      const visits =
        parseInt(localStorage.getItem(STORAGE_VISIT_COUNT) ?? '0', 10) + 1
      localStorage.setItem(STORAGE_VISIT_COUNT, String(visits))
      const chance = visits <= ALWAYS_SHOW_VISITS ? 1 : OCCASIONAL_CHANCE
      if (Math.random() > chance) {
        if (!cancelled) setVisible(false)
        return
      }

      if (!cancelled) setVisible(true)
    })()

    return () => {
      cancelled = true
    }
  }, [supported, isBanned])

  useEffect(() => {
    if (state === 'subscribed') {
      setVisible(false)
      localStorage.removeItem(STORAGE_SNOOZE_UNTIL)
    }
  }, [state])

  if (!visible) return null

  const snooze = () => {
    localStorage.setItem(
      STORAGE_SNOOZE_UNTIL,
      String(Date.now() + SNOOZE_MS)
    )
    setVisible(false)
  }

  const activate = async () => {
    const r = await subscribeAndSync()
    if (r.ok) {
      onActivated?.()
      return
    }
    if (r.reason === 'denied') {
      toast.message('Permiso denegado', {
        description:
          'Puedes activarlas desde el icono del candado en la barra del navegador.',
      })
      return
    }
    if (r.message) toast.error(r.message)
  }

  return (
    <div className="mb-4 rounded-xl border border-primary/35 bg-gradient-to-br from-primary/12 to-primary/5 px-4 py-3 shadow-sm">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Bell className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            ¿Activar avisos en el navegador?
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Te avisaremos de partidos y mensajes importantes. Puedes desactivarlo
            cuando quieras en la configuración del navegador.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="rounded-lg"
              disabled={state === 'requesting'}
              onClick={() => void activate()}
            >
              {state === 'requesting' ? 'Activando…' : 'Activar'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={snooze}
            >
              Ahora no
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-background/80 hover:text-foreground"
          aria-label="Cerrar aviso"
          onClick={snooze}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
