'use client'

import { memo, useCallback, useMemo, useState, type ReactNode } from 'react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Input } from '@/components/ui/input'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import {
  fetchParticipantsForOpportunity,
  fetchMatchOpportunityParticipantLeaveReasons,
  participantsVisibleForMatchUi,
  type OpportunityParticipantRow,
} from '@/lib/supabase/message-queries'
import {
  type RatingSummary,
  type MatchOpportunityRatingRow,
} from '@/lib/supabase/rating-queries'
import { fetchMatchDetailRatingsBlock } from '@/lib/services/match-detail.service'
import { MatchCompletionPanel } from '@/components/match-completion-panel'
import { JoinRevueltaDialog } from '@/components/join-revuelta-dialog'
import { JoinPlayersSearchDialog } from '@/components/join-players-search-dialog'
import { JoinTeamPickDialog } from '@/components/join-team-pick-dialog'
import { TeamPickLineupEditDialog } from '@/components/team-pick-lineup-edit-dialog'
import { RevueltaInviteActions } from '@/components/revuelta-invite-actions'
import { RevueltaTeamsPanel } from '@/components/revuelta-teams-panel'
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  MoreHorizontal,
  Search,
  UserPlus,
  Users,
  MessageCircle,
  Shield,
  TicketCheck,
} from 'lucide-react'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import type { EncounterLineupRole, MatchType, PickTeamSide } from '@/lib/types'
import {
  canEditTeamPickLineupBeforeDeadline,
  TEAM_PICK_MAX_FIELD_PER_SIDE,
  TEAM_PICK_MAX_GK_PER_SIDE,
  teamPickColorsForUi,
  encounterLineupRoleLabel,
  teamPickJerseyPresetLabel,
  teamPickSideIsFull,
  teamPickSlotsFromParticipants,
} from '@/lib/team-pick-ui'
import { playersSeekProfileLabel } from '@/lib/players-seek-profile'
import { MatchCourtPricingBlock } from '@/components/match-court-pricing'
import { TeamPickShieldShape } from '@/components/team-pick-jersey-color-picker'
import { whatsappWaMeBaseHref } from '@/lib/player-whatsapp'
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
import { sessionQueryEnabled } from '@/lib/query-session-enabled'
import { QUERY_STALE_TIME_STATIC_MS } from '@/lib/query-defaults'
import { replaceParticipantsCacheFromServer } from '@/lib/realtime/match-opportunity-participants-realtime'
import { cn } from '@/lib/utils'
import { useMatchOpportunityParticipantsRealtime } from '@/lib/hooks/use-match-opportunity-participants-realtime'

type InviteCandidate = {
  id: string
  name: string
  photo: string
  position: string
  level: string
}
type InviteRoleFilter = 'all' | 'gk' | 'field'

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
    joinTeamPickMatchOpportunity,
    setTeamPickParticipantLineup,
    organizerRemoveTeamPickParticipant,
    randomizeRevueltaTeams,
    finalizeMatchOpportunity,
    suspendMatchOpportunity,
    leaveMatchOpportunityWithReason,
    rescheduleMatchOpportunityWithReason,
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
    enabled: Boolean(
      selectedMatchOpportunityId && sessionQueryEnabled(currentUser?.id)
    ),
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

  const canViewParticipantLeaveReasons = Boolean(
    opportunity &&
      currentUser &&
      (opportunity.creatorId === currentUser.id ||
        currentUser.accountType === 'admin')
  )

  const participantLeaveReasonsQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.participantLeaveReasons(
      selectedMatchOpportunityId
    ),
    enabled: Boolean(
      selectedMatchOpportunityId &&
        canViewParticipantLeaveReasons &&
        sessionQueryEnabled(currentUser?.id)
    ),
    queryFn: async () => {
      if (!selectedMatchOpportunityId) return new Map()
      const sb = getBrowserSupabase()
      if (!sb) return new Map()
      return fetchMatchOpportunityParticipantLeaveReasons(
        sb,
        selectedMatchOpportunityId
      )
    },
  })

  const participantsForList = useMemo(() => {
    const reasons = participantLeaveReasonsQuery.data
    if (!reasons || reasons.size === 0) return participants
    return participants.map((p) => {
      if (p.status !== 'cancelled') return { ...p, cancelledReason: null }
      const r = reasons.get(p.id)
      const merged =
        r?.cancelledReason?.trim() || p.cancelledReason?.trim() || null
      return { ...p, cancelledReason: merged }
    })
  }, [participants, participantLeaveReasonsQuery.data])

  const participantsShownToViewer = useMemo(
    () =>
      participantsVisibleForMatchUi(participantsForList, {
        viewerMaySeeCancelled: canViewParticipantLeaveReasons,
      }),
    [participantsForList, canViewParticipantLeaveReasons]
  )

  const teamPickDetailSlots = useMemo(
    () => teamPickSlotsFromParticipants(participantsForList),
    [participantsForList]
  )

  const teamPickListSplit = useMemo(() => {
    const active = participantsShownToViewer.filter(
      (p) =>
        p.status === 'creator' ||
        p.status === 'confirmed' ||
        p.status === 'pending'
    )
    const sortTeam = (list: typeof active) =>
      [...list].sort((a, b) => {
        if (a.status === 'creator' && b.status !== 'creator') return -1
        if (b.status === 'creator' && a.status !== 'creator') return 1
        return (a.name || '').localeCompare(b.name || '', 'es')
      })
    const rawA = active.filter((p) => p.pickTeam === 'A')
    const rawB = active.filter((p) => p.pickTeam === 'B')
    const unassigned = active.filter(
      (p) => p.pickTeam !== 'A' && p.pickTeam !== 'B'
    )
    const cancelledOnly = participantsShownToViewer.filter(
      (p) => p.status === 'cancelled'
    )
    return {
      teamA: sortTeam(rawA),
      teamB: sortTeam(rawB),
      unassigned,
      cancelledOnly,
    }
  }, [participantsShownToViewer])

  const ratingsSessionQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.ratingsSession(
      selectedMatchOpportunityId,
      currentUser?.id
    ),
    enabled: Boolean(
      selectedMatchOpportunityId && sessionQueryEnabled(currentUser?.id)
    ),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!selectedMatchOpportunityId || !currentUser?.id) {
        return {
          summary: null as RatingSummary | null,
          comments: [] as Array<{ comment: string; createdAt: Date }>,
          myRating: null as MatchOpportunityRatingRow | null,
        }
      }
      const sb = getBrowserSupabase()
      if (!sb) {
        return {
          summary: null as RatingSummary | null,
          comments: [] as Array<{ comment: string; createdAt: Date }>,
          myRating: null as MatchOpportunityRatingRow | null,
        }
      }
      return fetchMatchDetailRatingsBlock(
        sb,
        selectedMatchOpportunityId,
        currentUser.id
      )
    },
  })
  const ratingSummary: RatingSummary | null =
    ratingsSessionQuery.data?.summary ?? null
  const recentComments = ratingsSessionQuery.data?.comments ?? []
  const myRating: MatchOpportunityRatingRow | null =
    ratingsSessionQuery.data?.myRating ?? null
  const loadingRating = ratingsSessionQuery.isFetching

  const [joinRevueltaOpen, setJoinRevueltaOpen] = useState(false)
  const [joinTeamPickOpen, setJoinTeamPickOpen] = useState(false)
  const [lineupEditUserId, setLineupEditUserId] = useState<string | null>(null)
  const [kickUserId, setKickUserId] = useState<string | null>(null)
  const [kickReason, setKickReason] = useState('')
  const [kickSubmitting, setKickSubmitting] = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [joinPlayersOpen, setJoinPlayersOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteRoleFilter, setInviteRoleFilter] = useState<InviteRoleFilter>('all')
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null)
  const organizerId = opportunity?.creatorId ?? null
  const organizerOrganizedCountQuery = useQuery({
    queryKey: queryKeys.profile.organizerCompletedCount(organizerId),
    staleTime: QUERY_STALE_TIME_STATIC_MS,
    enabled: Boolean(
      organizerId &&
        sessionQueryEnabled(currentUser?.id) &&
        organizerId !== currentUser?.id
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
  const organizerNameNormalized = (opportunity?.creatorName ?? '')
    .trim()
    .toLowerCase()
  const isSystemOrganizer =
    organizerNameNormalized === 'sportmatch' ||
    organizerNameNormalized === 'administrador'

  const occupiedSlots = useMemo(
    () =>
      participantsForList.filter(
        (p) =>
          p.status === 'creator' ||
          p.status === 'confirmed' ||
          p.status === 'pending' ||
          p.status === 'invited'
      ).length,
    [participantsForList]
  )
  const activeParticipantIds = useMemo(
    () =>
      new Set(
        participantsForList
          .filter((p) => p.status !== 'cancelled')
          .map((p) => p.id)
      ),
    [participantsForList]
  )
  const freeSlots = useMemo(() => {
    const total = opportunity?.playersNeeded ?? 0
    if (total <= 0) return 0
    return Math.max(0, total - occupiedSlots)
  }, [opportunity?.playersNeeded, occupiedSlots])
  const canOrganizerInvite =
    currentUser?.id === opportunity?.creatorId &&
    freeSlots > 0 &&
    (opportunity?.status === 'pending' || opportunity?.status === 'confirmed')

  const inviteCandidatesQuery = useQuery({
    queryKey: [
      'match-invite-candidates',
      opportunity?.id ?? null,
      opportunity?.cityId ?? null,
      opportunity?.gender ?? null,
    ],
    enabled: Boolean(
      inviteOpen &&
        canOrganizerInvite &&
        opportunity?.cityId &&
        sessionQueryEnabled(currentUser?.id)
    ),
    queryFn: async (): Promise<InviteCandidate[]> => {
      if (!opportunity?.cityId) return []
      const sb = getBrowserSupabase()
      if (!sb) return []
      const { data, error } = await sb
        .from('profiles')
        .select('id, name, photo_url, position, level, mod_banned_at, account_type')
        .eq('city_id', opportunity.cityId)
        .eq('gender', opportunity.gender)
        .eq('account_type', 'player')
        .is('mod_banned_at', null)
        .limit(120)
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => ({
        id: r.id as string,
        name: ((r.name as string | null) ?? '').trim() || 'Jugador',
        photo:
          ((r.photo_url as string | null) ?? '').trim() || '/sportmatch-logo.png',
        position: ((r.position as string | null) ?? '').trim() || 'Jugador',
        level: ((r.level as string | null) ?? '').trim() || 'intermedio',
      }))
    },
  })
  const inviteCandidatesFiltered = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase()
    const isGoalkeeper = (position: string) => {
      const p = position.trim().toLowerCase()
      return p === 'portero' || p === 'arquero' || p === 'gk'
    }
    return (inviteCandidatesQuery.data ?? [])
      .filter((u) => !activeParticipantIds.has(u.id))
      .filter((u) => {
        if (inviteRoleFilter === 'all') return true
        if (inviteRoleFilter === 'gk') return isGoalkeeper(u.position)
        return !isGoalkeeper(u.position)
      })
      .filter((u) => (q ? u.name.toLowerCase().includes(q) : true))
  }, [
    inviteCandidatesQuery.data,
    activeParticipantIds,
    inviteSearch,
    inviteRoleFilter,
  ])

  const invitePlayer = useCallback(
    async (userId: string) => {
      if (!opportunity || !selectedMatchOpportunityId || !canOrganizerInvite) return
      const sb = getBrowserSupabase()
      if (!sb) return
      setInvitingUserId(userId)
      try {
        const { error } = await sb.from('match_opportunity_participants').upsert(
          {
            opportunity_id: opportunity.id,
            user_id: userId,
            status: 'invited',
            is_goalkeeper: false,
          },
          { onConflict: 'opportunity_id,user_id' }
        )
        if (error) {
          toast.error(error.message)
          return
        }
        toast.success('Invitación enviada.')
        await queryClient.invalidateQueries({
          queryKey: queryKeys.matchOpportunity.participants(selectedMatchOpportunityId),
        })
      } finally {
        setInvitingUserId(null)
      }
    },
    [canOrganizerInvite, opportunity, queryClient, selectedMatchOpportunityId]
  )

  const sportsVenueId = opportunity?.sportsVenueId ?? null
  const venueFallbackName = opportunity?.venue ?? ''
  const venueContactQuery = useQuery({
    queryKey: queryKeys.sportsVenue.contact(sportsVenueId ?? ''),
    staleTime: QUERY_STALE_TIME_STATIC_MS,
    enabled: Boolean(
      sportsVenueId && isSupabaseConfigured() && getBrowserSupabase()
    ),
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

  useMatchOpportunityParticipantsRealtime(
    selectedMatchOpportunityId,
    opportunity?.creatorId,
    Boolean(
      selectedMatchOpportunityId &&
        sessionQueryEnabled(currentUser?.id) &&
        isSupabaseConfigured() &&
        getBrowserSupabase()
    )
  )

  const venueReservationId = opportunity?.venueReservationId ?? null
  const reservationQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.venueReservation(venueReservationId),
    enabled: Boolean(
      venueReservationId && sessionQueryEnabled(currentUser?.id)
    ),
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
    enabled: Boolean(
      selectedMatchOpportunityId && sessionQueryEnabled(currentUser?.id)
    ),
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
          const sb = getBrowserSupabase()
          if (sb && selectedMatchOpportunityId) {
            await replaceParticipantsCacheFromServer(
              sb,
              queryClient,
              selectedMatchOpportunityId
            )
          }
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

  const canJoinTeamPick =
    (opportunity.type === 'team_pick_public' ||
      opportunity.type === 'team_pick_private') &&
    !isCreator &&
    !isParticipant &&
    (opportunity.status === 'pending' || opportunity.status === 'confirmed')

  const canEditTeamPickLineup =
    (opportunity.type === 'team_pick_public' ||
      opportunity.type === 'team_pick_private') &&
    (opportunity.status === 'pending' || opportunity.status === 'confirmed') &&
    canEditTeamPickLineupBeforeDeadline(opportunity.dateTime)

  const lineupEditParticipant = useMemo(() => {
    if (!lineupEditUserId) return null
    return participants.find((x) => x.id === lineupEditUserId) ?? null
  }, [lineupEditUserId, participants])

  const organizerWhatsappUrlForParticipant = useCallback(
    (p: OpportunityParticipantRow): string | null => {
      if (!opportunity || !isCreator || p.id === opportunity.creatorId) return null
      if (
        p.status !== 'confirmed' &&
        p.status !== 'pending' &&
        p.status !== 'invited'
      ) {
        return null
      }
      const base = whatsappWaMeBaseHref(p.whatsappPhone)
      if (!base) return null
      const first = p.name.trim().split(/\s+/)[0] || 'hola'
      const msg = `Hola ${first}, soy ${currentUser.name} de Sportmatch.cl (organizo el partido «${opportunity.title}» el ${formatMatchInTimezone(opportunity.dateTime, "EEEE d 'de' MMMM")} a las ${formatMatchInTimezone(opportunity.dateTime, 'HH:mm')} en ${opportunity.venue}, ${opportunity.location}). ¿Confirmas que vas a asistir? Cuando puedas, responde por aquí. ¡Gracias!`
      return `${base}?text=${encodeURIComponent(msg)}`
    },
    [currentUser.name, isCreator, opportunity]
  )

  const renderTeamPickParticipantRow = (p: OpportunityParticipantRow) => {
    const isTeamPickOpp =
      opportunity.type === 'team_pick_public' ||
      opportunity.type === 'team_pick_private'
    const showLineupRow =
      isTeamPickOpp &&
      (p.status === 'creator' ||
        p.status === 'confirmed' ||
        p.status === 'pending')
    const subline = showLineupRow
      ? encounterLineupRoleLabel(p.encounterLineupRole)
      : null
    const mayEditLineup =
      canEditTeamPickLineup &&
      showLineupRow &&
      (currentUser.id === p.id || isCreator)
    const mayKick =
      canEditTeamPickLineup &&
      isCreator &&
      p.id !== opportunity.creatorId &&
      (p.status === 'confirmed' || p.status === 'pending')
    const waHref = organizerWhatsappUrlForParticipant(p)
    const openKickDialog = () => {
      setKickUserId(p.id)
      setKickReason('')
    }

    const waBtn = waHref ? (
      <DropdownMenuItem asChild>
        <a href={waHref} target="_blank" rel="noreferrer">
          <MessageCircle className="w-4 h-4" aria-hidden />
          WhatsApp
        </a>
      </DropdownMenuItem>
    ) : null
    const actions =
      mayEditLineup || mayKick || waBtn ? (
        <div className="flex items-center justify-end gap-1.5 w-full">
          {waHref ? (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-500/10"
            >
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                aria-label={`Contactar a ${p.name} por WhatsApp`}
              >
                <MessageCircle className="w-4 h-4" aria-hidden />
              </a>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                Gestionar
                <MoreHorizontal className="w-3.5 h-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {mayEditLineup ? (
                <DropdownMenuItem onSelect={() => setLineupEditUserId(p.id)}>
                  {currentUser.id === p.id ? 'Ajustar mi puesto' : 'Ajustar jugador'}
                </DropdownMenuItem>
              ) : null}
              {waBtn}
              {mayKick ? (
                <>
                  {(mayEditLineup || waBtn) ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem variant="destructive" onSelect={openKickDialog}>
                    Expulsar jugador
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null
    return (
      <ParticipantListItem
        key={p.id}
        participant={p}
        opportunityType={opportunity.type}
        avatarDisplayUrl={avatarDisplayUrl}
        onPrefetchProfile={prefetchParticipantProfile}
        onOpenProfile={openParticipantProfile}
        subline={subline}
        footer={actions}
      />
    )
  }

  const canSelfConfirmReservation =
    isCreator &&
    !!reservationState &&
    reservationState.status === 'pending' &&
    reservationState.bookerUserId === currentUser.id

  const contactWaHref = useMemo(() => {
    const raw =
      venueContact?.phone?.trim() ||
      opportunity.venueContactPhone?.trim() ||
      ''
    const digits = raw.replace(/\D/g, '')
    if (!digits || !opportunity) return null
    const msg = `Hola ${venueContact?.name ?? opportunity.venue}. Soy ${currentUser.name} y vengo de la app futmatch (soy el organizador del partido "${opportunity.title}"). Quiero confirmar la reserva de cancha para el ${formatMatchInTimezone(opportunity.dateTime, "d 'de' MMMM")} a las ${formatMatchInTimezone(opportunity.dateTime, 'HH:mm')} hrs. ¿quisiera saber si Está disponible y cómo realizo el pago?`
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
  }, [
    venueContact?.phone,
    venueContact?.name,
    opportunity,
    opportunity.venueContactPhone,
    currentUser.name,
  ])

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

  const prefetchParticipantProfile = useCallback(
    (userId: string) => {
      void prefetchPublicPlayerProfile(queryClient, userId)
    },
    [queryClient]
  )

  /** Prefetch solo en hover/focus; el click abre el sheet y useQuery carga si hace falta. */
  const openParticipantProfile = useCallback(
    (userId: string) => {
      openPublicProfile(userId)
    },
    [openPublicProfile]
  )

  const reloadMyRating = useCallback(() => {
    if (!opportunity) return
    void queryClient.invalidateQueries({
      queryKey: queryKeys.matchOpportunity.ratingsSession(
        opportunity.id,
        currentUser.id
      ),
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

          {opportunity.type === 'team_pick_private' &&
            (isCreator || isParticipant) &&
            opportunity.joinCode && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 space-y-1">
                <p className="text-xs font-medium text-foreground">
                  Código para invitar jugadores
                </p>
                <p className="text-2xl font-mono font-bold tracking-[0.35em] text-primary">
                  {opportunity.joinCode}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Comparte este código por fuera de la app; quien se una debe ingresarlo
                  al unirse.
                  {!isCreator ? (
                    <span className="block mt-1">
                      Solo lo ven quienes ya están en el partido (confianza del grupo).
                    </span>
                  ) : null}
                </p>
              </div>
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
            {(opportunity.type === 'team_pick_public' ||
              opportunity.type === 'team_pick_private') &&
              needed > 0 && (
                <div className="text-xs text-muted-foreground pl-6 space-y-0.5">
                  <p>
                    Selección de equipos (A y B). Cupos libres:{' '}
                    <span className="text-foreground font-medium">
                      {Math.max(0, needed - joined)}
                    </span>
                  </p>
                </div>
              )}
          </div>

          <MatchCourtPricingBlock opportunity={opportunity} />

          {reservationState ? (
            <div
              className={cn(
                'rounded-xl border p-3 space-y-3',
                reservationState.status === 'confirmed' &&
                  'border-primary/50 bg-primary/10 shadow-sm',
                reservationState.status === 'pending' &&
                  'border-border bg-secondary/30',
                reservationState.status === 'cancelled' &&
                  'border-destructive/35 bg-destructive/[0.07]',
              )}
            >
              {reservationState.status === 'confirmed' ? (
                <>
                  <div className="flex gap-3 items-start">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary ring-1 ring-inset ring-primary/25"
                      aria-hidden
                    >
                      <TicketCheck className="h-6 w-6" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-semibold text-foreground leading-tight">
                        Cancha confirmada
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        La reserva está confirmada en la app: la cancha queda lista para
                        jugarse en la fecha y hora del partido (revisa el costo arriba si
                        aplica).
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground border-t border-primary/15 pt-2.5">
                    <span className="text-foreground/80 font-medium">
                      Fuente de confirmación:{' '}
                    </span>
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
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-foreground">
                    Estado de reserva de cancha:{' '}
                    {reservationState.status === 'pending'
                      ? 'Pendiente'
                      : 'Cancelada'}
                  </p>
                  {canSelfConfirmReservation ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Paso a paso: 1) contacta al centro, 2) valida horario y pago, 3) al
                        cerrar con el centro, marca esta reserva como confirmada. Queda
                        registrada como autoconfirmada por el organizador.
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
                  ) : reservationState.status === 'pending' ? (
                    <p className="text-xs text-muted-foreground">
                      Cuando el organizador confirme la reserva en la app, aquí verás el
                      aviso de cancha lista con el ícono de ticket.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Esta reserva figura como cancelada. Coordina con el organizador o el
                      centro si el partido sigue en pie.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (opportunity.status === 'pending' ||
              opportunity.status === 'confirmed') &&
            (isCreator || isParticipant) ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">
                Reserva de cancha en la app
              </p>
              {isCreator ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Este partido no tiene una reserva de cancha vinculada. El botón
                    «Ya coordiné con el centro, confirmar reserva» solo aparece cuando
                    hay una reserva activa asociada (por ejemplo tras reservar desde
                    Crear). Puedes seguir coordinando con el centro por WhatsApp.
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
                        Contactar al centro por WhatsApp
                      </a>
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Este centro no figura con teléfono en la app. Usa «Ver ficha del
                      centro» o el contacto que publique el club.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Este partido aún no tiene una reserva de cancha vinculada en la app,
                  así que aquí no se muestra si la cancha está confirmada. Cuando el
                  organizador enlace una reserva desde Crear, verás el estado en este
                  mismo lugar. Mientras tanto, pregunta en el chat del grupo o al
                  organizador.
                </p>
              )}
            </div>
          ) : null}

          {(opportunity.type === 'open' ||
            opportunity.type === 'team_pick_public') &&
            (isCreator || isParticipant) &&
            (opportunity.status === 'pending' ||
              opportunity.status === 'confirmed') && (
              <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground">
                  Invitar jugadores
                </p>
                <p className="text-xs text-muted-foreground">
                  {opportunity.type === 'team_pick_public'
                    ? 'Cualquier participante puede compartir el enlace público. Los cupos y la lista se ven en la misma página que las revueltas abiertas.'
                    : 'Cualquier participante puede invitar con el botón (compartir en apps o copiar enlace). Los cupos se ven en la página pública.'}
                </p>
                <RevueltaInviteActions opportunity={opportunity} />
              </div>
            )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <span className="text-muted-foreground">Organizador:</span>
            <span className="text-foreground font-medium">{opportunity.creatorName}</span>
            {organizerOrganizedCount !== null && !isSystemOrganizer && (
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

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          {(opportunity.type === 'team_pick_public' ||
            opportunity.type === 'team_pick_private') &&
            opportunity.status !== 'completed' &&
            (() => {
              const { colorA, colorB } = teamPickColorsForUi(opportunity)
              return (
                <div className="rounded-xl border border-border/80 bg-secondary/35 px-3 py-2.5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    Colores camiseta
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        Equipo A
                      </span>
                      <TeamPickShieldShape
                        fill={colorA}
                        className="h-8 w-6 shrink-0 drop-shadow-sm"
                      />
                      <span className="text-sm font-medium text-foreground truncate">
                        {teamPickJerseyPresetLabel(colorA)}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        Equipo B
                      </span>
                      <TeamPickShieldShape
                        fill={colorB}
                        className="h-8 w-6 shrink-0 drop-shadow-sm"
                      />
                      <span className="text-sm font-medium text-foreground truncate">
                        {teamPickJerseyPresetLabel(colorB)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })()}
          <h3 className="font-medium text-foreground mb-3">Participantes</h3>
          {(opportunity.type === 'team_pick_public' ||
            opportunity.type === 'team_pick_private') &&
            isCreator && (
              <p className="text-xs text-muted-foreground -mt-1 mb-3 leading-relaxed">
                Como organizador puedes cambiar equipo y rol de cualquier jugador y
                expulsar con motivo hasta 2 horas antes del partido (misma ventana
                que el ajuste de alineación).
              </p>
            )}
          {canOrganizerInvite ? (
            <div className="rounded-xl border border-primary/35 bg-primary/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Cupos disponibles: {freeSlots}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Puedes invitar jugadores de la ciudad de este partido y revisar
                    su perfil antes de enviar la invitación.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setInviteOpen(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Invitar
                </Button>
              </div>
            </div>
          ) : null}
          {loadingParticipants ? (
            <p className="text-sm text-muted-foreground">Cargando participantes...</p>
          ) : participantsShownToViewer.length > 0 ? (
            opportunity.type === 'team_pick_public' ||
            opportunity.type === 'team_pick_private' ? (
              <div className="space-y-4">
                {(() => {
                  const { colorA, colorB } = teamPickColorsForUi(opportunity)
                  return (
                    <div className="grid md:grid-cols-2 gap-4">
                      {(['A', 'B'] as const).map((side) => {
                        const s = teamPickDetailSlots[side]
                        const color = side === 'A' ? colorA : colorB
                        const list =
                          side === 'A'
                            ? teamPickListSplit.teamA
                            : teamPickListSplit.teamB
                        return (
                          <div
                            key={side}
                            className="rounded-xl border border-border bg-secondary/15 p-3 space-y-3 min-w-0"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/60">
                              <span className="flex items-center gap-2 text-sm font-semibold text-foreground min-w-0">
                                <TeamPickShieldShape
                                  fill={color}
                                  className="h-9 w-7 shrink-0 drop-shadow-sm"
                                />
                                Equipo {side}
                                {teamPickSideIsFull(s) ? (
                                  <span className="text-[10px] font-normal text-muted-foreground shrink-0">
                                    Completo
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                                Arquero {s.gk}/{TEAM_PICK_MAX_GK_PER_SIDE} · Campo{' '}
                                {s.field}/{TEAM_PICK_MAX_FIELD_PER_SIDE}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {list.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  Nadie en este bando aún.
                                </p>
                              ) : (
                                list.map((p) => renderTeamPickParticipantRow(p))
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
                {teamPickListSplit.unassigned.length > 0 ? (
                  <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                      Sin bando asignado
                    </p>
                    <div className="space-y-2">
                      {teamPickListSplit.unassigned.map((p) =>
                        renderTeamPickParticipantRow(p)
                      )}
                    </div>
                  </div>
                ) : null}
                {teamPickListSplit.cancelledOnly.length > 0 ? (
                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-xs font-medium text-destructive/90">
                      Bajas / cancelados
                    </p>
                    <div className="space-y-2">
                      {teamPickListSplit.cancelledOnly.map((p) =>
                        renderTeamPickParticipantRow(p)
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {participantsShownToViewer.map((p) => {
                  const isTeamPickOpp =
                    opportunity.type === 'team_pick_public' ||
                    opportunity.type === 'team_pick_private'
                  const showLineupRow =
                    isTeamPickOpp &&
                    (p.status === 'creator' ||
                      p.status === 'confirmed' ||
                      p.status === 'pending')
                  const subline = showLineupRow
                    ? encounterLineupRoleLabel(p.encounterLineupRole)
                    : null
                  const mayEditLineup =
                    canEditTeamPickLineup &&
                    showLineupRow &&
                    (currentUser.id === p.id || isCreator)
                  const mayKick =
                    canEditTeamPickLineup &&
                    isCreator &&
                    p.id !== opportunity.creatorId &&
                    (p.status === 'confirmed' || p.status === 'pending')
                  const waHrefList = organizerWhatsappUrlForParticipant(p)
                  const openKickDialog = () => {
                    setKickUserId(p.id)
                    setKickReason('')
                  }
                  const waBtnList = waHrefList ? (
                    <DropdownMenuItem asChild>
                      <a href={waHrefList} target="_blank" rel="noreferrer">
                        <MessageCircle className="w-4 h-4" aria-hidden />
                        WhatsApp
                      </a>
                    </DropdownMenuItem>
                  ) : null
                  const actions =
                    mayEditLineup || mayKick || waBtnList ? (
                      <div className="flex items-center justify-end gap-1.5 w-full">
                        {waHrefList ? (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                          >
                            <a
                              href={waHrefList}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Contactar a ${p.name} por WhatsApp`}
                            >
                              <MessageCircle className="w-4 h-4" aria-hidden />
                            </a>
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1.5"
                            >
                              Gestionar
                              <MoreHorizontal className="w-3.5 h-3.5" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-44">
                            {mayEditLineup ? (
                              <DropdownMenuItem onSelect={() => setLineupEditUserId(p.id)}>
                                {currentUser.id === p.id
                                  ? 'Ajustar mi puesto'
                                  : 'Ajustar jugador'}
                              </DropdownMenuItem>
                            ) : null}
                            {waBtnList}
                            {mayKick ? (
                              <>
                                {(mayEditLineup || waBtnList) ? (
                                  <DropdownMenuSeparator />
                                ) : null}
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={openKickDialog}
                                >
                                  Expulsar jugador
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null
                  return (
                    <ParticipantListItem
                      key={p.id}
                      participant={p}
                      opportunityType={opportunity.type}
                      avatarDisplayUrl={avatarDisplayUrl}
                      onPrefetchProfile={prefetchParticipantProfile}
                      onOpenProfile={openParticipantProfile}
                      subline={subline}
                      footer={actions}
                    />
                  )
                })}
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Sin participantes aún.</p>
          )}
          {freeSlots > 0 ? (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Cupos libres ({freeSlots})
              </p>
              <div className="space-y-2">
                {Array.from({ length: Math.min(freeSlots, 6) }).map((_, idx) => (
                  <div
                    key={`free-slot-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-2"
                  >
                    <p className="text-sm text-muted-foreground">Cupo disponible</p>
                    {canOrganizerInvite ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setInviteOpen(true)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Invitar
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
                Como organizador del partido puedes aceptar o rechazar quién se suma desde afuera del plantel. Si aceptas, juegan solo este encuentro; no ingresan al equipo.
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

        {canJoinTeamPick && (
          <Button
            type="button"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => setJoinTeamPickOpen(true)}
          >
            Unirme (selección de equipos)
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
              const sb = getBrowserSupabase()
              if (sb) {
                await replaceParticipantsCacheFromServer(sb, queryClient, opportunity.id)
              }
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

      <JoinTeamPickDialog
        open={joinTeamPickOpen}
        onOpenChange={setJoinTeamPickOpen}
        opportunity={opportunity}
        onJoin={async (payload) => {
          await joinTeamPickMatchOpportunity(opportunity.id, payload)
        }}
      />

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open)
          if (!open) {
            setInviteSearch('')
            setInviteRoleFilter('all')
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invitar jugadores</DialogTitle>
            <DialogDescription>
              Jugadores de la ciudad del partido. Puedes ver su perfil antes de
              enviar la invitación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                placeholder="Buscar jugador por nombre"
                className="pl-8"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={inviteRoleFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setInviteRoleFilter('all')}
              >
                Todos
              </Button>
              <Button
                type="button"
                size="sm"
                variant={inviteRoleFilter === 'gk' ? 'default' : 'outline'}
                onClick={() => setInviteRoleFilter('gk')}
              >
                Arqueros
              </Button>
              <Button
                type="button"
                size="sm"
                variant={inviteRoleFilter === 'field' ? 'default' : 'outline'}
                onClick={() => setInviteRoleFilter('field')}
              >
                Jugadores
              </Button>
            </div>
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {inviteCandidatesQuery.isFetching ? (
                <p className="text-sm text-muted-foreground">Cargando jugadores...</p>
              ) : inviteCandidatesFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay jugadores disponibles para invitar en este momento.
                </p>
              ) : (
                inviteCandidatesFiltered.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <img
                        src={avatarDisplayUrl(u.photo, u.id)}
                        alt={u.name}
                        className="h-9 w-9 rounded-full border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {u.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.position} · {u.level}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openPublicProfile(u.id)}
                      >
                        Ver perfil
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={invitingUserId === u.id}
                        onClick={() => void invitePlayer(u.id)}
                      >
                        {invitingUserId === u.id ? 'Invitando...' : 'Invitar'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {lineupEditUserId && lineupEditParticipant ? (
        <TeamPickLineupEditDialog
          open
          onOpenChange={(o) => {
            if (!o) setLineupEditUserId(null)
          }}
          title={`Alineación — ${lineupEditParticipant.name}`}
          initialTeam={(lineupEditParticipant.pickTeam ?? 'A') as PickTeamSide}
          initialRole={
            (lineupEditParticipant.encounterLineupRole ??
              'delantero') as EncounterLineupRole
          }
          participantsForSlots={participantsForList}
          excludeUserId={lineupEditUserId}
          matchType={opportunity.type}
          teamPickColorA={opportunity.teamPickColorA}
          teamPickColorB={opportunity.teamPickColorB}
          onSave={async (payload) => {
            const r = await setTeamPickParticipantLineup(
              opportunity.id,
              lineupEditUserId,
              payload.pickTeam,
              payload.encounterLineupRole
            )
            if (r.ok) {
              await queryClient.invalidateQueries({
                queryKey: queryKeys.matchOpportunity.participants(
                  selectedMatchOpportunityId
                ),
              })
            }
            return { ok: r.ok }
          }}
        />
      ) : null}

      <Dialog
        open={kickUserId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setKickUserId(null)
            setKickReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Expulsar jugador</DialogTitle>
            <DialogDescription>
              El jugador dejará de estar inscrito. Cuenta un motivo claro (mínimo 5
              caracteres).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex flex-col gap-2">
              {TEAM_PICK_KICK_PRESETS.map((label) => (
                <Button
                  key={label}
                  type="button"
                  variant={kickReason === label ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start h-auto py-2 px-3 text-left text-xs"
                  onClick={() => setKickReason(label)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="kick-reason-tp">Motivo (o elige arriba y ajusta aquí)</Label>
              <Textarea
                id="kick-reason-tp"
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
                placeholder="Mínimo 5 caracteres…"
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={kickSubmitting}
              onClick={() => {
                setKickUserId(null)
                setKickReason('')
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                kickSubmitting ||
                kickReason.trim().length < 5 ||
                !kickUserId
              }
              onClick={() => {
                void (async () => {
                  if (!kickUserId || kickReason.trim().length < 5) return
                  setKickSubmitting(true)
                  try {
                    const r = await organizerRemoveTeamPickParticipant(
                      opportunity.id,
                      kickUserId,
                      kickReason.trim()
                    )
                    if (r.ok) {
                      setKickUserId(null)
                      setKickReason('')
                      await queryClient.invalidateQueries({
                        queryKey: queryKeys.matchOpportunity.participants(
                          selectedMatchOpportunityId
                        ),
                      })
                    }
                  } finally {
                    setKickSubmitting(false)
                  }
                })()
              }}
            >
              {kickSubmitting ? 'Procesando…' : 'Confirmar expulsión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        leaveMatchOpportunityWithReason={leaveMatchOpportunityWithReason}
        rescheduleMatchOpportunityWithReason={
          rescheduleMatchOpportunityWithReason
        }
        submitMatchRating={submitMatchRating}
      />

      <BottomNav />
    </div>
  )
}

const TEAM_PICK_KICK_PRESETS = [
  'Cupos completos o rol duplicado',
  'Conducta o conflicto en el grupo',
  'No cumple lo acordado para este partido',
] as const

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
  onPrefetchProfile,
  onOpenProfile,
  subline,
  footer,
}: {
  participant: OpportunityParticipantRow
  opportunityType: MatchType
  avatarDisplayUrl: (photo?: string, userId?: string) => string
  onPrefetchProfile?: (userId: string) => void
  onOpenProfile: (userId: string) => void
  subline?: string | null
  footer?: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onMouseEnter={() => {
              onPrefetchProfile?.(participant.id)
            }}
            onFocus={() => {
              onPrefetchProfile?.(participant.id)
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
              {(opportunityType === 'open' ||
                opportunityType === 'players' ||
                opportunityType === 'team_pick_public' ||
                opportunityType === 'team_pick_private') &&
              participant.isGoalkeeper
                ? ' 🧤'
                : ''}
            </span>
          </button>
        </div>
        <div className="shrink-0 text-right max-w-[min(200px,45%)]">
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
          {participant.status === 'cancelled' &&
          participant.cancelledReason ? (
            <p
              className="text-[10px] text-muted-foreground mt-1 leading-snug line-clamp-2"
              title={participant.cancelledReason}
            >
              {participant.cancelledReason}
            </p>
          ) : null}
        </div>
      </div>
      {subline ? (
        <p className="text-[11px] text-muted-foreground pl-10 leading-snug">
          {subline}
        </p>
      ) : null}
      {footer}
    </div>
  )
})
