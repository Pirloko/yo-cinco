'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
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
import { getOrganizerTier } from '@/lib/organizer-level'
import { fetchOrganizerCompletedCount } from '@/lib/supabase/queries'

export function MatchDetailsScreen() {
  const {
    currentUser,
    setCurrentScreen,
    matchOpportunities,
    selectedMatchOpportunityId,
    setSelectedMatchOpportunityId,
    setSelectedChatOpportunityId,
    participatingOpportunityIds,
    joinMatchOpportunity,
    randomizeRevueltaTeams,
    finalizeMatchOpportunity,
    suspendMatchOpportunity,
    submitMatchRating,
    rivalChallenges,
    submitRivalCaptainVote,
    finalizeRivalOrganizerOverride,
  } = useApp()

  const opportunity = selectedMatchOpportunityId
    ? matchOpportunities.find((m) => m.id === selectedMatchOpportunityId)
    : undefined

  const rivalChallengeForOpp = useMemo(
    () =>
      opportunity
        ? rivalChallenges.find((c) => c.opportunityId === opportunity.id) ?? null
        : null,
    [rivalChallenges, opportunity?.id]
  )

  const [participants, setParticipants] = useState<OpportunityParticipantRow[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [myRating, setMyRating] = useState<MatchOpportunityRatingRow | null>(null)
  const [loadingRating, setLoadingRating] = useState(false)
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null)
  const [recentComments, setRecentComments] = useState<
    Array<{ comment: string; createdAt: Date }>
  >([])
  const [joinRevueltaOpen, setJoinRevueltaOpen] = useState(false)
  const [joinPlayersOpen, setJoinPlayersOpen] = useState(false)
  const [reservationState, setReservationState] = useState<{
    id: string
    status: 'pending' | 'confirmed' | 'cancelled'
    paymentStatus: 'unpaid' | 'deposit_paid' | 'paid' | null
    confirmationSource: 'venue_owner' | 'booker_self' | 'admin' | null
    confirmedAt: Date | null
    bookerUserId: string | null
  } | null>(null)
  const [confirmingReservation, setConfirmingReservation] = useState(false)
  const [venueContact, setVenueContact] = useState<{
    name: string
    phone: string | null
  } | null>(null)
  const [organizerOrganizedCount, setOrganizerOrganizedCount] = useState<number | null>(
    null
  )

  const loadParticipants = useCallback(async () => {
    if (!selectedMatchOpportunityId || !currentUser || !isSupabaseConfigured()) {
      setParticipants([])
      return
    }
    setLoadingParticipants(true)
    try {
      const rows = await fetchParticipantsForOpportunity(
        createClient(),
        selectedMatchOpportunityId
      )
      setParticipants(rows)
    } finally {
      setLoadingParticipants(false)
    }
  }, [selectedMatchOpportunityId, currentUser])

  const loadRatingsOverview = useCallback(async () => {
    if (!selectedMatchOpportunityId || !isSupabaseConfigured()) {
      setRatingSummary(null)
      setRecentComments([])
      return
    }
    const supabase = createClient()
    const [summary, comments] = await Promise.all([
      fetchRatingSummaryForOpportunity(supabase, selectedMatchOpportunityId),
      fetchRecentRatingCommentsForOpportunity(supabase, selectedMatchOpportunityId),
    ])
    setRatingSummary(summary)
    setRecentComments(comments)
  }, [selectedMatchOpportunityId])

  const loadMyRating = useCallback(async () => {
    if (!selectedMatchOpportunityId || !currentUser || !isSupabaseConfigured()) {
      setMyRating(null)
      return
    }
    setLoadingRating(true)
    try {
      const row = await fetchMyRatingForOpportunity(
        createClient(),
        selectedMatchOpportunityId,
        currentUser.id
      )
      setMyRating(row)
    } finally {
      setLoadingRating(false)
    }
  }, [selectedMatchOpportunityId, currentUser])

  useEffect(() => {
    void loadParticipants()
    void loadMyRating()
    void loadRatingsOverview()
  }, [loadParticipants, loadMyRating, loadRatingsOverview])

  useEffect(() => {
    if (!opportunity || !isSupabaseConfigured()) {
      setOrganizerOrganizedCount(null)
      return
    }
    if (currentUser?.id === opportunity.creatorId) {
      setOrganizerOrganizedCount(currentUser.statsOrganizedCompleted ?? 0)
      return
    }
    let cancelled = false
    void (async () => {
      const n = await fetchOrganizerCompletedCount(
        createClient(),
        opportunity.creatorId
      )
      if (!cancelled) setOrganizerOrganizedCount(n)
    })()
    return () => {
      cancelled = true
    }
  }, [
    opportunity?.id,
    opportunity?.creatorId,
    currentUser?.id,
    currentUser?.statsOrganizedCompleted,
  ])

  useEffect(() => {
    if (!opportunity?.venueReservationId || !currentUser || !isSupabaseConfigured()) {
      setReservationState(null)
      return
    }
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('venue_reservations')
        .select(
          'id, status, payment_status, confirmation_source, confirmed_at, booker_user_id'
        )
        .eq('id', opportunity.venueReservationId)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setReservationState(null)
        return
      }
      setReservationState({
        id: data.id as string,
        status: data.status as 'pending' | 'confirmed' | 'cancelled',
        paymentStatus: (data.payment_status as 'unpaid' | 'deposit_paid' | 'paid' | null) ?? null,
        confirmationSource:
          (data.confirmation_source as 'venue_owner' | 'booker_self' | 'admin' | null) ??
          null,
        confirmedAt: data.confirmed_at ? new Date(data.confirmed_at as string) : null,
        bookerUserId: (data.booker_user_id as string | null) ?? null,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [opportunity?.venueReservationId, currentUser])

  useEffect(() => {
    if (!opportunity?.sportsVenueId || !isSupabaseConfigured()) {
      setVenueContact(null)
      return
    }
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('sports_venues')
        .select('name, phone')
        .eq('id', opportunity.sportsVenueId)
        .maybeSingle()
      if (cancelled) return
      if (!data) {
        setVenueContact(null)
        return
      }
      setVenueContact({
        name: (data.name as string) ?? opportunity.venue,
        phone: ((data.phone as string | null) ?? '').trim() || null,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [opportunity?.sportsVenueId, opportunity?.venue])

  const goBack = () => {
    setSelectedMatchOpportunityId(null)
    setCurrentScreen('matches')
  }

  const openChat = () => {
    if (!opportunity) return
    setSelectedChatOpportunityId(opportunity.id)
    setCurrentScreen('chat')
  }

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
  const gkCount = participants.filter((p) => p.isGoalkeeper).length
  const needed = opportunity.playersNeeded ?? 0
  const joined = opportunity.playersJoined ?? 0
  const canJoinRevuelta =
    opportunity.type === 'open' &&
    !isCreator &&
    !isParticipant &&
    (opportunity.status === 'pending' || opportunity.status === 'confirmed')

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

  const contactWaHref = (() => {
    const raw = venueContact?.phone?.trim() ?? ''
    const digits = raw.replace(/\D/g, '')
    if (!digits || !opportunity) return null
    const msg = `Hola ${venueContact?.name ?? opportunity.venue}. Soy ${currentUser.name} y vengo de la app futmatch (soy el organizador del partido "${opportunity.title}"). Quiero confirmar la reserva de cancha para el ${formatMatchInTimezone(opportunity.dateTime, "d 'de' MMMM")} a las ${formatMatchInTimezone(opportunity.dateTime, 'HH:mm')} hrs. ¿quisiera saber si Está disponible y cómo realizo el pago?`
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
  })()

  const handleSelfConfirmReservation = async () => {
    if (!reservationState || !isSupabaseConfigured()) return
    if (
      !confirm(
        'Confirmarás que ya coordinaste con el centro deportivo. ¿Deseas marcar esta reserva como confirmada?'
      )
    ) {
      return
    }
    setConfirmingReservation(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('venue_reservations')
        .update({
          status: 'confirmed',
          confirmation_source: 'booker_self',
          confirmed_by_user_id: currentUser.id,
          confirmation_note: 'Confirmada por organizador en flujo guiado',
        })
        .eq('id', reservationState.id)
        .eq('booker_user_id', currentUser.id)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Reserva confirmada. Quedó registrada como autoconfirmada.')
      setReservationState((prev) =>
        prev
          ? {
              ...prev,
              status: 'confirmed',
              confirmationSource: 'booker_self',
              confirmedAt: new Date(),
            }
          : prev
      )
    } finally {
      setConfirmingReservation(false)
    }
  }

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
            <Badge variant="outline">{opportunity.level}</Badge>
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
                    disabled={confirmingReservation}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {confirmingReservation
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
                  Cualquier participante puede compartir el enlace (WhatsApp, etc.).
                  Los cupos se ven en la página pública.
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
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={p.photo}
                      alt={p.name}
                      className="w-8 h-8 rounded-full object-cover border border-border"
                    />
                    <span className="text-sm text-foreground truncate">
                      {p.name}
                      {(opportunity.type === 'open' || opportunity.type === 'players') &&
                      p.isGoalkeeper
                        ? ' 🧤'
                        : ''}
                    </span>
                  </div>
                  <Badge variant="secondary" className="capitalize text-xs">
                    {p.status === 'creator'
                      ? 'Organizador'
                      : p.status === 'confirmed'
                        ? 'Confirmado'
                        : p.status === 'pending'
                          ? 'Pendiente'
                          : p.status === 'invited'
                            ? 'Invitado'
                            : 'Cancelado'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin participantes aún.</p>
          )}
        </div>

        {opportunity.type === 'open' && (
          <RevueltaTeamsPanel
            opportunity={opportunity}
            participants={participants}
            isOrganizer={isCreator}
            randomizeRevueltaTeams={randomizeRevueltaTeams}
          />
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
          <Button onClick={openChat} className="w-full">
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
        onJoin={async (isGk) => {
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
        onReloadMyRating={() => {
          void loadMyRating()
          void loadRatingsOverview()
        }}
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
