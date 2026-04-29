'use client'

import type { ReactNode } from 'react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys, stableIdsKey } from '@/lib/query-keys'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'
import { useAppAuth, useAppMatch, useAppUI } from '@/lib/app-context'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { BottomNav } from '@/components/bottom-nav'
import { Badge } from '@/components/ui/badge'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { confirmSoloVenueReservationFromMatchesHub } from '@/lib/supabase/venue-reservation-mutations'
import {
  fetchPlayerVenueReservationsSoloForHub,
  type PlayerVenueReservationListItem,
} from '@/lib/supabase/venue-queries'
import type { LastMessagePreview } from '@/lib/supabase/message-queries'
import { fetchInvitedOpportunityIds } from '@/lib/supabase/message-queries'
import type { SoloVenueReviewSummary } from '@/lib/supabase/venue-review-queries'
import { SoloReserveVenueRatingBlock } from '@/components/solo-reserve-venue-rating'
import {
  isMatchChatMessagingOpen,
  type RatingSummary,
} from '@/lib/supabase/rating-queries'
import { fetchMatchesHubSecondaryBundle } from '@/lib/services/matches-hub.service'
import type {
  MatchOpportunity,
  MatchType,
  MatchesHubTab,
  RivalResult,
} from '@/lib/types'
import {
  formatClp,
  reservationTotalFromHourly,
  shortCourtPricingLine,
} from '@/lib/court-pricing'
import {
  buildVenueCourtConfirmationMessage,
  whatsappUrlForVenueContact,
} from '@/lib/venue-whatsapp-contact'
import {
  Calendar,
  MapPin,
  MessageCircle,
  CheckCircle,
  Clock,
  Target,
  Users,
  Shuffle,
  Trophy,
  History,
  Building2,
  Loader2,
  ShieldAlert,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { MATCH_CARD_SHELL, COMPACT_CARD_ROW } from '@/lib/card-shell'
import { cn } from '@/lib/utils'
import { useInAppNotifications } from '@/lib/hooks/use-in-app-notifications'

const MATCH_TYPE_META: Record<
  MatchType,
  {
    icon: ReactNode
    label: string
    color: string
    headerBg: string
  }
> = {
  rival: {
    icon: <Target className="w-4 h-4" />,
    label: 'Rival vs rival',
    color: 'bg-red-500/20 text-red-400',
    headerBg: 'bg-red-500/10 border-red-500/30',
  },
  players: {
    icon: <Users className="w-4 h-4" />,
    label: 'Yo + cinco',
    color: 'bg-primary/20 text-primary',
    headerBg: 'bg-primary/10 border-primary/30',
  },
  open: {
    icon: <Shuffle className="w-4 h-4" />,
    label: 'Revuelta abierta',
    color: 'bg-accent/20 text-accent',
    headerBg: 'bg-accent/10 border-accent/30',
  },
  team_pick_public: {
    icon: <Users className="w-4 h-4" />,
    label: 'Selección de equipos públicos',
    color: 'bg-emerald-500/20 text-emerald-300',
    headerBg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  team_pick_private: {
    icon: <Users className="w-4 h-4" />,
    label: 'Selección de equipos privado',
    color: 'bg-slate-500/25 text-slate-200',
    headerBg: 'bg-slate-500/10 border-slate-500/30',
  },
}

function isUserInvolved(
  m: MatchOpportunity,
  userId: string,
  participatingIds: string[]
) {
  return m.creatorId === userId || participatingIds.includes(m.id)
}

function canUserAccessChat(
  m: MatchOpportunity,
  userId: string,
  participatingIds: string[]
) {
  return m.creatorId === userId || participatingIds.includes(m.id)
}

/**
 * Próximos: no cancelada y la franja aún no terminó. Finalizados: cancelada o ya pasó endsAt.
 */
function splitSoloReservesForHub(all: PlayerVenueReservationListItem[]) {
  const now = Date.now()
  const upcoming: PlayerVenueReservationListItem[] = []
  const past: PlayerVenueReservationListItem[] = []
  for (const r of all) {
    if (r.status === 'cancelled' || r.endsAt.getTime() < now) {
      past.push(r)
      continue
    }
    upcoming.push(r)
  }
  upcoming.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  past.sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())
  return { venueReserveUpcoming: upcoming, venueReservePast: past }
}

function soloReserveStatusBadge(r: PlayerVenueReservationListItem): string {
  if (r.status === 'cancelled') return 'Cancelada'
  if (r.status === 'confirmed') return 'Cancha confirmada'
  if (r.paymentStatus === 'unpaid' || !r.paymentStatus) return 'Pendiente de pago'
  return 'Pendiente'
}

const SoloReserveHubCard = memo(function SoloReserveHubCard({
  r,
  variant,
  playerFirstName,
  playerDisplayName,
  currentUserId,
  confirmingId,
  onConfirm,
  venueReview,
  onVenueReviewSaved,
}: {
  r: PlayerVenueReservationListItem
  variant: 'upcoming' | 'finished'
  playerFirstName: string
  playerDisplayName: string
  currentUserId: string
  confirmingId: string | null
  onConfirm: (id: string) => void
  venueReview: SoloVenueReviewSummary | undefined
  onVenueReviewSaved: () => void
}) {
  const total = reservationTotalFromHourly(
    r.startsAt,
    r.endsAt,
    r.pricePerHour
  )
  const statusLabel = soloReserveStatusBadge(r)
  const confirming = confirmingId === r.id

  return (
    <div className={MATCH_CARD_SHELL}>
      <div className="border-b border-accent/25 bg-accent/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="rounded-lg bg-accent/20 p-1.5 text-accent">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-medium text-foreground">
              Solo reserva cancha
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            {statusLabel}
          </Badge>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground">
              {r.venueName}
            </h3>
            <p className="text-sm text-muted-foreground">
              {r.courtName}
              {r.venueCity ? ` · ${r.venueCity}` : ''}
            </p>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 border-primary/50 text-primary"
          >
            Reservas
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4 text-primary" />
            {formatMatchInTimezone(r.startsAt, 'EEEE d MMM')}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-primary" />
            {formatMatchInTimezone(r.startsAt, 'HH:mm')} –{' '}
            {formatMatchInTimezone(r.endsAt, 'HH:mm')}
          </span>
        </div>

        {total != null ? (
          <div
            className="rounded-lg border border-amber-900/15 bg-amber-400/20 px-3 py-2.5 text-sm font-semibold text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-50"
            role="status"
          >
            <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-amber-900/70 dark:text-amber-200/95">
              Total estimado cancha
            </span>
            {formatClp(total)}
            {r.currency && r.currency.toUpperCase() !== 'CLP'
              ? ` (${r.currency})`
              : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Precio por hora no indicado para esta cancha; consulta al centro.
          </p>
        )}

        {variant === 'upcoming' ? (
          <div className="pt-1">
            <UpcomingVenueWhatsappCta
              phone={r.venuePhone}
              venueName={r.venueName}
              dateLine={formatMatchInTimezone(r.startsAt, 'EEEE d MMM')}
              timeLine={`${formatMatchInTimezone(r.startsAt, 'HH:mm')} – ${formatMatchInTimezone(r.endsAt, 'HH:mm')}`}
              detailLine={`Cancha: ${r.courtName}`}
              playerFirstName={playerFirstName}
            />
          </div>
        ) : null}

        {r.status === 'pending' ? (
          <div className={variant === 'upcoming' ? 'space-y-2' : 'pt-1'}>
            <button
              type="button"
              disabled={confirming}
              onClick={() => onConfirm(r.id)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
            >
              {confirming ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Marcar cancha confirmada
            </button>
          </div>
        ) : null}

        {variant === 'finished' && currentUserId ? (
          <div className="pt-1 border-t border-border/60 mt-1">
            <SoloReserveVenueRatingBlock
              reservation={r}
              existing={venueReview}
              reviewerDisplayName={playerDisplayName}
              currentUserId={currentUserId}
              onSaved={onVenueReviewSaved}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
})

/** CTA uniforme: confirmar cancha con el centro por WhatsApp (pestaña Próximos). */
const UpcomingVenueWhatsappCta = memo(function UpcomingVenueWhatsappCta({
  phone,
  venueName,
  dateLine,
  timeLine,
  detailLine,
  playerFirstName,
}: {
  phone: string | null | undefined
  venueName: string
  dateLine: string
  timeLine: string
  detailLine?: string
  playerFirstName: string
}) {
  const message = buildVenueCourtConfirmationMessage({
    playerFirstName,
    venueName,
    dateLine,
    timeLine,
    detailLine,
  })
  const url = whatsappUrlForVenueContact(phone, message)
  if (!url) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2.5 text-center text-xs leading-snug text-muted-foreground">
        Este centro no tiene WhatsApp cargado en la app. Usa «Ver ficha del
        centro» o el teléfono que publique el club.
      </p>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-600/45 bg-emerald-600/[0.07] px-3 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-600/[0.12] active:scale-[0.99] dark:border-emerald-400/35 dark:bg-emerald-500/12 dark:text-emerald-50 dark:hover:bg-emerald-500/22"
    >
      <MessageCircle
        className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-200"
        aria-hidden
      />
      Contactar centro por WhatsApp
    </a>
  )
})

function formatCompletedOutcome(m: MatchOpportunity): string {
  if (m.status === 'cancelled') return 'Cancelado'
  if (m.type === 'rival' && m.rivalResult) {
    const map: Record<RivalResult, string> = {
      creator_team: 'Ganó el equipo del organizador',
      rival_team: 'Ganó el equipo rival',
      draw: 'Empate',
    }
    return map[m.rivalResult]
  }
  if (m.casualCompleted) return 'Partido jugado'
  return 'Finalizado'
}

export function MatchesScreen() {
  const {
    currentScreen,
    setCurrentScreen,
    setSelectedChatOpportunityId,
    setSelectedMatchOpportunityId,
    initialMatchesTab,
    setInitialMatchesTab,
  } = useAppUI()
  const { currentUser, avatarDisplayUrl } = useAppAuth()
  const { matchOpportunities, participatingOpportunityIds } = useAppMatch()
  const { items: notificationItems, markAsRead } = useInAppNotifications()

  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<MatchesHubTab>('upcoming')

  const soloHubEnabled = Boolean(
    currentScreen === 'matches' &&
      currentUser?.id &&
      (currentUser.accountType === 'player' ||
        currentUser.accountType === 'admin')
  )

  const soloReservesQuery = useQuery({
    queryKey: queryKeys.matchesHub.soloVenueReservations(currentUser?.id),
    enabled: soloHubEnabled && sessionQueryEnabled(currentUser?.id),
    queryFn: async () => {
      if (!currentUser?.id) return []
      const supabase = getBrowserSupabase()
      if (!supabase) return []
      return fetchPlayerVenueReservationsSoloForHub(supabase, currentUser.id)
    },
  })
  const venueReserveAll = soloReservesQuery.data ?? []

  const confirmSoloMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!currentUser) throw new Error('Sesión no disponible')
      const supabase = getBrowserSupabase()
      if (!supabase) throw new Error('Cliente no disponible')
      const { error } = await confirmSoloVenueReservationFromMatchesHub(
        supabase,
        id,
        currentUser.id
      )
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Reserva marcada como confirmada.')
      if (currentUser?.id) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.matchesHub.soloVenueReservations(currentUser.id),
        })
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'No se pudo confirmar')
    },
  })

  const soloConfirmingId =
    confirmSoloMutation.isPending &&
    typeof confirmSoloMutation.variables === 'string'
      ? confirmSoloMutation.variables
      : null

  const confirmSoloVenueReservation = useCallback(
    async (id: string) => {
      if (
        !window.confirm(
          '¿Confirmas que la cancha quedó reservada o pagada según acordaste con el centro?'
        )
      ) {
        return
      }
      try {
        await confirmSoloMutation.mutateAsync(id)
      } catch {
        // toast en onError
      }
    },
    [confirmSoloMutation]
  )

  useEffect(() => {
    if (currentScreen !== 'matches' || !initialMatchesTab) return
    setActiveTab(initialMatchesTab)
    setInitialMatchesTab(null)
  }, [currentScreen, initialMatchesTab, setInitialMatchesTab])

  const myInvolved = useMemo(() => {
    if (!currentUser) return []
    return matchOpportunities.filter((m) =>
      isUserInvolved(m, currentUser.id, participatingOpportunityIds)
    )
  }, [matchOpportunities, currentUser, participatingOpportunityIds])

  const playerFirstName = useMemo(
    () => currentUser?.name?.trim().split(/\s+/)[0] ?? '',
    [currentUser?.name]
  )

  const midnight = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const pendingToResolve = useMemo(() => {
    if (!currentUser) return []
    return myInvolved
      .filter((m) => m.creatorId === currentUser.id)
      .filter((m) => m.status === 'pending' || m.status === 'confirmed')
      .filter((m) => m.dateTime.getTime() < midnight.getTime())
      .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime())
  }, [myInvolved, currentUser, midnight])

  const upcomingList = useMemo(
    () =>
      myInvolved
        .filter((m) => m.status === 'pending' || m.status === 'confirmed')
        .filter((m) => m.dateTime.getTime() >= midnight.getTime())
        .sort(
          (a, b) =>
            new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
        ),
    [myInvolved, midnight]
  )

  const { venueReserveUpcoming, venueReservePast } = useMemo(
    () => splitSoloReservesForHub(venueReserveAll),
    [venueReserveAll]
  )

  const venuePastReservationIdsKey = useMemo(
    () =>
      venueReservePast
        .map((r) => r.id)
        .sort()
        .join(','),
    [venueReservePast]
  )

  const upcomingMerged = useMemo(() => {
    const items: Array<
      | { kind: 'match'; match: MatchOpportunity }
      | { kind: 'reserve'; reserve: PlayerVenueReservationListItem }
    > = []
    for (const m of upcomingList) items.push({ kind: 'match', match: m })
    for (const r of venueReserveUpcoming)
      items.push({ kind: 'reserve', reserve: r })
    items.sort((a, b) => {
      const ta =
        a.kind === 'match'
          ? a.match.dateTime.getTime()
          : a.reserve.startsAt.getTime()
      const tb =
        b.kind === 'match'
          ? b.match.dateTime.getTime()
          : b.reserve.startsAt.getTime()
      return ta - tb
    })
    return items
  }, [upcomingList, venueReserveUpcoming])

  const finishedList = useMemo(
    () =>
      myInvolved
        .filter((m) => m.status === 'completed' || m.status === 'cancelled')
        .sort((a, b) => {
          const ad = a.finalizedAt?.getTime() ?? new Date(a.dateTime).getTime()
          const bd = b.finalizedAt?.getTime() ?? new Date(b.dateTime).getTime()
          return bd - ad
        }),
    [myInvolved]
  )

  const finishedIdsKey = useMemo(
    () => stableIdsKey(finishedList.map((f) => f.id)),
    [finishedList]
  )

  const finishedMerged = useMemo(() => {
    const items: Array<
      | { kind: 'match'; match: MatchOpportunity }
      | { kind: 'reserve'; reserve: PlayerVenueReservationListItem }
    > = []
    for (const m of finishedList) items.push({ kind: 'match', match: m })
    for (const r of venueReservePast)
      items.push({ kind: 'reserve', reserve: r })
    items.sort((a, b) => {
      const ta =
        a.kind === 'match'
          ? a.match.finalizedAt?.getTime() ??
            new Date(a.match.dateTime).getTime()
          : a.reserve.endsAt.getTime()
      const tb =
        b.kind === 'match'
          ? b.match.finalizedAt?.getTime() ??
            new Date(b.match.dateTime).getTime()
          : b.reserve.endsAt.getTime()
      return tb - ta
    })
    return items
  }, [finishedList, venueReservePast])

  const chatOpportunities = useMemo(() => {
    if (!currentUser) return []
    return matchOpportunities.filter((m) =>
      canUserAccessChat(m, currentUser.id, participatingOpportunityIds)
    )
  }, [matchOpportunities, currentUser, participatingOpportunityIds])

  /** Chats donde aún se puede escribir (partidos no finalizados ni cancelados). */
  const activeChatOpportunities = useMemo(
    () => chatOpportunities.filter((m) => isMatchChatMessagingOpen(m)),
    [chatOpportunities]
  )

  const activeChatIdsKey = useMemo(
    () => stableIdsKey(activeChatOpportunities.map((c) => c.id)),
    [activeChatOpportunities]
  )

  const hubSecondarySignature = useMemo(
    () =>
      [finishedIdsKey, activeChatIdsKey, venuePastReservationIdsKey].join('|'),
    [finishedIdsKey, activeChatIdsKey, venuePastReservationIdsKey]
  )

  const hubSecondaryEnabled = Boolean(
    soloHubEnabled &&
      sessionQueryEnabled(currentUser?.id) &&
      (finishedIdsKey || activeChatIdsKey || venuePastReservationIdsKey)
  )

  const hubSecondaryQuery = useQuery({
    queryKey: queryKeys.matchesHub.secondaryBundle(hubSecondarySignature),
    enabled: hubSecondaryEnabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = getBrowserSupabase()
      if (!supabase) {
        return {
          ratingByOpp: new Map<string, RatingSummary>(),
          lastByOpp: new Map<string, LastMessagePreview>(),
          venueReviewByReservationId: new Map<string, SoloVenueReviewSummary>(),
        }
      }
      return fetchMatchesHubSecondaryBundle(supabase, {
        finishedOpportunityIds: finishedList.map((f) => f.id),
        activeChatOpportunityIds: activeChatOpportunities.map((c) => c.id),
        pastSoloReservationIds: venueReservePast.map((r) => r.id),
      })
    },
  })

  const ratingByOpp =
    hubSecondaryQuery.data?.ratingByOpp ?? new Map<string, RatingSummary>()
  const lastByOpp =
    hubSecondaryQuery.data?.lastByOpp ?? new Map<string, LastMessagePreview>()
  const venueReviewByReservationId =
    hubSecondaryQuery.data?.venueReviewByReservationId ??
    new Map<string, SoloVenueReviewSummary>()

  const invalidatePastVenueReviews = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.matchesHub.secondaryBundle(hubSecondarySignature),
    })
  }, [queryClient, hubSecondarySignature])

  const openChat = useCallback((opportunityId: string) => {
    if (!currentUser) return
    const m = matchOpportunities.find((x) => x.id === opportunityId)
    if (!m) return
    const can =
      m.creatorId === currentUser.id ||
      participatingOpportunityIds.includes(opportunityId)
    if (!can) return
    setSelectedChatOpportunityId(opportunityId)
    setCurrentScreen('chat')
  }, [
    currentUser,
    matchOpportunities,
    participatingOpportunityIds,
    setSelectedChatOpportunityId,
    setCurrentScreen,
  ])

  const openDetails = useCallback((opportunityId: string) => {
    setSelectedMatchOpportunityId(opportunityId)
    setCurrentScreen('matchDetails')
  }, [setSelectedMatchOpportunityId, setCurrentScreen])

  const invitedIdsQuery = useQuery({
    queryKey: queryKeys.matchesHub.invitedOpportunityIds(currentUser?.id),
    enabled: Boolean(soloHubEnabled && sessionQueryEnabled(currentUser?.id)),
    queryFn: async () => {
      if (!currentUser?.id) return [] as string[]
      const supabase = getBrowserSupabase()
      if (!supabase) return [] as string[]
      return fetchInvitedOpportunityIds(supabase, currentUser.id)
    },
  })

  const invitationMatches = useMemo(
    () =>
      matchOpportunities
        .filter((m) => (invitedIdsQuery.data ?? []).includes(m.id))
        .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()),
    [invitedIdsQuery.data, matchOpportunities]
  )

  const openInvitationFromNotification = useCallback(
    async (notificationId: string, matchId?: string) => {
      await markAsRead(notificationId)
      if (!matchId) return
      openDetails(matchId)
    },
    [markAsRead, openDetails]
  )

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="p-4 pb-2">
          <AppScreenBrandHeading
            title="Partidos"
            subtitle="Próximos, invitaciones, chats del grupo e historial"
          />
        </div>

        <div className="flex border-b border-border">
          <TabButton
            active={activeTab === 'upcoming'}
            onClick={() => setActiveTab('upcoming')}
            icon={<Clock className="w-4 h-4" />}
            label="Próximos"
            count={upcomingMerged.length}
          />
          <TabButton
            active={activeTab === 'invitations'}
            onClick={() => setActiveTab('invitations')}
            icon={<ShieldAlert className="w-4 h-4" />}
            label="Invitaciones"
            count={invitationMatches.length}
          />
          <TabButton
            active={activeTab === 'chats'}
            onClick={() => setActiveTab('chats')}
            icon={<MessageCircle className="w-4 h-4" />}
            label="Chats"
            count={activeChatOpportunities.length}
          />
          <TabButton
            active={activeTab === 'finished'}
            onClick={() => setActiveTab('finished')}
            icon={<History className="w-4 h-4" />}
            label="Finalizados"
            count={finishedMerged.length}
          />
        </div>
      </header>

      <div className="p-4">
        {activeTab === 'upcoming' && (
          <div className="space-y-4">
            {pendingToResolve.length > 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  Pendientes por cerrar ({pendingToResolve.length})
                </p>
                <p className="text-xs text-muted-foreground">
                  Estos partidos eran de días anteriores. Confirma si se jugaron o
                  suspéndelos con un motivo.
                </p>
                <div className="space-y-2 pt-1">
                  {pendingToResolve.slice(0, 3).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => openDetails(m.id)}
                      className={cn(
                        'w-full text-left px-3 py-2',
                        COMPACT_CARD_ROW
                      )}
                    >
                      <p className="text-sm font-medium text-foreground truncate">
                        {m.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatMatchInTimezone(
                          m.dateTime,
                          'EEEE d MMM · HH:mm'
                        )}
                        {' · '}
                        {m.venue}
                      </p>
                    </button>
                  ))}
                  {pendingToResolve.length > 3 ? (
                    <p className="text-xs text-muted-foreground">
                      Y {pendingToResolve.length - 3} más…
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {upcomingMerged.length > 0 ? (
              upcomingMerged.map((item) => {
                if (item.kind === 'reserve') {
                  const r = item.reserve
                  return (
                    <SoloReserveHubCard
                      key={`reserve-${r.id}`}
                      r={r}
                      variant="upcoming"
                      playerFirstName={playerFirstName}
                      playerDisplayName={currentUser?.name?.trim() ?? ''}
                      currentUserId={currentUser?.id ?? ''}
                      confirmingId={soloConfirmingId}
                      onConfirm={confirmSoloVenueReservation}
                      venueReview={venueReviewByReservationId.get(r.id)}
                      onVenueReviewSaved={invalidatePastVenueReviews}
                    />
                  )
                }

                const match = item.match
                const courtPriceLine = shortCourtPricingLine(match)
                const isCreator =
                  !!currentUser && currentUser.id === match.creatorId
                const canChat =
                  !!currentUser &&
                  canUserAccessChat(
                    match,
                    currentUser.id,
                    participatingOpportunityIds
                  )
                return (
                  <div key={match.id} className={MATCH_CARD_SHELL}>
                    <div
                      className={`px-4 py-3 border-b border-border ${MATCH_TYPE_META[match.type].headerBg}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg ${MATCH_TYPE_META[match.type].color}`}
                          >
                            {MATCH_TYPE_META[match.type].icon}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate">
                            {MATCH_TYPE_META[match.type].label}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {match.level}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={avatarDisplayUrl(
                              match.creatorPhoto,
                              match.creatorId
                            )}
                            alt={match.creatorName}
                            className="w-12 h-12 rounded-full object-cover border-2 border-border shrink-0"
                          />
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                              {match.title}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {match.creatorName}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            isCreator
                              ? 'border-primary/50 text-primary'
                              : 'border-border text-muted-foreground'
                          }
                        >
                          {isCreator ? 'Organizas' : 'Participas'}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-primary" />
                          {formatMatchInTimezone(match.dateTime, 'EEEE d MMM')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4 text-primary" />
                          {formatMatchInTimezone(match.dateTime, 'HH:mm')}
                        </span>
                        <span className="flex items-center gap-1 min-w-0">
                          <MapPin className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate">{match.venue}</span>
                        </span>
                      </div>

                      {courtPriceLine ? (
                        <div
                          className="rounded-lg border border-amber-900/15 bg-amber-400/20 px-3 py-2.5 text-sm font-semibold leading-snug text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-50"
                          role="status"
                        >
                          <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-amber-900/70 dark:text-amber-200/95">
                            Estimación cancha
                          </span>
                          {courtPriceLine}
                        </div>
                      ) : null}

                      <div className="space-y-2 pt-1">
                        {isCreator ? (
                          <UpcomingVenueWhatsappCta
                            phone={match.venueContactPhone}
                            venueName={match.venue}
                            dateLine={formatMatchInTimezone(
                              match.dateTime,
                              'EEEE d MMM'
                            )}
                            timeLine={formatMatchInTimezone(
                              match.dateTime,
                              'HH:mm'
                            )}
                            detailLine={match.title}
                            playerFirstName={playerFirstName}
                          />
                        ) : null}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                          <button
                            type="button"
                            onClick={() => openDetails(match.id)}
                            className="min-h-11 shrink-0 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:px-3"
                          >
                            Ver detalle
                          </button>
                          {canChat ? (
                            <button
                              type="button"
                              onClick={() => openChat(match.id)}
                              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                              <MessageCircle className="h-4 w-4 shrink-0" />
                              Abrir chat del grupo
                            </button>
                          ) : (
                            <p className="flex min-h-11 flex-1 items-center justify-center px-1 text-center text-xs text-muted-foreground">
                              Únete al partido desde Inicio o Explorar para usar
                              el chat
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <EmptyState
                icon={<Calendar className="w-8 h-8" />}
                title="Sin partidos próximos"
                description="Únete a un partido o crea uno desde el botón Crear, o reserva solo cancha. Aquí verás tus partidos activos y reservas de cancha."
              />
            )}
          </div>
        )}

        {activeTab === 'chats' && (
          <div className="space-y-2">
            {activeChatOpportunities.length > 0 ? (
              activeChatOpportunities.map((chat) => {
                const last = lastByOpp.get(chat.id)
                const isDone =
                  chat.status === 'completed' || chat.status === 'cancelled'
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => openChat(chat.id)}
                    className={cn(
                      MATCH_CARD_SHELL,
                      'w-full cursor-pointer text-left'
                    )}
                  >
                    <div
                      className={`px-4 py-3 border-b border-border ${MATCH_TYPE_META[chat.type].headerBg}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg ${MATCH_TYPE_META[chat.type].color}`}
                          >
                            {MATCH_TYPE_META[chat.type].icon}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate">
                            {MATCH_TYPE_META[chat.type].label}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {chat.level}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4 flex items-center gap-4">
                      <div className="relative shrink-0">
                        <img
                          src={avatarDisplayUrl(
                            chat.creatorPhoto,
                            chat.creatorId
                          )}
                          alt={chat.title}
                          className="w-14 h-14 rounded-full object-cover border-2 border-border"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-foreground truncate">
                            {chat.title}
                          </h3>
                          {last && (
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {format(last.createdAt, 'HH:mm')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {last?.content ?? 'Sin mensajes aún — escribe el primero'}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatMatchInTimezone(chat.dateTime, 'd MMM HH:mm')}
                          </p>
                          {isDone && (
                            <Badge variant="secondary" className="text-[10px]">
                              {chat.status === 'completed'
                                ? 'Finalizado'
                                : 'Cancelado'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            ) : (
              <EmptyState
                icon={<MessageCircle className="w-8 h-8" />}
                title={
                  chatOpportunities.length > 0
                    ? 'Sin chats activos'
                    : 'Sin conversaciones'
                }
                description={
                  chatOpportunities.length > 0
                    ? 'Los partidos finalizados pasan a Finalizados: ahí puedes abrir el chat en solo lectura y calificar desde el detalle cuando quieras.'
                    : 'Cuando entres a un partido (como organizador o jugador), aparecerá aquí el chat para coordinar con el grupo.'
                }
              />
            )}
          </div>
        )}

        {activeTab === 'invitations' && (
          <div className="space-y-2">
            {invitationMatches.length === 0 ? (
              <EmptyState
                icon={<ShieldAlert className="w-8 h-8" />}
                title="Sin invitaciones por ahora"
                description="Cuando un organizador te invite a un partido aparecerá aquí. También verás el aviso en la campanita."
              />
            ) : (
              invitationMatches.map((match) => {
                const linkedNotification = notificationItems.find(
                  (n) =>
                    n.type === 'match_invitation' && n.payload?.matchId === match.id
                )
                return (
                  <div
                    key={match.id}
                    className={cn(
                      'rounded-xl border p-3',
                      linkedNotification?.isRead
                        ? 'border-border bg-card/40'
                        : 'border-primary/40 bg-primary/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          Invitación a partido
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {match.title} · {formatMatchInTimezone(match.dateTime, 'EEEE d MMM · HH:mm')}
                        </p>
                      </div>
                      {linkedNotification && !linkedNotification.isRead ? (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        {match.venue} · {match.location}
                      </p>
                      <button
                        type="button"
                        className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                        onClick={() => {
                          if (linkedNotification) {
                            void openInvitationFromNotification(
                              linkedNotification.id,
                              match.id
                            )
                            return
                          }
                          openDetails(match.id)
                        }}
                      >
                        Ver invitación
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'finished' && (
          <div className="space-y-4">
            {finishedMerged.length > 0 ? (
              finishedMerged.map((item) => {
                if (item.kind === 'reserve') {
                  const r = item.reserve
                  return (
                    <SoloReserveHubCard
                      key={`reserve-past-${r.id}`}
                      r={r}
                      variant="finished"
                      playerFirstName={playerFirstName}
                      playerDisplayName={currentUser?.name?.trim() ?? ''}
                      currentUserId={currentUser?.id ?? ''}
                      confirmingId={soloConfirmingId}
                      onConfirm={confirmSoloVenueReservation}
                      venueReview={venueReviewByReservationId.get(r.id)}
                      onVenueReviewSaved={invalidatePastVenueReviews}
                    />
                  )
                }
                const match = item.match
                const ratings = ratingByOpp.get(match.id)
                return (
                  <div key={match.id} className={MATCH_CARD_SHELL}>
                    <div
                      className={`px-4 py-3 border-b border-border ${MATCH_TYPE_META[match.type].headerBg}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg ${MATCH_TYPE_META[match.type].color}`}
                          >
                            {MATCH_TYPE_META[match.type].icon}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate">
                            {MATCH_TYPE_META[match.type].label}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {match.level}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-foreground">
                            {match.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {formatMatchInTimezone(match.dateTime, 'd MMM yyyy')}
                            {match.finalizedAt && (
                              <span className="text-muted-foreground">
                                {' '}
                                · Cerrado{' '}
                                {formatMatchInTimezone(
                                  match.finalizedAt,
                                  'd MMM'
                                )}
                              </span>
                            )}
                          </p>
                        </div>
                        <Badge
                          variant={
                            match.status === 'cancelled'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {match.status === 'cancelled'
                            ? 'Cancelado'
                            : 'Finalizado'}
                        </Badge>
                      </div>

                  {match.status === 'completed' && (
                    <div className="space-y-1.5">
                      <p className="text-sm flex items-center gap-2 text-foreground">
                        <Trophy className="w-4 h-4 text-accent shrink-0" />
                        {formatCompletedOutcome(match)}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {ratings?.avgOverall != null
                            ? `⭐ ${ratings.avgOverall}`
                            : '⭐ —'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {ratings?.count ?? 0}{' '}
                          {(ratings?.count ?? 0) === 1
                            ? 'reseña'
                            : 'reseñas'}
                        </span>
                      </div>
                    </div>
                  )}
                  {match.status === 'cancelled' && match.suspendedReason && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                      <p className="text-xs uppercase tracking-wide text-red-300 mb-1">
                        Motivo de suspensión
                      </p>
                      <p className="text-sm text-red-100">{match.suspendedReason}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => openDetails(match.id)}
                    className="w-full py-2 rounded-lg border border-border text-foreground font-medium hover:bg-secondary transition-colors"
                  >
                    Ver detalle
                  </button>

                  {currentUser &&
                    canUserAccessChat(
                      match,
                      currentUser.id,
                      participatingOpportunityIds
                    ) && (
                      <button
                        type="button"
                        onClick={() => openChat(match.id)}
                        className="w-full py-2 rounded-lg border border-border text-foreground font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                      >
                        <MessageCircle className="w-4 h-4" />
                        {isMatchChatMessagingOpen(match)
                          ? 'Ver chat / calificaciones'
                          : 'Ver historial del chat'}
                      </button>
                    )}
                  </div>
                  </div>
                )
              })
            ) : (
              <EmptyState
                icon={<CheckCircle className="w-8 h-8" />}
                title="Sin historial reciente"
                description="Partidos cerrados o cancelados y reservas solo cancha de días anteriores aparecerán aquí."
              />
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

const TabButton = memo(function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-3 px-1 text-center font-medium transition-colors relative min-w-0 ${
        active ? 'text-primary' : 'text-muted-foreground'
      }`}
    >
      <span className="flex flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-1.5">
        {icon}
        <span className="text-xs sm:text-sm truncate max-w-full">{label}</span>
        {count > 0 && (
          <Badge className="bg-primary/20 text-primary border-0 text-[10px] px-1.5 py-0 h-5">
            {count}
          </Badge>
        )}
      </span>
      {active && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
      )}
    </button>
  )
})

const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4 text-muted-foreground">
        {icon}
      </div>
      <h3 className="font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 px-4">{description}</p>
    </div>
  )
})
