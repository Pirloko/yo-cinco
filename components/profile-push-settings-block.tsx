'use client'

import { Bell, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type {
  PushSubscribeResult,
  PushSubscribeState,
} from '@/lib/hooks/use-push-notifications'

type Props = {
  supported: boolean
  state: PushSubscribeState
  errorMessage: string | null
  subscribeAndSync: () => Promise<PushSubscribeResult>
}

export function ProfilePushSettingsBlock({
  supported,
  state,
  errorMessage,
  subscribeAndSync,
}: Props) {
  const requesting = state === 'requesting'

  const statusLine = (() => {
    if (!supported) {
      return 'Tu navegador no permite notificaciones push o no es compatible.'
    }
    if (state === 'subscribed') {
      return 'Las notificaciones están activas en este dispositivo.'
    }
    if (state === 'denied') {
      return 'Están bloqueadas en el navegador. Actívalas desde el icono del candado o en Ajustes del sitio.'
    }
    if (state === 'error' && errorMessage) {
      return errorMessage
    }
    return 'Recibe avisos de partidos y mensajes aunque no tengas la app abierta.'
  })()

  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
      <Bell className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="font-medium text-foreground text-sm">Notificaciones</p>
          <p className="text-xs text-muted-foreground mt-1">{statusLine}</p>
        </div>
        {supported && state !== 'subscribed' && state !== 'denied' ? (
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto rounded-lg"
            disabled={requesting}
            onClick={() =>
              void (async () => {
                const r = await subscribeAndSync()
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
              })()
            }
          >
            {requesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Activando…
              </>
            ) : (
              'Activar notificaciones'
            )}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
