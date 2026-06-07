'use client'

import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  MatchOpportunity,
  RevueltaResult,
  RivalChallenge,
  RivalResult,
  Team,
  SportsVenue,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { MatchOpportunityRatingRow } from '@/lib/supabase/rating-queries'
import type { OpportunityParticipantRow } from '@/lib/supabase/message-queries'
import {
  matchReviewEligibleParticipants,
  userCanSubmitMatchReview,
} from '@/lib/match-review-eligibility'
import { Trophy, ClipboardCheck, Star, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import { fetchSportsVenuesForPlayerGeo } from '@/lib/supabase/venue-queries'
import { userIsConfirmedMemberOfTeam } from '@/lib/team-membership'
import { useAppAuth } from '@/lib/app-context'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'
import { QUERY_STALE_TIME_STATIC_MS } from '@/lib/query-defaults'

/** Motivos predefinidos al suspender (organizador). */
const SUSPEND_PRESET_REASONS = [
  'Mal tiempo o lluvia',
  'Cancha no disponible o cancelada',
  'No se completó el grupo de jugadores',
  'Motivos de salud o lesión',
  'Conflicto de horario o agenda',
] as const

/** Motivos predefinidos al salir como jugador (no organizador). */
const LEAVE_PRESET_REASONS = [
  'Conflicto de horario o agenda',
  'Motivos de salud o lesión',
  'No puedo llegar al lugar o a la hora',
  'Cambio de planes personales',
  'Prefiero no jugar este encuentro',
] as const

const RESCHEDULE_PRESET_REASONS = [
  'Centro no disponible para ese horario',
  'El centro ofreció otro horario',
  'Ajuste logístico de cancha/ubicación',
  'Condiciones climáticas o del recinto',
] as const

function getRivalCaptainConfirmsProposalId(
  opportunity: MatchOpportunity,
  rivalChallenge: RivalChallenge,
  teams: Team[]
): string | undefined {
  const chTeam = teams.find((t) => t.id === rivalChallenge.challengerTeamId)
  const accTeam = teams.find((t) => t.id === rivalChallenge.acceptedTeamId)
  if (userIsConfirmedMemberOfTeam(chTeam, opportunity.creatorId)) {
    return rivalChallenge.acceptedCaptainId
  }
  if (userIsConfirmedMemberOfTeam(accTeam, opportunity.creatorId)) {
    return rivalChallenge.challengerCaptainId
  }
  return rivalChallenge.acceptedCaptainId
}

function StarRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label className="font-brand-heading text-sm text-foreground">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`p-1.5 rounded-lg border transition-colors ${
              value >= n
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-secondary border-border text-muted-foreground hover:border-primary/50'
            } disabled:opacity-50`}
            aria-label={`${n} estrellas`}
          >
            <Star
              className={`w-5 h-5 ${value >= n ? 'fill-primary' : ''}`}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Prefijo de valor en Select al elegir un centro del catálogo (reprogramar). */
const RESCHEDULE_CANCHA_DB_PREFIX = 'db:'
const RESCHEDULE_CANCHA_CUSTOM = 'custom'

type Props = {
  opportunity: MatchOpportunity
  /** Desafío rival aceptado (si aplica). */
  rivalChallenge: RivalChallenge | null
  /** Equipos del usuario (para capitán que confirma propuesta y reseñas). */
  teams: Team[]
  currentUserId: string
  isConfirmedParticipant: boolean
  /** Duelo rival: oculta «Salir del partido» (salida en plantilla o flujo aparte). */
  hideParticipantLeave?: boolean
  /** Lista de participantes (para MVP y elegibilidad de reseña). */
  participants?: OpportunityParticipantRow[]
  myRating: MatchOpportunityRatingRow | null
  loadingRating: boolean
  onReloadMyRating: () => void
  finalizeMatchOpportunity: (
    opportunityId: string,
    outcome:
      | { kind: 'casual' }
      | { kind: 'revuelta'; revueltaResult: RevueltaResult }
      | { kind: 'rival'; rivalResult: RivalResult }
  ) => Promise<boolean>
  finalizeRivalOrganizerOverride: (
    opportunityId: string,
    result: RivalResult
  ) => Promise<void>
  respondRivalMatchProposal: (
    opportunityId: string,
    confirm: boolean,
    disputeDetails?: string
  ) => Promise<void>
  suspendMatchOpportunity: (
    opportunityId: string,
    reason: string
  ) => Promise<void>
  leaveMatchOpportunityWithReason: (
    opportunityId: string,
    reason: string
  ) => Promise<boolean>
  rescheduleMatchOpportunityWithReason: (payload: {
    opportunityId: string
    venue: string
    location: string
    dateTime: Date
    reason: string
    sportsVenueId?: string | null
  }) => Promise<void>
  submitMatchRating: (
    opportunityId: string,
    payload: {
      venueRating: number
      matchRating: number
      levelRating: number
      mvpUserId: string
      comment?: string
    }
  ) => Promise<void>
}

export function MatchCompletionPanel({
  opportunity,
  rivalChallenge,
  teams,
  currentUserId,
  isConfirmedParticipant,
  hideParticipantLeave = false,
  participants = [],
  myRating,
  loadingRating,
  onReloadMyRating,
  finalizeMatchOpportunity,
  finalizeRivalOrganizerOverride,
  respondRivalMatchProposal,
  suspendMatchOpportunity,
  leaveMatchOpportunityWithReason,
  rescheduleMatchOpportunityWithReason,
  submitMatchRating,
}: Props) {
  const { currentUser } = useAppAuth()
  const isCreator = opportunity.creatorId === currentUserId
  const completed = opportunity.status === 'completed'
  const needsResolveAfterMidnight = (() => {
    if (!isCreator) return false
    if (completed || opportunity.status === 'cancelled') return false
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    return opportunity.dateTime.getTime() < midnight.getTime()
  })()
  const finalizedAt = opportunity.finalizedAt
  const reviewEligibleParticipants = useMemo(
    () => matchReviewEligibleParticipants(participants),
    [participants]
  )
  const canSubmitReview = useMemo(() => {
    if (participants.length > 0) {
      return userCanSubmitMatchReview(currentUserId, participants)
    }
    return isCreator || isConfirmedParticipant
  }, [
    participants,
    currentUserId,
    isCreator,
    isConfirmedParticipant,
  ])
  const canRate =
    completed &&
    !!finalizedAt &&
    canSubmitReview &&
    !myRating &&
    !loadingRating

  const deadline72h = useMemo(() => {
    const d = new Date(opportunity.dateTime)
    d.setHours(d.getHours() + 72)
    return d
  }, [opportunity.dateTime])

  const captainConfirmsProposalId =
    rivalChallenge && teams.length > 0
      ? getRivalCaptainConfirmsProposalId(opportunity, rivalChallenge, teams)
      : undefined

  const showCaptainProposalResponse =
    opportunity.type === 'rival' &&
    rivalChallenge?.status === 'accepted' &&
    !completed &&
    !!opportunity.rivalOrganizerProposedResult &&
    !(opportunity.rivalProposalDisputed ?? false) &&
    captainConfirmsProposalId === currentUserId

  const showRivalDisputeModeration =
    opportunity.type === 'rival' &&
    !completed &&
    (opportunity.rivalProposalDisputed ?? false)

  const showOrganizerAwaitingCaptain =
    opportunity.type === 'rival' &&
    isCreator &&
    !completed &&
    !!opportunity.rivalOrganizerProposedResult &&
    !(opportunity.rivalProposalDisputed ?? false)

  const rivalOrganizerFinalizeBlocked =
    opportunity.type === 'rival' &&
    isCreator &&
    !!opportunity.rivalOrganizerProposedResult &&
    !(opportunity.rivalProposalDisputed ?? false) &&
    !completed

  const showOrganizerOverride =
    opportunity.type === 'rival' &&
    isCreator &&
    !completed &&
    opportunity.rivalOutcomeDisputed &&
    Date.now() >= deadline72h.getTime()

  const showOrganizerDisputeWait =
    opportunity.type === 'rival' &&
    isCreator &&
    !completed &&
    opportunity.rivalOutcomeDisputed &&
    Date.now() < deadline72h.getTime()

  const showOrganizerFinalizeCasual =
    isCreator &&
    !completed &&
    opportunity.status !== 'cancelled' &&
    (opportunity.type === 'players' ||
      opportunity.type === 'open' ||
      opportunity.type === 'team_pick_public' ||
      opportunity.type === 'team_pick_private' ||
      (opportunity.type === 'rival' && rivalChallenge?.status === 'accepted'))

  const canCancelRivalAsCaptain =
    opportunity.type === 'rival' &&
    !completed &&
    opportunity.status !== 'cancelled' &&
    !!rivalChallenge &&
    (rivalChallenge.challengerCaptainId === currentUserId ||
      rivalChallenge.acceptedCaptainId === currentUserId ||
      rivalChallenge.challengedCaptainId === currentUserId)

  const canRescheduleAsOrganizer =
    isCreator &&
    !completed &&
    opportunity.status !== 'cancelled'

  const [finalizing, setFinalizing] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const [overridePick, setOverridePick] = useState<RivalResult | null>(null)
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false)
  const [revueltaPick, setRevueltaPick] = useState<RevueltaResult | null>(null)
  const [rivalOrganizerPick, setRivalOrganizerPick] = useState<RivalResult | null>(
    null
  )
  const [submitting, setSubmitting] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const [suspendExpanded, setSuspendExpanded] = useState(false)
  const [suspendChoice, setSuspendChoice] = useState<
    number | 'other' | null
  >(null)
  const [suspendOtherText, setSuspendOtherText] = useState('')
  const [leaveExpanded, setLeaveExpanded] = useState(false)
  const [leaveChoice, setLeaveChoice] = useState<number | 'other' | null>(null)
  const [leaveOtherText, setLeaveOtherText] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [rescheduleExpanded, setRescheduleExpanded] = useState(false)
  const [rescheduleVenue, setRescheduleVenue] = useState(opportunity.venue)
  const [rescheduleLocation, setRescheduleLocation] = useState(opportunity.location)
  const [rescheduleDateTimeLocal, setRescheduleDateTimeLocal] = useState(() => {
    const d = opportunity.dateTime
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  })
  const [rescheduleChoice, setRescheduleChoice] = useState<number | 'other' | null>(null)
  const [rescheduleOtherText, setRescheduleOtherText] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleSportsVenueId, setRescheduleSportsVenueId] = useState<string | null>(
    () => opportunity.sportsVenueId ?? null
  )

  const [venueStars, setVenueStars] = useState(0)
  const [matchStars, setMatchStars] = useState(0)
  const [levelStars, setLevelStars] = useState(0)
  const [mvpUserId, setMvpUserId] = useState('')
  const [comment, setComment] = useState('')
  const [disputeText, setDisputeText] = useState('')
  const [proposalResponding, setProposalResponding] = useState(false)

  useEffect(() => {
    setRescheduleVenue(opportunity.venue)
    setRescheduleLocation(opportunity.location)
    setRescheduleSportsVenueId(opportunity.sportsVenueId ?? null)
    const d = opportunity.dateTime
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    setRescheduleDateTimeLocal(local.toISOString().slice(0, 16))
  }, [
    opportunity.id,
    opportunity.venue,
    opportunity.location,
    opportunity.dateTime,
    opportunity.sportsVenueId,
  ])

  const rescheduleVenuesQuery = useQuery({
    queryKey: [
      'match-completion-reschedule-venues',
      opportunity.cityId,
      opportunity.cityRegionId ?? currentUser?.regionId ?? '',
    ],
    enabled: Boolean(
      canRescheduleAsOrganizer &&
        rescheduleExpanded &&
        opportunity.cityId &&
        isSupabaseConfigured() &&
        sessionQueryEnabled(currentUserId)
    ),
    staleTime: QUERY_STALE_TIME_STATIC_MS,
    queryFn: async () => {
      const sb = getBrowserSupabase()
      if (!sb) return [] as SportsVenue[]
      return fetchSportsVenuesForPlayerGeo(
        sb,
        opportunity.cityRegionId ?? currentUser?.regionId,
        opportunity.cityId
      )
    },
  })

  const rescheduleSportsVenuesList = rescheduleVenuesQuery.data ?? []

  const rescheduleVenueSelectValue = useMemo(() => {
    if (rescheduleSportsVenueId) {
      return `${RESCHEDULE_CANCHA_DB_PREFIX}${rescheduleSportsVenueId}`
    }
    const byName = rescheduleSportsVenuesList.find(
      (v) => v.name.trim() === rescheduleVenue.trim()
    )
    if (byName) return `${RESCHEDULE_CANCHA_DB_PREFIX}${byName.id}`
    return RESCHEDULE_CANCHA_CUSTOM
  }, [rescheduleSportsVenueId, rescheduleVenue, rescheduleSportsVenuesList])

  const resolvedSuspendReason = (): string | null => {
    if (suspendChoice === null) return null
    if (typeof suspendChoice === 'number') {
      return SUSPEND_PRESET_REASONS[suspendChoice] ?? null
    }
    const t = suspendOtherText.trim()
    if (t.length < 5) return null
    return `Otro: ${t}`
  }

  const handleSuspend = async () => {
    const reason = resolvedSuspendReason()
    if (!reason) return
    setSuspending(true)
    try {
      await suspendMatchOpportunity(opportunity.id, reason)
      setSuspendExpanded(false)
      setSuspendChoice(null)
      setSuspendOtherText('')
    } finally {
      setSuspending(false)
    }
  }

  const canConfirmSuspend =
    resolvedSuspendReason() !== null && !suspending

  const resolvedLeaveReason = (): string | null => {
    if (leaveChoice === null) return null
    if (typeof leaveChoice === 'number') {
      return LEAVE_PRESET_REASONS[leaveChoice] ?? null
    }
    const t = leaveOtherText.trim()
    if (t.length < 5) return null
    return `Otro: ${t}`
  }

  const canLeaveAsParticipant =
    !hideParticipantLeave &&
    !isCreator &&
    isConfirmedParticipant &&
    !completed &&
    opportunity.status !== 'cancelled' &&
    (opportunity.type === 'players' ||
      opportunity.type === 'open' ||
      opportunity.type === 'team_pick_public' ||
      opportunity.type === 'team_pick_private' ||
      opportunity.type === 'rival')

  const handleLeave = async () => {
    const reason = resolvedLeaveReason()
    if (!reason) return
    setLeaving(true)
    try {
      const ok = await leaveMatchOpportunityWithReason(opportunity.id, reason)
      if (ok) {
        setLeaveExpanded(false)
        setLeaveChoice(null)
        setLeaveOtherText('')
      }
    } finally {
      setLeaving(false)
    }
  }

  const canConfirmLeave = resolvedLeaveReason() !== null && !leaving

  const resolvedRescheduleReason = (): string | null => {
    if (rescheduleChoice === null) return null
    if (typeof rescheduleChoice === 'number') {
      return RESCHEDULE_PRESET_REASONS[rescheduleChoice] ?? null
    }
    const t = rescheduleOtherText.trim()
    if (t.length < 5) return null
    return `Otro: ${t}`
  }

  const parseLocalDateTime = (v: string): Date | null => {
    if (!v.trim()) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const canConfirmReschedule = (() => {
    const dt = parseLocalDateTime(rescheduleDateTimeLocal)
    const locOk =
      !!rescheduleSportsVenueId ||
      (rescheduleVenue.trim().length >= 3 &&
        rescheduleLocation.trim().length >= 3)
    return (
      !rescheduling && locOk && !!dt && resolvedRescheduleReason() !== null
    )
  })()

  const handleReschedule = async () => {
    const dt = parseLocalDateTime(rescheduleDateTimeLocal)
    const reason = resolvedRescheduleReason()
    if (!dt || !reason) return
    setRescheduling(true)
    try {
      await rescheduleMatchOpportunityWithReason({
        opportunityId: opportunity.id,
        venue: rescheduleVenue,
        location: rescheduleLocation,
        dateTime: dt,
        reason,
        sportsVenueId: rescheduleSportsVenueId,
      })
      setRescheduleExpanded(false)
      setRescheduleChoice(null)
      setRescheduleOtherText('')
    } finally {
      setRescheduling(false)
    }
  }

  const outcomeLine = () => {
    if (!completed || !finalizedAt) return null
    if (opportunity.type === 'rival' && opportunity.rivalResult) {
      const map: Record<RivalResult, string> = {
        creator_team: 'Ganó el equipo del organizador',
        rival_team: 'Ganó el equipo rival',
        draw: 'Empate',
      }
      return (
        <div className="space-y-1">
          <p className="font-brand-heading flex items-center gap-2 text-sm text-muted-foreground">
            <Trophy className="w-4 h-4 text-accent" />
            {map[opportunity.rivalResult]}
          </p>
          {opportunity.rivalClosureSkipPlayerStats ? (
            <p className="text-xs text-muted-foreground pl-6">
              Cierre sin sumar estadísticas de jugadores ni equipos (decisión de
              moderación).
            </p>
          ) : null}
        </div>
      )
    }
    if (
      (opportunity.type === 'open' ||
        opportunity.type === 'team_pick_public' ||
        opportunity.type === 'team_pick_private') &&
      opportunity.revueltaResult
    ) {
      const map: Record<RevueltaResult, string> = {
        team_a: 'Ganó equipo A',
        team_b: 'Ganó equipo B',
        draw: 'Empate',
      }
      return (
        <p className="font-brand-heading flex items-center gap-2 text-sm text-muted-foreground">
          <Trophy className="w-4 h-4 text-accent" />
          {map[opportunity.revueltaResult]}
        </p>
      )
    }
    if (opportunity.casualCompleted) {
      return (
        <p className="font-brand-heading flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheck className="w-4 h-4 text-primary" />
          Partido jugado (sin marcador de equipos)
        </p>
      )
    }
    return null
  }

  const openFinalizeDialog = () => {
    setRevueltaPick(null)
    setRivalOrganizerPick(null)
    setFinalizeDialogOpen(true)
  }

  const handleFinalizeCasualOrRevuelta = async (): Promise<boolean> => {
    if (
      opportunity.type === 'open' ||
      opportunity.type === 'team_pick_public' ||
      opportunity.type === 'team_pick_private'
    ) {
      if (!revueltaPick) return false
      setFinalizing(true)
      try {
        return await finalizeMatchOpportunity(opportunity.id, {
          kind: 'revuelta',
          revueltaResult: revueltaPick,
        })
      } finally {
        setFinalizing(false)
      }
    }
    if (opportunity.type === 'rival') {
      if (!rivalOrganizerPick) return false
      setFinalizing(true)
      try {
        return await finalizeMatchOpportunity(opportunity.id, {
          kind: 'rival',
          rivalResult: rivalOrganizerPick,
        })
      } finally {
        setFinalizing(false)
      }
    }
    setFinalizing(true)
    try {
      return await finalizeMatchOpportunity(opportunity.id, { kind: 'casual' })
    } finally {
      setFinalizing(false)
    }
  }

  const confirmFinalizeFromDialog = async () => {
    const ok = await handleFinalizeCasualOrRevuelta()
    if (ok) setFinalizeDialogOpen(false)
  }

  const handleOverride = async () => {
    if (!overridePick) return
    setOverriding(true)
    try {
      await finalizeRivalOrganizerOverride(opportunity.id, overridePick)
      setOverridePick(null)
    } finally {
      setOverriding(false)
    }
  }

  const handleSubmitRating = async () => {
    if (!venueStars || !matchStars || !levelStars || !mvpUserId) return
    setSubmitting(true)
    try {
      await submitMatchRating(opportunity.id, {
        venueRating: venueStars,
        matchRating: matchStars,
        levelRating: levelStars,
        mvpUserId,
        comment: comment.trim() || undefined,
      })
      onReloadMyRating()
      setComment('')
      setMvpUserId('')
      setVenueStars(0)
      setMatchStars(0)
      setLevelStars(0)
    } finally {
      setSubmitting(false)
    }
  }

  const hasPreMatchContent =
    needsResolveAfterMidnight ||
    showOrganizerFinalizeCasual ||
    showCaptainProposalResponse ||
    showRivalDisputeModeration ||
    showOrganizerAwaitingCaptain ||
    showOrganizerOverride ||
    showOrganizerDisputeWait ||
    canCancelRivalAsCaptain ||
    canRescheduleAsOrganizer ||
    canLeaveAsParticipant

  if (!completed && !hasPreMatchContent) return null

  return (
    <div className="border-b border-border bg-secondary/40 px-4 py-3 space-y-4">
      {needsResolveAfterMidnight && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
          <p className="font-brand-heading text-sm text-foreground">
            Este partido ya pasó
          </p>
          <p className="text-xs text-muted-foreground">
            Para que no aparezca como disponible, confirma si se jugó o suspéndelo
            con un motivo.
          </p>
        </div>
      )}

      {showOrganizerAwaitingCaptain && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-1">
          <p className="font-brand-heading text-sm text-foreground">
            Propuesta de resultado enviada
          </p>
          <p className="text-xs text-muted-foreground">
            El capitán rival debe confirmar o discrepar. Cuando responda, el partido
            se cerrará automáticamente o pasará a moderación si hay discrepancia.
          </p>
        </div>
      )}

      {showCaptainProposalResponse && rivalChallenge && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
          <p className="font-brand-heading text-sm text-foreground">
            Confirmar resultado del organizador
          </p>
          <p className="text-xs text-muted-foreground">
            El organizador registró:{' '}
            <span className="font-brand-heading text-foreground">
              {opportunity.rivalOrganizerProposedResult === 'draw'
                ? 'Empate'
                : opportunity.rivalOrganizerProposedResult === 'creator_team'
                  ? `Ganó ${rivalChallenge.challengerTeamName}`
                  : `Ganó ${rivalChallenge.acceptedTeamName ?? 'equipo aceptado'}`}
            </span>
            . Si no estás de acuerdo, indica el motivo: se abrirá un reporte para el
            equipo de moderación.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="flex-1"
              disabled={proposalResponding}
              onClick={() => {
                void (async () => {
                  setProposalResponding(true)
                  try {
                    await respondRivalMatchProposal(opportunity.id, true)
                  } finally {
                    setProposalResponding(false)
                  }
                })()
              }}
            >
              {proposalResponding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando…
                </>
              ) : (
                'Confirmar resultado'
              )}
            </Button>
          </div>
          <div className="space-y-2 pt-1 border-t border-border/60">
            <Label className="text-xs">Discrepar (motivo, mín. 5 caracteres)</Label>
            <Textarea
              value={disputeText}
              onChange={(e) => setDisputeText(e.target.value)}
              placeholder="Explica por qué no coincides con el resultado propuesto…"
              className="min-h-[80px] resize-none text-sm"
              disabled={proposalResponding}
            />
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={proposalResponding || disputeText.trim().length < 5}
              onClick={() => {
                void (async () => {
                  setProposalResponding(true)
                  try {
                    await respondRivalMatchProposal(
                      opportunity.id,
                      false,
                      disputeText.trim()
                    )
                  } finally {
                    setProposalResponding(false)
                  }
                })()
              }}
            >
              Discrepar y enviar a moderación
            </Button>
          </div>
        </div>
      )}

      {showRivalDisputeModeration && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 space-y-1">
          <p className="font-brand-heading text-sm text-foreground">
            Resultado en revisión
          </p>
          <p className="text-xs text-muted-foreground">
            Un administrador definirá el resultado final. El partido permanece abierto
            hasta entonces.
          </p>
        </div>
      )}

      {showOrganizerDisputeWait && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 space-y-1">
          <p className="font-brand-heading text-sm text-foreground">
            Los capitanes no coinciden
          </p>
          <p className="text-xs text-muted-foreground">
            Podrás definir el resultado el{' '}
            {formatDistanceToNow(deadline72h, { locale: es, addSuffix: true })} desde
            la hora del partido (72 h).
          </p>
        </div>
      )}

      {showOrganizerOverride && (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="font-brand-heading text-sm text-foreground">
            Desempate como organizador
          </p>
          <p className="text-xs text-muted-foreground">
            Pasaron 72 h desde la hora del partido. Elige el resultado final.
          </p>
          <div className="flex flex-col gap-2">
            {(
              [
                ['creator_team', 'Ganó el equipo del organizador'],
                ['rival_team', 'Ganó el equipo rival'],
                ['draw', 'Empate'],
              ] as const
            ).map(([val, label]) => (
              <label
                key={val}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                  overridePick === val
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card'
                }`}
              >
                <input
                  type="radio"
                  name="override-rival"
                  className="accent-primary"
                  checked={overridePick === val}
                  onChange={() => setOverridePick(val)}
                />
                {label}
              </label>
            ))}
          </div>
          <Button
            className="w-full"
            disabled={overriding || !overridePick}
            onClick={() => void handleOverride()}
          >
            {overriding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando…
              </>
            ) : (
              'Confirmar resultado final'
            )}
          </Button>
        </div>
      )}

      {showOrganizerFinalizeCasual && (
        <div className="space-y-3">
          <p className="font-brand-heading text-sm text-foreground">
            {needsResolveAfterMidnight ? 'Resolver partido' : 'Finalizar partido'}
          </p>
          <p className="text-xs text-muted-foreground">
            {opportunity.type === 'rival'
              ? 'Registrarás el resultado propuesto; el capitán rival deberá confirmarlo o podrá discrepar (moderación).'
              : 'Al cerrar, se registrará el resultado. Cada participante podrá dejar su reseña cuando entre al detalle del partido (sin plazo de caducidad).'}
          </p>
          {rivalOrganizerFinalizeBlocked ? (
            <p className="text-xs text-amber-800 dark:text-amber-200/90">
              Esperando respuesta del capitán rival sobre tu última propuesta de
              resultado.
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full"
            disabled={finalizing || rivalOrganizerFinalizeBlocked}
            onClick={openFinalizeDialog}
          >
            Marcar partido como finalizado
          </Button>

          <Dialog
            open={finalizeDialogOpen}
            onOpenChange={(open) => {
              setFinalizeDialogOpen(open)
              if (!open) {
                setRevueltaPick(null)
                setRivalOrganizerPick(null)
              }
            }}
          >
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {opportunity.type === 'open'
                    ? 'Resultado de la revuelta'
                    : opportunity.type === 'team_pick_public' ||
                        opportunity.type === 'team_pick_private'
                      ? 'Resultado selección de equipos'
                    : opportunity.type === 'rival'
                      ? 'Resultado equipo vs equipo'
                      : 'Confirmar cierre'}
                </DialogTitle>
                <DialogDescription>
                  Los participantes podrán dejar su reseña desde el detalle del
                  partido cuando les acomode (una sola vez cada uno).
                  {opportunity.type === 'players'
                    ? ' Se registrará como partido jugado (sin marcador por equipos).'
                    : null}
                  {opportunity.type === 'rival'
                    ? ' El partido no se cerrará hasta que el capitán rival confirme tu propuesta (o se resuelva en moderación si discrepa).'
                    : null}
                </DialogDescription>
              </DialogHeader>

              {(opportunity.type === 'open' ||
                opportunity.type === 'team_pick_public' ||
                opportunity.type === 'team_pick_private') && (
                <div className="space-y-2 py-1">
                  <Label className="text-xs text-muted-foreground">
                    ¿Quién ganó?
                  </Label>
                  <div className="flex flex-col gap-2">
                    {(
                      [
                        ['team_a', 'Ganó equipo A'],
                        ['team_b', 'Ganó equipo B'],
                        ['draw', 'Empate'],
                      ] as const
                    ).map(([val, label]) => (
                      <label
                        key={val}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                          revueltaPick === val
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card'
                        }`}
                      >
                        <input
                          type="radio"
                          name="revuelta-result-modal"
                          className="accent-primary"
                          checked={revueltaPick === val}
                          onChange={() => setRevueltaPick(val)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {opportunity.type === 'rival' && rivalChallenge && (
                <div className="space-y-2 py-1">
                  <Label className="text-xs text-muted-foreground">
                    ¿Quién ganó?
                  </Label>
                  <div className="flex flex-col gap-2">
                    {(
                      [
                        [
                          'creator_team',
                          `Ganó ${rivalChallenge.challengerTeamName}`,
                        ] as const,
                        [
                          'rival_team',
                          `Ganó ${rivalChallenge.acceptedTeamName ?? 'Equipo rival'}`,
                        ] as const,
                        ['draw', 'Empate'] as const,
                      ] as const
                    ).map(([val, label]) => (
                      <label
                        key={val}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                          rivalOrganizerPick === val
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card'
                        }`}
                      >
                        <input
                          type="radio"
                          name="rival-organizer-result-modal"
                          className="accent-primary"
                          checked={rivalOrganizerPick === val}
                          onChange={() => setRivalOrganizerPick(val)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={finalizing}
                  onClick={() => setFinalizeDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={
                    finalizing ||
                    ((opportunity.type === 'open' ||
                      opportunity.type === 'team_pick_public' ||
                      opportunity.type === 'team_pick_private') &&
                      !revueltaPick) ||
                    (opportunity.type === 'rival' && !rivalOrganizerPick)
                  }
                  onClick={() => void confirmFinalizeFromDialog()}
                >
                  {finalizing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    'Finalizar y guardar'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="pt-2 border-t border-border space-y-2">
            <p className="font-brand-heading text-sm text-foreground">Suspender partido</p>
            <p className="text-xs text-muted-foreground">
              Si no se jugará, elige un motivo y confirma la suspensión.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="w-full justify-between h-11"
              disabled={suspending}
              onClick={() => {
                setSuspendExpanded((v) => !v)
                if (suspendExpanded) {
                  setSuspendChoice(null)
                  setSuspendOtherText('')
                }
              }}
            >
              <span>Suspender partido</span>
              {suspendExpanded ? (
                <ChevronUp className="w-4 h-4 shrink-0 opacity-90" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 opacity-90" />
              )}
            </Button>

            {suspendExpanded && (
              <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
                <p className="font-brand-heading text-xs text-foreground">
                  Motivo de la suspensión
                </p>
                <div className="flex flex-col gap-2">
                  {SUSPEND_PRESET_REASONS.map((label, i) => (
                    <label
                      key={label}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                        suspendChoice === i
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="suspend-reason"
                        className="accent-primary shrink-0"
                        checked={suspendChoice === i}
                        onChange={() => {
                          setSuspendChoice(i)
                          setSuspendOtherText('')
                        }}
                        disabled={suspending}
                      />
                      <span className="text-left leading-snug">{label}</span>
                    </label>
                  ))}
                  <label
                    className={`flex flex-col gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                      suspendChoice === 'other'
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="suspend-reason"
                        className="accent-primary shrink-0"
                        checked={suspendChoice === 'other'}
                        onChange={() => setSuspendChoice('other')}
                        disabled={suspending}
                      />
                      <span className="font-brand-heading">Otro</span>
                    </div>
                    {suspendChoice === 'other' && (
                      <Textarea
                        value={suspendOtherText}
                        onChange={(e) => setSuspendOtherText(e.target.value)}
                        placeholder="Describe el motivo…"
                        className="bg-background border-border min-h-[72px] resize-none text-sm ml-6"
                        maxLength={1000}
                        disabled={suspending}
                      />
                    )}
                  </label>
                </div>
                {suspendChoice === 'other' && (
                  <p className="text-[11px] text-muted-foreground">
                    Mínimo 5 caracteres.
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={suspending}
                    onClick={() => {
                      setSuspendExpanded(false)
                      setSuspendChoice(null)
                      setSuspendOtherText('')
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10 sm:min-w-[180px]"
                    disabled={!canConfirmSuspend}
                    onClick={() => void handleSuspend()}
                  >
                    {suspending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Suspendiendo…
                      </>
                    ) : (
                      'Confirmar suspensión'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {canRescheduleAsOrganizer && (
        <div
          id="organizer-reschedule-section"
          className="space-y-2 rounded-xl border border-border bg-card/40 p-3"
        >
          <p className="font-brand-heading text-sm text-foreground">Reprogramar partido</p>
          <p className="text-xs text-muted-foreground">
            Si cambias centro o fecha/hora, quienes estaban confirmados vuelven a
            pendiente para reconfirmar. Al guardar se elimina la reserva de cancha
            vinculada en la app (si había); el bloque para confirmar cancha solo
            vuelve cuando el partido tenga otra reserva activa. Si el nombre del
            centro y la ubicación no cambian, se mantiene el enlace a la ficha y
            el WhatsApp del centro.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={rescheduling}
            onClick={() => {
              setRescheduleExpanded((v) => !v)
              if (rescheduleExpanded) {
                setRescheduleChoice(null)
                setRescheduleOtherText('')
              }
            }}
          >
            <span>Editar centro, fecha y hora</span>
            {rescheduleExpanded ? (
              <ChevronUp className="w-4 h-4 shrink-0 opacity-90" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 opacity-90" />
            )}
          </Button>
          {rescheduleExpanded && (
            <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Centro deportivo (listado)
                </Label>
                {rescheduleVenuesQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Cargando centros…</p>
                ) : rescheduleSportsVenuesList.length === 0 ? (
                  <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border px-2 py-2">
                    No hay centros en el catálogo para la ciudad de este partido. Usa
                    nombre y comuna manual abajo.
                  </p>
                ) : (
                  <Select
                    value={rescheduleVenueSelectValue}
                    onValueChange={(v) => {
                      if (v === RESCHEDULE_CANCHA_CUSTOM) {
                        setRescheduleSportsVenueId(null)
                        return
                      }
                      if (!v.startsWith(RESCHEDULE_CANCHA_DB_PREFIX)) return
                      const id = v.slice(RESCHEDULE_CANCHA_DB_PREFIX.length)
                      const sv = rescheduleSportsVenuesList.find((x) => x.id === id)
                      if (!sv) return
                      setRescheduleSportsVenueId(id)
                      setRescheduleVenue(sv.name)
                      setRescheduleLocation(sv.city)
                    }}
                    disabled={rescheduling}
                  >
                    <SelectTrigger className="w-full h-10 bg-background border-border text-sm">
                      <SelectValue placeholder="Elige un centro" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(22rem,var(--radix-select-content-available-height))]">
                      <SelectItem value={RESCHEDULE_CANCHA_CUSTOM}>
                        Otro (nombre y comuna manual)
                      </SelectItem>
                      {rescheduleSportsVenuesList.map((sv) => (
                        <SelectItem
                          key={sv.id}
                          value={`${RESCHEDULE_CANCHA_DB_PREFIX}${sv.id}`}
                        >
                          {sv.name} — {sv.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Si eliges del listado, al guardar se vincula la ficha del centro
                  (teléfono y WhatsApp del club). Si editas el texto sin coincidir con
                  el listado, se pierde ese enlace.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Centro deportivo (texto)
                </Label>
                <input
                  value={rescheduleVenue}
                  onChange={(e) => {
                    const v = e.target.value
                    setRescheduleVenue(v)
                    const linked = rescheduleSportsVenueId
                      ? rescheduleSportsVenuesList.find(
                          (x) => x.id === rescheduleSportsVenueId
                        )
                      : null
                    if (linked && v.trim() !== linked.name.trim()) {
                      setRescheduleSportsVenueId(null)
                    }
                  }}
                  className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                  placeholder="Nombre del centro"
                  disabled={rescheduling}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Ubicación / comuna</Label>
                <input
                  value={rescheduleLocation}
                  onChange={(e) => {
                    const v = e.target.value
                    setRescheduleLocation(v)
                    const linked = rescheduleSportsVenueId
                      ? rescheduleSportsVenuesList.find(
                          (x) => x.id === rescheduleSportsVenueId
                        )
                      : null
                    if (linked && v.trim() !== linked.city.trim()) {
                      setRescheduleSportsVenueId(null)
                    }
                  }}
                  className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                  placeholder="Dirección o comuna"
                  disabled={rescheduling}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fecha y hora</Label>
                <input
                  type="datetime-local"
                  value={rescheduleDateTimeLocal}
                  onChange={(e) => setRescheduleDateTimeLocal(e.target.value)}
                  className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                  disabled={rescheduling}
                />
              </div>
              <div className="space-y-2">
                <p className="font-brand-heading text-xs text-foreground">
                  Motivo del cambio
                </p>
                {RESCHEDULE_PRESET_REASONS.map((label, i) => (
                  <label
                    key={label}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                      rescheduleChoice === i
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reschedule-reason"
                      className="accent-primary shrink-0"
                      checked={rescheduleChoice === i}
                      onChange={() => {
                        setRescheduleChoice(i)
                        setRescheduleOtherText('')
                      }}
                      disabled={rescheduling}
                    />
                    <span className="text-left leading-snug">{label}</span>
                  </label>
                ))}
                <label
                  className={`flex flex-col gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                    rescheduleChoice === 'other'
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="reschedule-reason"
                      className="accent-primary shrink-0"
                      checked={rescheduleChoice === 'other'}
                      onChange={() => setRescheduleChoice('other')}
                      disabled={rescheduling}
                    />
                    <span className="font-brand-heading">Otro</span>
                  </div>
                  {rescheduleChoice === 'other' && (
                    <Textarea
                      value={rescheduleOtherText}
                      onChange={(e) => setRescheduleOtherText(e.target.value)}
                      placeholder="Describe el motivo…"
                      className="bg-background border-border min-h-[72px] resize-none text-sm ml-6"
                      maxLength={1000}
                      disabled={rescheduling}
                    />
                  )}
                </label>
                {rescheduleChoice === 'other' && (
                  <p className="text-[11px] text-muted-foreground">
                    Mínimo 5 caracteres.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={rescheduling}
                  onClick={() => {
                    setRescheduleExpanded(false)
                    setRescheduleChoice(null)
                    setRescheduleOtherText('')
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="sm:min-w-[180px]"
                  disabled={!canConfirmReschedule}
                  onClick={() => void handleReschedule()}
                >
                  {rescheduling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    'Guardar reprogramación'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {canCancelRivalAsCaptain && !showOrganizerFinalizeCasual && (
        <div className="space-y-2">
          <p className="font-brand-heading text-sm text-foreground">Cancelar partido rival</p>
          <p className="text-xs text-muted-foreground">
            Puede cancelar cualquiera de los dos capitanes, con al menos 24 horas de anticipación.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="w-full justify-between h-11"
            disabled={suspending}
            onClick={() => {
              setSuspendExpanded((v) => !v)
              if (suspendExpanded) {
                setSuspendChoice(null)
                setSuspendOtherText('')
              }
            }}
          >
              <span>Cancelar partido</span>
            {suspendExpanded ? (
              <ChevronUp className="w-4 h-4 shrink-0 opacity-90" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 opacity-90" />
            )}
          </Button>
          {suspendExpanded && (
            <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
                <p className="font-brand-heading text-xs text-foreground">Motivo de la cancelación</p>
              <div className="flex flex-col gap-2">
                {SUSPEND_PRESET_REASONS.map((label, i) => (
                  <label
                    key={label}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                      suspendChoice === i
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="suspend-reason-rival"
                      className="accent-primary shrink-0"
                      checked={suspendChoice === i}
                      onChange={() => {
                        setSuspendChoice(i)
                        setSuspendOtherText('')
                      }}
                      disabled={suspending}
                    />
                    <span className="text-left leading-snug">{label}</span>
                  </label>
                ))}
                <label
                  className={`flex flex-col gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                    suspendChoice === 'other'
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="suspend-reason-rival"
                      className="accent-primary shrink-0"
                      checked={suspendChoice === 'other'}
                      onChange={() => setSuspendChoice('other')}
                      disabled={suspending}
                    />
                    <span className="font-brand-heading">Otro</span>
                  </div>
                  {suspendChoice === 'other' && (
                    <Textarea
                      value={suspendOtherText}
                      onChange={(e) => setSuspendOtherText(e.target.value)}
                        placeholder="Describe el motivo de cancelación…"
                      className="bg-background border-border min-h-[72px] resize-none text-sm ml-6"
                      maxLength={1000}
                      disabled={suspending}
                    />
                  )}
                </label>
              </div>
              {suspendChoice === 'other' && (
                <p className="text-[11px] text-muted-foreground">
                  Mínimo 5 caracteres.
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={suspending}
                  onClick={() => {
                    setSuspendExpanded(false)
                    setSuspendChoice(null)
                    setSuspendOtherText('')
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10 sm:min-w-[180px]"
                  disabled={!canConfirmSuspend}
                  onClick={() => void handleSuspend()}
                >
                  {suspending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Suspendiendo…
                    </>
                  ) : (
                      'Confirmar cancelación'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {canLeaveAsParticipant && (
        <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
          <p className="font-brand-heading text-sm text-foreground">Salir del partido</p>
          <p className="text-xs text-muted-foreground">
            Puedes salirte hasta 2 horas antes. Elige un motivo (o «Otro» con
            detalle).
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={leaving}
            onClick={() => {
              setLeaveExpanded((v) => {
                const next = !v
                if (v) {
                  setLeaveChoice(null)
                  setLeaveOtherText('')
                }
                return next
              })
            }}
          >
            <span>Elegir motivo y salir</span>
            {leaveExpanded ? (
              <ChevronUp className="w-4 h-4 shrink-0 opacity-90" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 opacity-90" />
            )}
          </Button>
          {leaveExpanded && (
            <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
              <p className="font-brand-heading text-xs text-foreground">
                Motivo de tu salida
              </p>
              <div className="flex flex-col gap-2">
                {LEAVE_PRESET_REASONS.map((label, i) => (
                  <label
                    key={label}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                      leaveChoice === i
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="leave-reason"
                      className="accent-primary shrink-0"
                      checked={leaveChoice === i}
                      onChange={() => {
                        setLeaveChoice(i)
                        setLeaveOtherText('')
                      }}
                      disabled={leaving}
                    />
                    <span className="text-left leading-snug">{label}</span>
                  </label>
                ))}
                <label
                  className={`flex flex-col gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                    leaveChoice === 'other'
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="leave-reason"
                      className="accent-primary shrink-0"
                      checked={leaveChoice === 'other'}
                      onChange={() => setLeaveChoice('other')}
                      disabled={leaving}
                    />
                    <span className="font-brand-heading">Otro</span>
                  </div>
                  {leaveChoice === 'other' && (
                    <Textarea
                      value={leaveOtherText}
                      onChange={(e) => setLeaveOtherText(e.target.value)}
                      placeholder="Describe el motivo…"
                      className="bg-background border-border min-h-[72px] resize-none text-sm ml-6"
                      maxLength={1000}
                      disabled={leaving}
                    />
                  )}
                </label>
              </div>
              {leaveChoice === 'other' && (
                <p className="text-[11px] text-muted-foreground">
                  Mínimo 5 caracteres.
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={leaving}
                  onClick={() => {
                    setLeaveExpanded(false)
                    setLeaveChoice(null)
                    setLeaveOtherText('')
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10 sm:min-w-[180px]"
                  disabled={!canConfirmLeave}
                  onClick={() => void handleLeave()}
                >
                  {leaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saliendo…
                    </>
                  ) : (
                    'Confirmar salida'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {completed && (
        <div className="space-y-2">
          <p className="font-brand-heading text-xs text-primary uppercase tracking-wide">
            Partido finalizado
          </p>
          {outcomeLine()}
        </div>
      )}

      {loadingRating && (
        <p className="text-xs text-muted-foreground">Cargando tu reseña…</p>
      )}

      {myRating && (
        <p className="text-sm text-primary">
          Ya enviaste tu reseña para este partido. ¡Gracias!
        </p>
      )}

      {canRate && (
        <div className="space-y-4 pt-1">
          <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 space-y-1">
            <p className="font-brand-heading text-sm text-foreground">
              Falta tu reseña
            </p>
            <p className="text-xs text-muted-foreground leading-snug">
              Valora el recinto, el ambiente, el nivel y elige al MVP. Puedes
              enviarla cuando quieras; no caduca.
            </p>
          </div>
          <p className="font-brand-heading text-sm text-foreground">
            Tu reseña (una sola vez)
          </p>
          <StarRow
            label="Recinto deportivo"
            value={venueStars}
            onChange={setVenueStars}
            disabled={submitting}
          />
          <StarRow
            label="Ambiente del partido"
            value={matchStars}
            onChange={setMatchStars}
            disabled={submitting}
          />
          <StarRow
            label="Nivel del partido"
            value={levelStars}
            onChange={setLevelStars}
            disabled={submitting}
          />
          <div className="space-y-2">
            <Label className="font-brand-heading text-sm text-foreground">
              MVP del partido
            </Label>
            {reviewEligibleParticipants.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Cargando participantes…
              </p>
            ) : (
              <Select
                value={mvpUserId || undefined}
                onValueChange={setMvpUserId}
                disabled={submitting}
              >
                <SelectTrigger className="w-full h-10 bg-card border-border text-sm">
                  <SelectValue placeholder="Elige al mejor jugador" />
                </SelectTrigger>
                <SelectContent>
                  {reviewEligibleParticipants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.id === currentUserId ? ' (tú)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Comentario (opcional)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Breve opinión sobre el partido…"
              className="bg-card border-border min-h-[72px] resize-none text-sm"
              disabled={submitting}
              maxLength={2000}
            />
          </div>
          <Button
            className="w-full"
            disabled={
              submitting ||
              !venueStars ||
              !matchStars ||
              !levelStars ||
              !mvpUserId
            }
            onClick={() => void handleSubmitRating()}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando…
              </>
            ) : (
              'Enviar reseña'
            )}
          </Button>
        </div>
      )}

    </div>
  )
}
