'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Calendar,
  Clock,
  Eye,
  Grid3x3,
  Info,
  MapPin,
  Users,
} from 'lucide-react'
import type { MatchOpportunity, RivalChallenge, Team, User } from '@/lib/types'
import type { OpportunityParticipantRow } from '@/lib/supabase/message-queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { buildRivalMatchLineupLayout } from '@/lib/match-lineup-slots'
import {
  isRivalDuelSpectator,
  userIsMemberOfRivalDuelTeam,
} from '@/lib/rival-match-access'
import {
  resolveUserRivalPickTeam,
  rivalSlotEncounterRole,
  type RivalLineupSlotId,
} from '@/lib/rival-lineup-slot'
import { fetchRivalEncounterDisplay } from '@/lib/supabase/rival-match-detail'
import {
  joinRivalMatchLineupSlot,
  moveRivalMatchLineupSlot,
} from '@/lib/supabase/rival-lineup-actions'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'
import { queryKeys } from '@/lib/query-keys'
import { RivalMatchPitchLineup } from '@/components/rival-match-pitch-lineup'
import { cn } from '@/lib/utils'

type Props = {
  opportunity: MatchOpportunity
  rivalChallenge: RivalChallenge
  teams: Team[]
  currentUser: User
  participants: OpportunityParticipantRow[]
  isParticipant: boolean
  participatingOpportunityIds: string[]
  avatarDisplayUrl: (url: string, userId?: string) => string
  onParticipantsChanged: () => void
  refreshPlayerMatchBundle: () => Promise<void>
  leaveRivalMatchOpportunity: (opportunityId: string) => Promise<void>
  /** Oculta «No puedo asistir» en vista simplificada (solo chat abajo). */
  showParticipantLeave?: boolean
}

function statusLabel(status: MatchOpportunity['status']): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmado'
    case 'completed':
      return 'Finalizado'
    case 'cancelled':
      return 'Cancelado'
    default:
      return 'Pendiente'
  }
}

function teamLogoSrc(url: string | null | undefined): string {
  const t = url?.trim()
  return t && t.length > 0 ? t : '/sportmatch-logo.png'
}

export function RivalMatchDetailView({
  opportunity,
  rivalChallenge,
  teams,
  currentUser,
  participants,
  isParticipant,
  avatarDisplayUrl,
  onParticipantsChanged,
  refreshPlayerMatchBundle,
  leaveRivalMatchOpportunity,
  showParticipantLeave = true,
}: Props) {
  const queryClient = useQueryClient()
  const [slotBusy, setSlotBusy] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  const isCreator = currentUser.id === opportunity.creatorId
  const isSpectator = isRivalDuelSpectator(opportunity, rivalChallenge, teams, currentUser.id, {
    isCreator,
    isParticipant,
  })
  const myPickTeam = resolveUserRivalPickTeam(rivalChallenge, teams, currentUser.id)
  const onTeam = userIsMemberOfRivalDuelTeam(rivalChallenge, teams, currentUser.id)

  const encounterQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.rivalEncounterDisplay(
      opportunity.id,
      currentUser.id
    ),
    enabled: sessionQueryEnabled(currentUser.id) && isSupabaseConfigured(),
    queryFn: async () => {
      const sb = getBrowserSupabase()
      if (!sb) throw new Error('Sin cliente')
      const challenger = teams.find((t) => t.id === rivalChallenge.challengerTeamId)
      const accepted = rivalChallenge.acceptedTeamId
        ? teams.find((t) => t.id === rivalChallenge.acceptedTeamId)
        : undefined
      return fetchRivalEncounterDisplay(sb, opportunity.id, {
        challengerTeamId: rivalChallenge.challengerTeamId,
        challengerTeamName: rivalChallenge.challengerTeamName,
        challengerLogo: challenger?.logo,
        acceptedTeamId: rivalChallenge.acceptedTeamId,
        acceptedTeamName: rivalChallenge.acceptedTeamName,
        acceptedLogo: accepted?.logo,
        mode: rivalChallenge.mode,
        status: rivalChallenge.status,
        playersNeeded: opportunity.playersNeeded,
      })
    },
  })

  const display = encounterQuery.data
  const homeName = display?.home.name ?? rivalChallenge.challengerTeamName
  const awayName =
    display?.away?.name ?? rivalChallenge.acceptedTeamName ?? 'Equipo visita'
  const homeLogo = teamLogoSrc(display?.home.logoUrl ?? teams.find((t) => t.id === rivalChallenge.challengerTeamId)?.logo)
  const awayLogo = teamLogoSrc(
    display?.away?.logoUrl ??
      teams.find((t) => t.id === rivalChallenge.acceptedTeamId)?.logo
  )

  const rosterContext = useMemo(
    () => ({
      challengerCaptainId: rivalChallenge.challengerCaptainId,
      acceptedCaptainId: rivalChallenge.acceptedCaptainId,
      resolvePickTeam: (userId: string) =>
        resolveUserRivalPickTeam(rivalChallenge, teams, userId),
    }),
    [rivalChallenge, teams]
  )

  const layout = useMemo(
    () =>
      buildRivalMatchLineupLayout({
        playersNeeded: opportunity.playersNeeded,
        participants,
        currentUserId: currentUser.id,
        rosterContext,
      }),
    [opportunity.playersNeeded, participants, currentUser.id, rosterContext]
  )

  const registeredCount = useMemo(() => {
    return participants.filter(
      (p) =>
        p.status === 'creator' ||
        p.status === 'confirmed' ||
        p.status === 'pending'
    ).length
  }, [participants])

  const matchOpen =
    opportunity.status === 'pending' || opportunity.status === 'confirmed'

  const canPickSlot = Boolean(onTeam && myPickTeam && matchOpen && !isSpectator)

  const hint = useMemo(() => {
    if (isSpectator) return null
    if (!onTeam) return null
    if (!matchOpen) return 'Este encuentro ya no admite cambios en la plantilla.'
    if (isParticipant) {
      return 'Toca otro círculo libre de tu equipo para cambiar de cupo.'
    }
    return 'Toca un círculo libre de tu equipo para ocupar ese cupo.'
  }, [isSpectator, onTeam, matchOpen, isParticipant])

  const handleSlotPress = async (slotId: RivalLineupSlotId, side: 'A' | 'B') => {
    if (!canPickSlot || myPickTeam !== side) return
    const sb = getBrowserSupabase()
    if (!sb) return
    setSlotBusy(slotId)
    const role = rivalSlotEncounterRole(slotId)
    try {
      const result = isParticipant
        ? await moveRivalMatchLineupSlot(sb, opportunity.id, slotId, role)
        : await joinRivalMatchLineupSlot(sb, opportunity.id, side, slotId, role)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(isParticipant ? 'Cupo actualizado' : 'Te uniste al partido')
      onParticipantsChanged()
      await refreshPlayerMatchBundle()
      void queryClient.invalidateQueries({
        queryKey: queryKeys.matchOpportunity.participants(opportunity.id),
      })
    } finally {
      setSlotBusy(null)
    }
  }

  const handleLeave = async () => {
    if (!isParticipant || !matchOpen) return
    const sb = getBrowserSupabase()
    if (!sb) return
    if (
      !confirm(
        '¿Confirmas que no puedes asistir? Liberarás tu cupo en la plantilla.'
      )
    ) {
      return
    }
    setLeaving(true)
    try {
      await leaveRivalMatchOpportunity(opportunity.id)
      onParticipantsChanged()
    } finally {
      setLeaving(false)
    }
  }

  const formationLabel =
    layout.mode === 'rival6Bench'
      ? `Formación 1-2-2-1 · ${layout.sideA.benchSlots.length} supl.`
      : 'Formación 1-2-2-1'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 text-primary gap-1"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          {statusLabel(opportunity.status)}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          Rival
        </Badge>
        <Badge variant="outline" className="text-xs uppercase">
          {opportunity.level}
        </Badge>
      </div>

      <div className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
          <Badge className="bg-primary/90 text-primary-foreground hover:bg-primary/90 text-[10px] uppercase">
            {opportunity.level}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {statusLabel(opportunity.status)}
          </Badge>
        </div>

        <div className="px-4 pt-5 pb-4 space-y-4">
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <div className="relative">
                <Image
                  src={homeLogo}
                  alt=""
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-full border-[3px] border-primary/40 object-cover bg-card shadow-md"
                  sizes="80px"
                />
              </div>
              <p className="font-brand-heading text-xs sm:text-sm leading-tight text-foreground line-clamp-2 px-1">
                {homeName}
              </p>
            </div>

            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-lg font-black text-white shadow-lg"
              aria-hidden
            >
              VS
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <Image
                src={awayLogo}
                alt=""
                width={80}
                height={80}
                className="h-20 w-20 rounded-full border-[3px] border-accent/50 object-cover bg-card shadow-md"
                sizes="80px"
              />
              <p className="font-brand-heading text-xs sm:text-sm leading-tight text-foreground line-clamp-2 px-1">
                {awayName}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80 flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3" aria-hidden />
              Cancha
            </p>
            <p className="font-brand-heading text-base text-foreground">{opportunity.venue}</p>
            <p className="text-sm text-muted-foreground">{opportunity.location}</p>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-primary" />
              {formatMatchInTimezone(opportunity.dateTime, "EEEE, d 'de' MMMM")}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0 text-primary" />
              {formatMatchInTimezone(opportunity.dateTime, 'HH:mm')} hrs
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 shrink-0 text-primary" />
              <span className="text-foreground">
                {registeredCount === 1
                  ? '1 jugador inscrito'
                  : `${registeredCount} jugadores inscritos`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {opportunity.description?.trim() ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Descripción
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {opportunity.description.trim()}
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
        <Image
          src={avatarDisplayUrl(opportunity.creatorPhoto, opportunity.creatorId)}
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 rounded-full object-cover border border-border"
        />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Organizador
          </p>
          <p className="font-brand-heading text-base text-foreground">
            {opportunity.creatorName}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <Grid3x3 className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <h3 className="font-brand-heading text-base text-foreground">
                Plantilla en cancha
              </h3>
              <p className="text-xs text-muted-foreground">{formationLabel}</p>
            </div>
          </div>
          {isSpectator ? (
            <Badge
              variant="secondary"
              className="shrink-0 gap-1 border-border bg-secondary/80 text-[10px] uppercase tracking-wide"
            >
              <Eye className="h-3 w-3" aria-hidden />
              Solo lectura
            </Badge>
          ) : null}
        </div>

        <RivalMatchPitchLineup
          layout={layout}
          homeTeamName={homeName}
          awayTeamName={awayName}
          avatarUrl={avatarDisplayUrl}
          canPickSlot={canPickSlot}
          readOnly={isSpectator}
          myPickTeam={myPickTeam}
          isParticipant={isParticipant}
          onSlotPress={(slotId, side) => void handleSlotPress(slotId, side)}
          slotBusy={slotBusy}
        />

        {hint ? (
          <div className="flex gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 text-primary mt-0.5" aria-hidden />
            <p>{hint}</p>
          </div>
        ) : null}

        {showParticipantLeave && isParticipant && matchOpen && !isSpectator ? (
          <Button
            type="button"
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={leaving}
            onClick={() => void handleLeave()}
          >
            {leaving ? 'Saliendo…' : 'No puedo asistir'}
          </Button>
        ) : null}
      </div>

      {isSpectator ? (
        <p className="text-center text-sm text-muted-foreground rounded-xl border border-border bg-secondary/30 px-3 py-2">
          Este duelo es entre dos equipos. Puedes ver la información del partido;
          solo los integrantes de cada equipo pueden inscribirse en la nómina.
        </p>
      ) : null}
    </div>
  )
}
