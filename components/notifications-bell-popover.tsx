'use client'

import { useMemo, useState } from 'react'
import { Bell, CheckCheck, MessageCircle, PartyPopper, ShieldAlert, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useInAppNotifications } from '@/lib/hooks/use-in-app-notifications'
import type { InAppNotification } from '@/lib/notifications/types'
import type { MatchesHubTab } from '@/lib/types'

type Props = {
  onNavigate: (tab: MatchesHubTab, matchId?: string) => void
}

function iconForNotification(type: InAppNotification['type']) {
  if (type === 'chat_message') return MessageCircle
  if (type === 'match_invitation') return ShieldAlert
  if (type === 'match_finished_review_pending') return PartyPopper
  return Clock3
}

function tabForNotification(item: InAppNotification): MatchesHubTab {
  if (item.payload?.targetTab) return item.payload.targetTab
  if (item.type === 'chat_message') return 'chats'
  if (item.type === 'match_invitation') return 'invitations'
  if (item.type === 'match_finished_review_pending') return 'finished'
  return 'upcoming'
}

function relativeDate(iso: string) {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffMs = Date.now() - then
  const diffMin = Math.max(1, Math.floor(diffMs / 60_000))
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH} h`
  const diffD = Math.floor(diffH / 24)
  return `Hace ${diffD} d`
}

export function NotificationsBellPopover({ onNavigate }: Props) {
  const [open, setOpen] = useState(false)
  const { items, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useInAppNotifications()

  const hasUnread = unreadCount > 0
  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(a.isRead) - Number(b.isRead)),
    [items]
  )

  const handleOpenNotification = async (n: InAppNotification) => {
    if (!n.isRead) await markAsRead(n.id)
    setOpen(false)
    onNavigate(tabForNotification(n), n.payload?.matchId)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          type="button"
          aria-label="Abrir notificaciones"
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          {hasUnread ? (
            <span className="absolute top-1 right-1 min-w-2 h-2 rounded-full bg-primary" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="border-b border-border px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Notificaciones</p>
            <div className="flex items-center gap-2">
              {hasUnread ? (
                <span className="text-xs text-primary">{unreadCount} sin leer</span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => void markAllAsRead()}
                disabled={!hasUnread}
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" />
                Marcar todas
              </Button>
            </div>
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {isLoading ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Cargando notificaciones...
            </p>
          ) : sorted.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              No tienes notificaciones por ahora.
            </p>
          ) : (
            <div className="space-y-1">
              {sorted.map((n) => {
                const Icon = iconForNotification(n.type)
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleOpenNotification(n)}
                    className="flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left transition hover:border-border hover:bg-muted/40"
                  >
                    <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {n.title}
                      </p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {relativeDate(n.createdAt)}
                      </p>
                    </div>
                    {!n.isRead ? (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
