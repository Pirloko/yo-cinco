'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  useAppAuth,
  useAppMatch,
  useAppTeam,
  useAppUI,
} from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import {
  fetchParticipantsForOpportunity,
  type OpportunityParticipantRow,
} from '@/lib/supabase/message-queries'
import {
  fetchMyRatingForOpportunity,
  fetchRatingSummaryForOpportunity,
  fetchRecentRatingCommentsForOpportunity,
  type RatingSummary,
  type MatchOpportunityRatingRow,
} from '@/lib/supabase/rating-queries'
import { MatchCompletionPanel } from '@/components/match-completion-panel'
import { JoinRevueltaDialog } from '@/components/join-revuelta-dialog'
import { JoinPlayersSearchDialog } from '@/components/join-players-search-dialog'
import { RevueltaInviteActions } from '@/components/revuelta-invite-actions'
import { RevueltaTeamsPanel } from '@/components/revuelta-teams-panel'
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  MessageCircle,
  Shield,
} from 'lucide-react'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { playersSeekProfileLabel } from '@/lib/players-seek-profile'
import { MatchCourtPricingBlock } from '@/components/match-court-pricing'
import { prefetchPublicPlayerProfile } from '@/lib/public-player-prefetch'
import { getOrganizerTier } from '@/lib/organizer-level'
import { fetchOrganizerCompletedCount } from '@/lib/supabase/queries'
import { userIsConfirmedMemberOfTeam } from '@/lib/team-membership'
import {
  fetchPendingRevueltaExternalRequests,
  fetchMyPendingRevueltaExternalRequest,
  type PendingRevueltaExternalRequest,
} from '@/lib/supabase/revuelta-external-requests'
import {
  fetchVenueReservationForMatchDetail,
  type MatchDetailReservationState,
} from '@/lib/supabase/venue-reservation-queries'
import { confirmVenueReservationBookerSelfMatchDetail } from '@/lib/supabase/venue-reservation-mutations'
import { fetchSportsVenueContactById } from '@/lib/supabase/venue-queries'
import { queryKeys } from '@/lib/query-keys'

export function MatchDetailsScreen() {
  const {
    setCurrentScreen,
    selectedMatchOpportunityId,
    setSelectedMatchOpportunityId,
    setSelectedChatOpportunityId,
    openPublicProfile,
  } = useAppUI()
  const { currentUser, avatarDisplayUrl } = useAppAuth()
  const {
    matchOpportunities,
    participatingOpportunityIds,
    joinMatchOpportunity,
    randomizeRevueltaTeams,
    finalizeMatchOpportunity,
    suspendMatchOpportunity,
    submitMatchRating,
    rivalChallenges,
    submitRivalCaptainVote,
    finalizeRivalOrganizerOverride,
    requestJoinPrivateRevuelta,
    respondToRevueltaExternalRequest,
  } = useAppMatch()
  const { teams } = useAppTeam()

  const queryClient = useQueryClient()

  const opportunity = useMemo(
    () =>
      selectedMatchOpportunityId
        ? matchOpportunities.find((m) => m.id === selectedMatchOpportunityId)
        : undefined,
    [matchOpportunities, selectedMatchOpportunityId]
  )

  const rivalChallengeForOpp = useMemo(
    () =>
      opportunity
        ? rivalChallenges.find((c) => c.opportunityId === opportunity.id) ?? null
        : null,
    [rivalChallenges, opportunity?.id]
  )

  const participantsQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.participants(selectedMatchOpportunityId),
    enabled: Boolean(selectedMatchOpportunityId && currentUser?.id && isSupabaseConfigured()),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!selectedMatchOpportunityId) return []
      const sb = getBrowserSupabase()
      if (!sb) return []
      return await fetchParticipantsForOpportunity(sb, selectedMatchOpportunityId)
    },
  })
  const participants: OpportunityParticipantRow[] = participantsQuery.data ?? []
  const loadingParticipants = participantsQuery.isFetching

  const ratingsOverviewQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.ratingsOverview(selectedMatchOpportunityId),
    enabled: Boolean(selectedMatchOpportunityId && isSupabaseConfigured()),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!selectedMatchOpportunityId) {
        return { summary: null as RatingSummary | null, comments: [] as Array<{ comment: string; createdAt: Date }> }
      }
      const sb = getBrowserSupabase()
      if (!sb) {
        return { summary: null as RatingSummary | null, comments: [] as Array<{ comment: string; createdAt: Date }> }
      }
      const [summary, comments] = await Promise.all([
        fetchRatingSummaryForOpportunity(sb, selectedMatchOpportunityId),
        fetchRecentRatingCommentsForOpportunity(sb, selectedMatchOpportunityId),
      ])
      return { summary, comments }
    },
  })
  const ratingSummary: RatingSummary | null = ratingsOverviewQuery.data?.summary ?? null
  const recentComments = ratingsOverviewQuery.data?.comments ?? []

  const myRatingQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.myRating(
      selectedMatchOpportunityId,
      currentUser?.id
    ),
    enabled: Boolean(selectedMatchOpportunityId && currentUser?.id && isSupabaseConfigured()),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!selectedMatchOpportunityId || !currentUser?.id) return null
      const sb = getBrowserSupabase()
      if (!sb) return null
      return await fetchMyRatingForOpportunity(sb, selectedMatchOpportunityId, currentUser.id)
    },
  })
  const myRating: MatchOpportunityRatingRow | null = myRatingQuery.data ?? null
  const loadingRating = myRatingQuery.isFetching

  const [joinRevueltaOpen, setJoinRevueltaOpen] = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [joinPlayersOpen, setJoinPlayersOpen] = useState(false)
  const organizerId = opportunity?.creatorId ?? null
  const organizerOrganizedCountQuery = useQuery({
    queryKey: queryKeys.profile.organizerCompletedCount(organizerId),
    enabled: Boolean(
      organizerId &&
        isSupabaseConfigured() &&
        currentUser?.id &&
        organizerId !== currentUser.id
    ),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!organizerId) return 0
      const sb = getBrowserSupabase()
      if (!sb) return 0
      return await fetchOrganizerCompletedCount(sb, organizerId)
    },
  })
  const organizerOrganizedCount =
    !opportunity || !currentUser
      ? null
      : organizerId === currentUser.id
        ? (currentUser.statsOrganizedCompleted ?? 0)
        : (organizerOrganizedCountQuery.data ?? 0)

  const sportsVenueId = opportunity?.sportsVenueId ?? null
  const venueFallbackName = opportunity?.venue ?? ''
  const venueContactQuery = useQuery({
    queryKey: queryKeys.sportsVenue.contact(sportsVenueId ?? ''),
    enabled: Boolean(sportsVenueId && isSupabaseConfigured()),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!sportsVenueId) return null
      const sb = getBrowserSupabase()
      if (!sb) return null
      return await fetchSportsVenueContactById(sb, sportsVenueId, venueFallbackName)
    },
  })
  const venueContact = venueContactQuery.data ?? null

  const selfConfirmReservationMutation = useMutation({
    mutationFn: async (args: { reservationId: string; userId: string }) => {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase no configurado')
      }
      const supabase = getBrowserSupabase()
      if (!supabase) {
        throw new Error('Cliente no disponible')
      }
      const { error } = await confirmVenueReservationBookerSelfMatchDetail(
        supabase,
        args.reservationId,
        args.userId
      )
      if (error) throw error
      return true
    },
    onMutate: async (args) => {
      const key = queryKeys.matchOpportunity.venueReservation(args.reservationId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<MatchDetailReservationState | null>(key)
      queryClient.setQueryData<MatchDetailReservationState | null>(key, (prev) => {
        if (!prev) return prev ?? null
        return {
          ...prev,
          status: 'confirmed',
          confirmationSource: 'booker_self',
          confirmedAt: new Date(),
        }
      })
      return { previous, key }
    },
    onError: (err, _args, ctx) => {
      if (ctx?.key) {
        queryClient.setQueryData(ctx.key, ctx.previous ?? null)
      }
      const msg = err instanceof Error ? err.message : 'No se pudo confirmar la reserva'
      toast.error(msg)
    },
    onSuccess: () => {
      toast.success('Reserva confirmada. Quedó registrada como autoconfirmada.')
    },
    onSettled: async (_data, _error, args, ctx) => {
      const key =
        ctx?.key ?? queryKeys.matchOpportunity.venueReservation(args.reservationId)
      await queryClient.invalidateQueries({ queryKey: key })
    },
  })

  /** Tiempo real: cambios en participantes sin depender de `profiles` (evita bucle con heartbeat / last_seen). */
  useEffect(() => {
    if (!selectedMatchOpportunityId || !currentUser?.id || !isSupabaseConfigured()) {
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const oppId = selectedMatchOpportunityId
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleParticipantsRefresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.matchOpportunity.participants(oppId),
        })
      }, 250)
    }
    const channel = supabase
      .channel(`match-detail-participants:${oppId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_opportunity_participants',
          filter: `opportunity_id=eq.${oppId}`,
        },
        scheduleParticipantsRefresh
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_opportunity_participants',
          filter: `opportunity_id=eq.${oppId}`,
        },
        scheduleParticipantsRefresh
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'match_opportunity_participants',
          filter: `opportunity_id=eq.${oppId}`,
        },
        scheduleParticipantsRefresh
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [selectedMatchOpportunityId, currentUser?.id, queryClient])

  const venueReservationId = opportunity?.venueReservationId ?? null
  const reservationQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.venueReservation(venueReservationId),
    enabled: Boolean(venueReservationId && currentUser?.id && isSupabaseConfigured()),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!venueReservationId) return null
      const sb = getBrowserSupabase()
      if (!sb) return null
      return await fetchVenueReservationForMatchDetail(sb, venueReservationId)
    },
  })
  const reservationState: MatchDetailReservationState | null =
    reservationQuery.data ?? null


  const goBack = useCallback(() => {
    setSelectedMatchOpportunityId(null)
    setCurrentScreen('matches')
  }, [setCurrentScreen, setSelectedMatchOpportunityId])

  const openChat = useCallback(() => {
    if (!opportunity || !currentUser) return
    const can =
      currentUser.id === opportunity.creatorId ||
      participatingOpportunityIds.includes(opportunity.id)
    if (!can) return
    setSelectedChatOpportunityId(opportunity.id)
    setCurrentScreen('chat')
  }, [
    opportunity,
    currentUser,
    participatingOpportunityIds,
    setSelectedChatOpportunityId,
    setCurrentScreen,
  ])

  const extJoinDataQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.revueltaExternalJoin(
      selectedMatchOpportunityId,
      currentUser?.id
    ),
    enabled: Boolean(selectedMatchOpportunityId && currentUser?.id && isSupabaseConfigured()),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!selectedMatchOpportunityId || !currentUser?.id) {
        return {
          extJoinRequests: [] as PendingRevueltaExternalRequest[],
          myExtPendingId: null as string | null,
          eligible: false,
        }
      }
      const uid = currentUser.id
      const opp = matchOpportunities.find((m) => m.id === selectedMatchOpportunityId)
      if (!opp || opp.type !== 'open' || !opp.privateRevueltaTeamId) {
        return {
          extJoinRequests: [] as PendingRevueltaExternalRequest[],
          myExtPendingId: null as string | null,
          eligible: false,
        }
      }
      const supabase = getBrowserSupabase()
      if (!supabase) {
        return {
          extJoinRequests: [] as PendingRevueltaExternalRequest[],
          myExtPendingId: null as string | null,
          eligible: false,
        }
      }
      const team = teams.find((t) => t.id === opp.privateRevueltaTeamId)
      const organizer = opp.creatorId === uid
      const member = userIsConfirmedMemberOfTeam(team, uid)
      const [extJoinRequests, mine] = await Promise.all([
        organizer
          ? fetchPendingRevueltaExternalRequests(supabase, selectedMatchOpportunityId)
          : Promise.resolve([]),
        !member
          ? fetchMyPendingRevueltaExternalRequest(supabase, selectedMatchOpportunityId, uid)
          : Promise.resolve(null),
      ])
      return {
        extJoinRequests,
        myExtPendingId: member ? null : mine?.id ?? null,
        eligible: true,
      }
    },
  })
  const extJoinRequests = extJoinDataQuery.data?.extJoinRequests ?? []
  const loadingExtRequests = extJoinDataQuery.isFetching
  const myExtPendingId = extJoinDataQuery.data?.myExtPendingId ?? null

  const handleRespondExtRequest = useCallback(
    async (requestId: string, accept: boolean) => {
      setRespondingId(requestId)
      try {
        const res = await respondToRevueltaExternalRequest(requestId, accept)
        if (res.ok) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.matchOpportunity.participants(selectedMatchOpportunityId),
          })
          await queryClient.invalidateQueries({
            queryKey: queryKeys.matchOpportunity.revueltaExternalJoin(
              selectedMatchOpportunityId,
              currentUser?.id
            ),
          })
        }
      } finally {
        setRespondingId(null)
      }
    },
    [
      respondToRevueltaExternalRequest,
      queryClient,
      selectedMatchOpportunityId,
      currentUser?.id,
    ]
  )

  if (!currentUser || !opportunity) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No hay partido seleccionado.</p>
          <Button onClick={goBack}>Volver a partidos</Button>
        </div>
      </div>
    )
  }

  const isCreator = currentUser.id === opportunity.creatorId
  const isParticipant = participatingOpportunityIds.includes(opportunity.id)
  /** Misma regla que RLS `can_access_opportunity_thread`: creador o inscrito. */
  const canOpenMatchChat = isCreator || isParticipant
  const gkCount = participants.filter((p) => p.isGoalkeeper).length
  const needed = opportunity.playersNeeded ?? 0
  const joined = opportunity.playersJoined ?? 0
  const privateRevueltaTeam = opportunity.privateRevueltaTeamId
    ? teams.find((t) => t.id === opportunity.privateRevueltaTeamId)
    : undefined
  const isPrivateRevueltaMember = userIsConfirmedMemberOfTeam(
    privateRevueltaTeam,
    currentUser.id
  )
  const isPrivateRevueltaNonMember =
    opportunity.type === 'open' &&
    !!opportunity.privateRevueltaTeamId &&
    !isPrivateRevueltaMember

  const canJoinRevuelta =
    opportunity.type === 'open' &&
    !isCreator &&
    !isParticipant &&
    (opportunity.status === 'pending' || opportunity.status === 'confirmed') &&
    !isPrivateRevueltaNonMember

  const canRequestPrivateRevuelta =
    isPrivateRevueltaNonMember &&
    !isCreator &&
    !isParticipant &&
    (opportunity.status === 'pending' || opportunity.status === 'confirmed') &&
    !myExtPendingId

  const showExtPendingHint =
    isPrivateRevueltaNonMember && !!myExtPendingId && !isParticipant

  const isOrganizerOfPrivateRevuelta =
    !!opportunity.privateRevueltaTeamId &&
    opportunity.creatorId === currentUser.id

  const canJoinPlayersSearch =
    opportunity.type === 'players' &&
    !isCreator &&
    !isParticipant &&
    (opportunity.status === 'pending' || opportunity.status === 'confirmed')

  const canSelfConfirmReservation =
    isCreator &&
    !!reservationState &&
    reservationState.status === 'pending' &&
    reservationState.bookerUserId === currentUser.id

  const contactWaHref = useMemo(() => {
    const raw = venueContact?.phone?.trim() ?? ''
    const digits = raw.replace(/\D/g, '')
    if (!digits || !opportunity) return null
    const msg = `Hola ${venueContact?.name ?? opportunity.venue}. Soy ${currentUser.name} y vengo de la app futmatch (soy el organizador del partido "${opportunity.title}"). Quiero confirmar la reserva de cancha para el ${formatMatchInTimezone(opportunity.dateTime, "d 'de' MMMM")} a las ${formatMatchInTimezone(opportunity.dateTime, 'HH:mm')} hrs. ¿quisiera saber si Está disponible y cómo realizo el pago?`
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
  }, [venueContact?.phone, venueContact?.name, opportunity, currentUser.name])

  const handleSelfConfirmReservation = useCallback(async () => {
    if (!reservationState || !isSupabaseConfigured()) return
    if (
      !confirm(
        'Confirmarás que ya coordinaste con el centro deportivo. ¿Deseas marcar esta reserva como confirmada?'
      )
    ) {
      return
    }
    try {
      await selfConfirmReservationMutation.mutateAsync({
        reservationId: reservationState.id,
        userId: currentUser.id,
      })
    } finally {
    }
  }, [reservationState, selfConfirmReservationMutation, currentUser.id])

  const openParticipantProfile = useCallback((userId: string) => {
    void prefetchPublicPlayerProfile(userId)
    openPublicProfile(userId)
  }, [openPublicProfile])

  const reloadMyRating = useCallback(() => {
    if (!opportunity) return
    void queryClient.invalidateQueries({
      queryKey: queryKeys.matchOpportunity.myRating(opportunity.id, currentUser.id),
    })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.matchOpportunity.ratingsOverview(opportunity.id),
    })
  }, [queryClient, opportunity, currentUser.id])

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="relative shrink-0 animate-float-logo-sm">
            <div
              className="pointer-events-none absolute inset-0 -z-10 scale-125 rounded-2xl bg-primary/20 blur-xl dark:bg-primary/30"
              aria-hidden
            />
            <Image
              src="/sportmatch-logo.png"
              alt="SPORTMATCH"
              width={160}
              height={160}
              className="h-12 w-12 object-contain drop-shadow-[0_0_16px_oklch(0.72_0.19_142_/_0.3)] md:h-14 md:w-14"
              sizes="56px"
              priority
              loading="eager"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-foreground md:text-2xl">
              Hola, {currentUser?.name?.split(' ')[0] || 'Jugador'}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              Encuentra tu partido perfecto
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-foreground">Detalle del partido</h2>
            <p className="text-xs text-muted-foreground">
              Información completa y estado
            </p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{opportunity.title}</h2>
              {opportunity.teamName && (
                <p className="text-sm text-muted-foreground">{opportunity.teamName}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {opportunity.privateRevueltaTeamId ? (
                <Badge variant="secondary" className="text-xs">
                  Privado · {privateRevueltaTeam?.name ?? 'equipo'}
                </Badge>
              ) : null}
              <Badge variant="outline">{opportunity.level}</Badge>
            </div>
          </div>

          {opportunity.description && (
            <p className="text-sm text-muted-foreground">{opportunity.description}</p>
          )}

          <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              {formatMatchInTimezone(opportunity.dateTime, "EEEE d 'de' MMMM")}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              {formatMatchInTimezone(opportunity.dateTime, 'HH:mm')} hrs
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              {opportunity.venue}, {opportunity.location}
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {opportunity.playersJoined ?? 0}
              {opportunity.playersNeeded ? `/${opportunity.playersNeeded}` : ''}{' '}
              jugadores
            </div>
            {opportunity.type === 'players' && needed > 0 && (
              <div className="text-xs text-muted-foreground pl-6 space-y-1">
                <p>
                  El número es solo para jugadores que se suman; el organizador no
                  ocupa cupo.
                </p>
                {playersSeekProfileLabel(opportunity.playersSeekProfile) && (
                  <p>
                    <span className="text-foreground font-medium">
                      {playersSeekProfileLabel(opportunity.playersSeekProfile)}
                    </span>
                    {opportunity.playersSeekProfile === 'gk_and_field' && (
                      <> · Máximo 1 arquero</>
                    )}
                  </p>
                )}
              </div>
            )}
            {opportunity.type === 'open' && needed > 0 && (
              <div className="text-xs text-muted-foreground pl-6 space-y-0.5">
                <p>
                  Cupos libres:{' '}
                  <span className="text-foreground font-medium">
                    {Math.max(0, needed - joined)}
                  </span>
                </p>
              </div>
            )}
          </div>

          <MatchCourtPricingBlock opportunity={opportunity} />

          {reservationState ? (
            <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">
                Estado de reserva de cancha: {reservationState.status === 'pending'
                  ? 'Pendiente'
                  : reservationState.status === 'confirmed'
                    ? 'Confirmada'
                    : 'Cancelada'}
              </p>
              {canSelfConfirmReservation ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Paso a paso: 1) contacta al centro, 2) valida horario y pago, 3) al cerrar
                    con el centro, marca esta reserva como confirmada. Queda registrada como
                    autoconfirmada por el organizador.
                  </p>
                  {contactWaHref ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="border-green-500/40 text-green-400 hover:bg-green-500/10"
                    >
                      <a href={contactWaHref} target="_blank" rel="noreferrer">
                        <MessageCircle className="w-4 h-4 mr-1.5" />
                        Contactar por WhatsApp al centro
                      </a>
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Este centro aún no tiene WhatsApp/teléfono cargado.
                    </p>
                  )}
                  <Button
                    size="sm"
                    onClick={() => void handleSelfConfirmReservation()}
                    disabled={selfConfirmReservationMutation.isPending}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {selfConfirmReservationMutation.isPending
                      ? 'Confirmando...'
                      : 'Ya coordiné con el centro, confirmar reserva'}
                  </Button>
                </>
              ) : reservationState.status === 'confirmed' ? (
                <p className="text-xs text-muted-foreground">
                  Fuente de confirmación:{' '}
                  <span className="text-foreground font-medium">
                    {reservationState.confirmationSource === 'booker_self'
                      ? 'Organizador (autoconfirmada)'
                      : reservationState.confirmationSource === 'venue_owner'
                        ? 'Centro deportivo'
                        : reservationState.confirmationSource === 'admin'
                          ? 'Administrador'
                          : 'No registrada'}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          {opportunity.type === 'open' &&
            (isCreator || isParticipant) &&
            (opportunity.status === 'pending' ||
              opportunity.status === 'confirmed') && (
              <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground">
                  Invitar jugadores
                </p>
                <p className="text-xs text-muted-foreground">
                  Cualquier participante puede invitar con el botón (compartir en apps o
                  copiar enlace). Los cupos se ven en la página pública.
                </p>
                <RevueltaInviteActions opportunity={opportunity} />
              </div>
            )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <span className="text-muted-foreground">Organizador:</span>
            <span className="text-foreground font-medium">{opportunity.creatorName}</span>
            {organizerOrganizedCount !== null && (
              <Badge
                variant="secondary"
                className="text-[10px] font-normal border-primary/25 bg-primary/10 text-primary"
                title={`${organizerOrganizedCount} partidos organizados finalizados`}
              >
                {getOrganizerTier(organizerOrganizedCount).label}
              </Badge>
            )}
          </div>
          {opportunity.status === 'cancelled' && opportunity.suspendedReason && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-red-300 mb-1">
                Partido suspendido
              </p>
              <p className="text-sm text-red-100">{opportunity.suspendedReason}</p>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border p-4">
          <h3 className="font-medium text-foreground mb-3">Participantes</h3>
          {loadingParticipants ? (
            <p className="text-sm text-muted-foreground">Cargando participantes...</p>
          ) : participants.length > 0 ? (
            <div className="space-y-2">
              {participants.map((p) => (
                <ParticipantListItem
                  key={p.id}
                  participant={p}
                  opportunityType={opportunity.type}
                  avatarDisplayUrl={avatarDisplayUrl}
                  onOpenProfile={openParticipantProfile}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin participantes aún.</p>
          )}
        </div>

        {isOrganizerOfPrivateRevuelta &&
          (opportunity.status === 'pending' ||
            opportunity.status === 'confirmed') && (
            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" aria-hidden />
                Solicitudes de jugadores externos
              </h3>
              <p className="text-xs text-muted-foreground">
                Como organizador del partido podés aceptar o rechazar quién se suma desde afuera del plantel. Si aceptás, juegan solo este encuentro; no ingresan al equipo.
              </p>
              {loadingExtRequests ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : extJoinRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nadie ha solicitado cupo todavía.
                </p>
              ) : (
                <ul className="space-y-2">
                  {extJoinRequests.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={r.requesterPhoto || '/sportmatch-logo.png'}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover border border-border"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {r.requesterName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.isGoalkeeper ? 'Arquero' : 'Jugador de campo'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={respondingId === r.id}
                          onClick={() => {
                            void handleRespondExtRequest(r.id, false)
                          }}
                        >
                          Rechazar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={respondingId === r.id}
                          onClick={() => {
                            void handleRespondExtRequest(r.id, true)
                          }}
                        >
                          Aceptar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

        {opportunity.type === 'open' && (
          <RevueltaTeamsPanel
            opportunity={opportunity}
            participants={participants}
            isOrganizer={isCreator}
            randomizeRevueltaTeams={randomizeRevueltaTeams}
          />
        )}

        {canRequestPrivateRevuelta && (
          <Button
            type="button"
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
            onClick={() => setJoinRevueltaOpen(true)}
          >
            Solicitar ingreso
          </Button>
        )}
        {showExtPendingHint && (
          <p className="text-center text-sm text-muted-foreground rounded-xl border border-border bg-secondary/30 px-3 py-2">
            Tu solicitud está pendiente. El organizador del partido la revisará.
          </p>
        )}
        {canJoinRevuelta && (
          <Button
            type="button"
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
            onClick={() => setJoinRevueltaOpen(true)}
          >
            Unirme a la revuelta
          </Button>
        )}

        {canJoinPlayersSearch && (
          <Button
            type="button"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => setJoinPlayersOpen(true)}
          >
            Postular
          </Button>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            onClick={openChat}
            className="w-full"
            disabled={!canOpenMatchChat}
            title={
              canOpenMatchChat
                ? undefined
                : 'Solo el organizador y los jugadores inscritos en este partido pueden usar el chat.'
            }
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Abrir chat
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentScreen('matches')}
            className="w-full"
          >
            Ver en Partidos
          </Button>
        </div>
        {!canOpenMatchChat && (
          <p className="text-xs text-center text-muted-foreground">
            El chat solo está disponible para el organizador y los jugadores
            inscritos en este partido.
          </p>
        )}

        {(opportunity.status === 'completed' ||
          (ratingSummary?.count ?? 0) > 0) && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <h3 className="font-medium text-foreground">Calificaciones del partido</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox
                label="Reseñas"
                value={String(ratingSummary?.count ?? 0)}
              />
              <StatBox
                label="General"
                value={
                  ratingSummary?.avgOverall != null
                    ? `⭐ ${ratingSummary.avgOverall}`
                    : '—'
                }
              />
              <StatBox
                label="Partido"
                value={
                  ratingSummary?.avgMatch != null
                    ? `⭐ ${ratingSummary.avgMatch}`
                    : '—'
                }
              />
              <StatBox
                label="Nivel"
                value={
                  ratingSummary?.avgLevel != null
                    ? `⭐ ${ratingSummary.avgLevel}`
                    : '—'
                }
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Gestión organizador:{' '}
              {ratingSummary?.avgOrganizer != null
                ? `⭐ ${ratingSummary.avgOrganizer}`
                : 'Sin datos aún'}
            </div>

            {recentComments.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Comentarios recientes
                </p>
                {recentComments.map((c) => (
                  <div
                    key={`${c.createdAt.toISOString()}-${c.comment.slice(0, 8)}`}
                    className="text-sm text-muted-foreground bg-secondary/60 rounded-lg p-2"
                  >
                    “{c.comment}”
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aún no hay comentarios en este partido.
              </p>
            )}
          </div>
        )}
      </div>

      <JoinRevueltaDialog
        open={joinRevueltaOpen}
        onOpenChange={setJoinRevueltaOpen}
        opportunity={opportunity}
        mode={isPrivateRevueltaNonMember ? 'request' : 'join'}
        onJoin={async (isGk) => {
          if (isPrivateRevueltaNonMember) {
            const r = await requestJoinPrivateRevuelta(opportunity.id, isGk)
            if (r.ok) {
              await queryClient.invalidateQueries({
                queryKey: queryKeys.matchOpportunity.revueltaExternalJoin(
                  opportunity.id,
                  currentUser.id
                ),
              })
            }
            return
          }
          await joinMatchOpportunity(opportunity.id, { isGoalkeeper: isGk })
        }}
      />

      <JoinPlayersSearchDialog
        open={joinPlayersOpen}
        onOpenChange={setJoinPlayersOpen}
        opportunity={opportunity}
        onJoin={async (isGk) => {
          await joinMatchOpportunity(opportunity.id, { isGoalkeeper: isGk })
        }}
      />

      <MatchCompletionPanel
        opportunity={opportunity}
        rivalChallenge={rivalChallengeForOpp}
        currentUserId={currentUser.id}
        isConfirmedParticipant={isParticipant}
        myRating={myRating}
        loadingRating={loadingRating}
        onReloadMyRating={reloadMyRating}
        finalizeMatchOpportunity={finalizeMatchOpportunity}
        submitRivalCaptainVote={submitRivalCaptainVote}
        finalizeRivalOrganizerOverride={finalizeRivalOrganizerOverride}
        suspendMatchOpportunity={suspendMatchOpportunity}
        submitMatchRating={submitMatchRating}
      />

      <BottomNav />
    </div>
  )
}

const StatBox = memo(function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
})

const ParticipantListItem = memo(function ParticipantListItem({
  participant,
  opportunityType,
  avatarDisplayUrl,
  onOpenProfile,
}: {
  participant: OpportunityParticipantRow
  opportunityType: 'rival' | 'players' | 'open'
  avatarDisplayUrl: (photo?: string, userId?: string) => string
  onOpenProfile: (userId: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onMouseEnter={() => {
            void prefetchPublicPlayerProfile(participant.id)
          }}
          onFocus={() => {
            void prefetchPublicPlayerProfile(participant.id)
          }}
          onClick={() => onOpenProfile(participant.id)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <img
            src={avatarDisplayUrl(participant.photo, participant.id)}
            alt={participant.name}
            className="w-8 h-8 rounded-full object-cover border border-border"
          />
          <span className="text-sm text-foreground truncate hover:underline">
            {participant.name}
            {(opportunityType === 'open' || opportunityType === 'players') &&
            participant.isGoalkeeper
              ? ' 🧤'
              : ''}
          </span>
        </button>
      </div>
      <Badge variant="secondary" className="capitalize text-xs">
        {participant.status === 'creator'
          ? 'Organizador'
          : participant.status === 'confirmed'
            ? 'Confirmado'
            : participant.status === 'pending'
              ? 'Pendiente'
              : participant.status === 'invited'
                ? 'Invitado'
                : 'Cancelado'}
      </Badge>
    </div>
  )
})
