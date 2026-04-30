'use client'

import { useEffect, useState, useMemo, useRef, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  useAppAuth,
  useAppMatch,
  useAppTeam,
  useAppUI,
} from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MatchType,
  Level,
  Team,
  type EncounterLineupRole,
  type PlayersSeekProfile,
  type SportsVenue,
} from '@/lib/types'
import { venueCourtPricingHint } from '@/lib/court-pricing'
import {
  DEFAULT_TEAM_PICK_COLOR_A,
  DEFAULT_TEAM_PICK_COLOR_B,
  coerceTeamPickJerseyPresetHex,
} from '@/lib/team-pick-ui'
import {
  buildCreateMatchSuccessShareText,
  formatCreateMatchWhenLine,
} from '@/lib/create-match-share'
import { revueltaInviteAbsoluteUrl } from '@/lib/match-invite-url'
import { TeamPickJerseyColorPicker } from '@/components/team-pick-jersey-color-picker'
import { TIME_SLOT_OPTIONS } from '@/lib/time-slot-options'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import {
  fetchSportsVenuesForPlayerGeo,
  fetchVenueById,
  fetchVenueCourts,
  fetchVenueReservationsRange,
  fetchVenueWeeklyHours,
} from '@/lib/supabase/venue-queries'
import { resolveCityIdFromLabel } from '@/lib/supabase/geo-queries'
import { readCreatePrefill, clearCreatePrefill } from '@/lib/create-prefill'
import { queryKeys, stableIdsKey } from '@/lib/query-keys'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'
import { QUERY_STALE_TIME_STATIC_MS } from '@/lib/query-defaults'
import { fetchAlternativeVenuesWithSlotAtTime } from '@/lib/services/create-alternatives.service'
import { computeVenueAvailableSlots, labelForHm } from '@/lib/venue-slots'
import { consumeRivalTargetTeamId } from '@/lib/rival-prefill'
import { TEAM_ROSTER_MAX } from '@/lib/team-roster'
import {
  userIsTeamPrimaryCaptain,
  userIsTeamStaffCaptain,
} from '@/lib/team-membership'
import {
  ArrowLeft,
  ArrowRight,
  Target,
  Users,
  Shuffle,
  CalendarCheck2,
  MapPin,
  Calendar,
  Clock,
  Star,
  CheckCircle,
  Shield,
  Swords,
  Crown,
  Award,
  Search,
  Info,
  Loader2,
  Copy,
  MessageCircle,
  Share2,
} from 'lucide-react'

const CREATE_MATCH_GUIDELINES: string[] = [
  'Respeto y buena convivencia: trata a rivales y compañeros con educación; el fútbol amateur es para pasarlo bien.',
  'Cero violencia: no se toleran agresiones ni provocaciones. Ante un conflicto, mejor cortar el partido y hablar con calma.',
  'Compromiso: si te apuntas o organizas, avisa con tiempo si no puedes ir para no dejar colgados a los demás.',
  'Nivel honesto: elige un nivel de juego acorde al grupo para que el partido sea parejo y entretenido.',
  'Cancha y pagos: la reserva, el pago y la coordinación con la cancha son responsabilidad del organizador (o de quienes acuerden por el chat); la app solo ayuda a juntar gente.',
  'Reglas del lugar: respeta horarios, el reglamento de la cancha y el cuidado de las instalaciones.',
]

const LEVELS: { value: Level; label: string }[] = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
  { value: 'competitivo', label: 'Competitivo' },
]

const levelLabels: Record<Level, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  competitivo: 'Competitivo',
}

function publishedTitleForShare(args: {
  matchType: MatchType | 'reserve' | null
  formData: { title: string; playersNeeded: number }
  rivalMode: 'direct' | 'open'
  selectedTeam: Team | null
  selectedRivalTeam: Team | null
}): string {
  const t = args.formData.title.trim()
  if (t) return t
  if (args.matchType === 'players') {
    const n = args.formData.playersNeeded
    return `Faltan ${n} ${n === 1 ? 'jugador' : 'jugadores'}`
  }
  if (args.matchType === 'open') return 'Revuelta'
  if (args.matchType === 'team_pick_public') return 'Selección de equipos públicos'
  if (args.matchType === 'team_pick_private') return 'Selección de equipos privado'
  if (args.matchType === 'rival' && args.selectedTeam) {
    if (args.rivalMode === 'direct' && args.selectedRivalTeam) {
      return `${args.selectedTeam.name} vs ${args.selectedRivalTeam.name}`
    }
    return `${args.selectedTeam.name} busca rival`
  }
  if (args.matchType === 'reserve') return 'Reserva de cancha'
  return 'Partido'
}

export function CreateScreen() {
  const { setCurrentScreen } = useAppUI()
  const { currentUser } = useAppAuth()
  const { addMatchOpportunity, reserveVenueOnly } = useAppMatch()
  const { createRivalChallenge, getUserTeams, getFilteredTeams } = useAppTeam()
  const [step, setStep] = useState(1)
  const [matchType, setMatchType] = useState<MatchType | 'reserve' | null>(null)
  /** Paso 1: tras elegir «Selección de equipos», elegir público vs privado. */
  const [step1TeamPickSubstep, setStep1TeamPickSubstep] = useState<
    'menu' | 'visibility'
  >('menu')
  /** Revuelta (open): si se define, solo el plantel entra directo; externos solicitan al organizador. */
  const [privateRevueltaTeamId, setPrivateRevueltaTeamId] = useState<string | null>(
    null
  )

  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [selectedRivalTeam, setSelectedRivalTeam] = useState<Team | null>(null)
  const [rivalMode, setRivalMode] = useState<'direct' | 'open'>('direct')
  const [rivalSearch, setRivalSearch] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    teamName: '',
    venue: '',
    location: 'Rancagua',
    date: '',
    time: '',
    level: 'intermedio' as Level,
    playersNeeded: 6,
  })
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const submitLockRef = useRef(false)
  /** Revuelta: organizador cuenta como un cupo y elige arquero o campo. */
  const [creatorIsGoalkeeper, setCreatorIsGoalkeeper] = useState(false)
  /** 6vs6 team_pick: rol del organizador (equipo A). */
  const [teamPickCreatorRole, setTeamPickCreatorRole] =
    useState<EncounterLineupRole>('delantero')
  const [teamPickColorA, setTeamPickColorA] = useState(DEFAULT_TEAM_PICK_COLOR_A)
  const [teamPickColorB, setTeamPickColorB] = useState(DEFAULT_TEAM_PICK_COLOR_B)
  const [createdTeamPickJoinCode, setCreatedTeamPickJoinCode] = useState<
    string | null
  >(null)
  /** Para armar enlace público en la pantalla de éxito (revuelta / detalle). */
  const [publishedOpportunityId, setPublishedOpportunityId] = useState<
    string | null
  >(null)
  /** Buscar jugadores: qué cupos ofrece (paso 3). */
  const [playersSeekProfile, setPlayersSeekProfile] =
    useState<PlayersSeekProfile | null>(null)
  const [prefillExtraVenue, setPrefillExtraVenue] = useState<SportsVenue | null>(
    null
  )
  const [linkedVenueId, setLinkedVenueId] = useState<string | null>(null)
  const [bookCourtSlot, setBookCourtSlot] = useState(false)
  const [bookingNoCourt, setBookingNoCourt] = useState(false)
  const [venueTimesRefreshKey, setVenueTimesRefreshKey] = useState(0)

  useEffect(() => {
    if (matchType !== 'open') setPrivateRevueltaTeamId(null)
  }, [matchType])

  useEffect(() => {
    if (matchType !== 'team_pick_private') setCreatedTeamPickJoinCode(null)
  }, [matchType])

  const venueCourtsQuery = useQuery({
    queryKey: queryKeys.create.venueCourts(linkedVenueId),
    staleTime: QUERY_STALE_TIME_STATIC_MS,
    enabled: Boolean(linkedVenueId && sessionQueryEnabled(currentUser?.id)),
    queryFn: async () => {
      const sb = getBrowserSupabase()
      if (!sb || !linkedVenueId) return []
      return fetchVenueCourts(sb, linkedVenueId)
    },
  })
  const venueCourtsHint = venueCourtsQuery.data ?? []

  const sportsVenuesQuery = useQuery({
    queryKey: queryKeys.create.sportsVenuesForPlayer(
      currentUser?.regionId,
      currentUser?.cityId
    ),
    staleTime: QUERY_STALE_TIME_STATIC_MS,
    enabled: sessionQueryEnabled(currentUser?.id),
    queryFn: async () => {
      const sb = getBrowserSupabase()
      if (!sb) return []
      return fetchSportsVenuesForPlayerGeo(
        sb,
        currentUser?.regionId,
        currentUser?.cityId
      )
    },
  })

  useEffect(() => {
    const pre = readCreatePrefill()
    if (!pre) return
    setLinkedVenueId(pre.sportsVenueId)
    setBookCourtSlot(pre.bookCourtSlot)
    setFormData((f) => ({
      ...f,
      venue: pre.venueLabel,
      location: pre.city,
      date: pre.date,
      time: pre.time,
    }))
    clearCreatePrefill()
  }, [currentUser?.regionId, currentUser?.cityId])

  useEffect(() => {
    const id = linkedVenueId
    const data = sportsVenuesQuery.data
    if (!id || !data) {
      if (!id) setPrefillExtraVenue(null)
      return
    }
    if (data.some((v) => v.id === id)) {
      setPrefillExtraVenue(null)
      return
    }
    let cancelled = false
    const sb = getBrowserSupabase()
    if (!sb || !isSupabaseConfigured()) return
    void fetchVenueById(sb, id).then((v) => {
      if (cancelled) return
      setPrefillExtraVenue(v ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [linkedVenueId, sportsVenuesQuery.data])

  const sportsVenuesFromDb = useMemo(() => {
    const base = sportsVenuesQuery.data ?? []
    if (
      prefillExtraVenue &&
      !base.some((v) => v.id === prefillExtraVenue.id)
    ) {
      return [...base, prefillExtraVenue].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    }
    return base
  }, [sportsVenuesQuery.data, prefillExtraVenue])

  const venuePricingHintText = useMemo(() => {
    if (!linkedVenueId || venueCourtsHint.length === 0) return null
    const v = sportsVenuesFromDb.find((x) => x.id === linkedVenueId)
    return venueCourtPricingHint(
      venueCourtsHint,
      v?.slotDurationMinutes ?? 60
    )
  }, [linkedVenueId, venueCourtsHint, sportsVenuesFromDb])

  useEffect(() => {
    if (!currentUser) return
    const rivalTeamId = consumeRivalTargetTeamId()
    if (!rivalTeamId) return
    const allTeams = getFilteredTeams(currentUser.gender)
    const target = allTeams.find((t) => t.id === rivalTeamId)
    if (!target) return

    const staffTeams = getUserTeams().filter((t) =>
      userIsTeamStaffCaptain(t, currentUser.id)
    )
    setMatchType('rival')
    setRivalMode('direct')
    setSelectedRivalTeam(target)
    setStep(2)
    if (staffTeams.length === 1) {
      setSelectedTeam(staffTeams[0])
      setStep(3)
    }
    toast.success(
      staffTeams.length > 0
        ? `Desafío listo contra ${target.name}. Completa fecha y publica.`
        : 'Para desafiar, debes ser capitán o vicecapitán de un equipo.'
    )
  }, [currentUser, getFilteredTeams, getUserTeams])

  const linkedVenueSlotHint =
    sportsVenuesFromDb.find((v) => v.id === linkedVenueId)?.slotDurationMinutes ?? 0

  const venueDaySlotsQuery = useQuery({
    queryKey: queryKeys.create.venueDaySlots(
      linkedVenueId,
      formData.date,
      venueTimesRefreshKey,
      linkedVenueSlotHint
    ),
    enabled: Boolean(
      linkedVenueId && formData.date && sessionQueryEnabled(currentUser?.id)
    ),
    queryFn: async () => {
      const supabase = getBrowserSupabase()
      if (!supabase || !linkedVenueId || !formData.date) {
        return { options: [] as Array<{ value: string; label: string }>, help: null as string | null }
      }
      const venue = sportsVenuesFromDb.find((v) => v.id === linkedVenueId)
      const slotDuration = venue?.slotDurationMinutes ?? 60
      const dayStart = new Date(`${formData.date}T00:00:00`)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const dow = dayStart.getDay()

      const [courts, weeklyHours, reservations] = await Promise.all([
        fetchVenueCourts(supabase, linkedVenueId),
        fetchVenueWeeklyHours(supabase, linkedVenueId),
        fetchVenueReservationsRange(
          supabase,
          linkedVenueId,
          dayStart.toISOString(),
          dayEnd.toISOString()
        ),
      ])

      if (courts.length === 0) {
        return {
          options: [],
          help: 'Este centro no tiene canchas registradas.',
        }
      }

      const dayHours = weeklyHours.find((h) => h.dayOfWeek === dow)
      if (!dayHours) {
        return {
          options: [],
          help: 'Este centro no atiende en la fecha seleccionada.',
        }
      }

      const options = computeVenueAvailableSlots({
        dayStart,
        openTime: dayHours.openTime,
        closeTime: dayHours.closeTime,
        slotDurationMinutes: slotDuration,
        courtsCount: courts.length,
        reservations: reservations.filter((r) => r.status !== 'cancelled'),
      })

      return {
        options,
        help:
          options.length === 0
            ? 'No hay horarios disponibles para esta fecha.'
            : `Horarios disponibles considerando ${courts.length} cancha(s).`,
      }
    },
  })

  const venueTimeOptions =
    linkedVenueId && formData.date
      ? venueDaySlotsQuery.data?.options ?? null
      : null
  const venueTimeHelp =
    linkedVenueId && formData.date
      ? venueDaySlotsQuery.isFetching
        ? 'Buscando horarios disponibles…'
        : (venueDaySlotsQuery.data?.help ?? null)
      : null
  const loadingVenueTimes = Boolean(
    linkedVenueId && formData.date && venueDaySlotsQuery.isFetching
  )

  const selectedVenueHasChosenTime = (() => {
    if (!linkedVenueId || !formData.date || !formData.time) return true
    const allowed = new Set((venueTimeOptions ?? []).map((x) => x.value))
    return allowed.has(formData.time)
  })()
  const shouldSuggestAlternatives =
    bookingNoCourt || !selectedVenueHasChosenTime

  const candidateVenueIdsKey = useMemo(
    () => stableIdsKey(sportsVenuesFromDb.map((v) => v.id)),
    [sportsVenuesFromDb]
  )

  const alternativesQuery = useQuery({
    queryKey: queryKeys.create.alternativeVenuesAtTime(
      candidateVenueIdsKey,
      linkedVenueId ?? '',
      formData.date,
      formData.time
    ),
    enabled:
      shouldSuggestAlternatives &&
      Boolean(
        linkedVenueId &&
          formData.date &&
          formData.time &&
          sessionQueryEnabled(currentUser?.id) &&
          sportsVenuesFromDb.length > 0
      ),
    queryFn: async () => {
      const supabase = getBrowserSupabase()
      if (!supabase || !linkedVenueId) return [] as SportsVenue[]
      return fetchAlternativeVenuesWithSlotAtTime(supabase, {
        allVenues: sportsVenuesFromDb,
        linkedVenueId,
        dateYmd: formData.date,
        targetTimeValue: formData.time,
        locationForSort: formData.location,
        maxResults: 5,
      })
    },
  })

  const alternativeVenues = shouldSuggestAlternatives
    ? alternativesQuery.data ?? []
    : []
  const loadingAlternativeVenues =
    shouldSuggestAlternatives && alternativesQuery.isFetching

  useEffect(() => {
    if (!linkedVenueId || !formData.date || !formData.time) {
      setBookingNoCourt(false)
    }
  }, [linkedVenueId, formData.date, formData.time])

  const userTeams = getUserTeams()
  const rivalChallengerTeams = currentUser
    ? userTeams.filter((t) => userIsTeamStaffCaptain(t, currentUser.id))
    : []
  const allTeams = currentUser ? getFilteredTeams(currentUser.gender) : []
  const rivalTeams = allTeams
    .filter(
      (t) => t.id !== selectedTeam?.id && !userTeams.some((ut) => ut.id === t.id)
    )
    .filter((t) => t.name.toLowerCase().includes(rivalSearch.toLowerCase()))

  const handleBack = () => {
    if (step === 1 && step1TeamPickSubstep === 'visibility') {
      setStep1TeamPickSubstep('menu')
      if (
        matchType === 'team_pick_public' ||
        matchType === 'team_pick_private'
      ) {
        setMatchType(null)
      }
      return
    }
    if (step > 1) {
      if (matchType === 'rival' && step === 4) {
        setStep(3)
        setSelectedRivalTeam(null)
      } else if (matchType === 'rival' && step === 3) {
        setStep(2)
      } else if (matchType === 'rival' && step === 2) {
        setStep(1)
        setStep1TeamPickSubstep('menu')
        setSelectedTeam(null)
      } else if (matchType === 'players' && step === 4) {
        setStep(3)
      } else if (matchType === 'players' && step === 3) {
        setStep(2)
      } else if (matchType === 'players' && step === 2) {
        setStep(1)
        setStep1TeamPickSubstep('menu')
        setPlayersSeekProfile(null)
      } else if (matchType === 'open' && step === 2) {
        setStep(1)
        setStep1TeamPickSubstep('menu')
      } else if (
        (matchType === 'team_pick_public' || matchType === 'team_pick_private') &&
        step === 2
      ) {
        setStep(1)
        setStep1TeamPickSubstep('menu')
      } else if (matchType === 'reserve' && step === 2) {
        setStep(1)
        setStep1TeamPickSubstep('menu')
      } else {
        setStep(step - 1)
      }
    } else {
      setCurrentScreen('home')
    }
  }

  const handleSubmit = async () => {
    if (!matchType || !currentUser) return
    if (matchType === 'players' && !playersSeekProfile) return

    if (submitLockRef.current) return
    submitLockRef.current = true
    setIsPublishing(true)
    setPublishedOpportunityId(null)
    setCreatedTeamPickJoinCode(null)

    try {
      const dateTime = new Date(`${formData.date}T${formData.time}`)

      if (matchType === 'reserve') {
        if (!linkedVenueId || !formData.date || !formData.time) return
        const venue = sportsVenuesFromDb.find((v) => v.id === linkedVenueId)
        const res = await reserveVenueOnly({
          sportsVenueId: linkedVenueId,
          startsAt: dateTime,
          durationMinutes: venue?.slotDurationMinutes ?? 60,
        })
        if (!res.ok) {
          if (res.code === 'no_court') {
            setBookingNoCourt(true)
            setVenueTimesRefreshKey((k) => k + 1)
          }
          return
        }
        setIsSubmitted(true)
        return
      }

      // Rival challenge flow (direct or open)
      if (matchType === 'rival' && selectedTeam) {
        if (rivalMode === 'direct' && !selectedRivalTeam) return
        const rivalOppId = await createRivalChallenge({
          challengerTeam: selectedTeam,
          mode: rivalMode,
          challengedTeam: rivalMode === 'direct' ? selectedRivalTeam ?? undefined : undefined,
          message: formData.description,
          venue: formData.venue,
          location: formData.location,
          dateTime,
          level: formData.level,
        })
        if (!rivalOppId) return
        setPublishedOpportunityId(rivalOppId)
      } else {
        const linked =
          sportsVenuesFromDb.find((x) => x.id === linkedVenueId) ??
          sportsVenuesFromDb.find((x) => x.name === formData.venue.trim())
        let matchCityId = currentUser.cityId
        let matchLocationLabel = formData.location
        if (linked) {
          matchLocationLabel = linked.city
          if (linked.cityId?.trim()) {
            matchCityId = linked.cityId
          } else if (linked.city?.trim() && isSupabaseConfigured()) {
            const sb = getBrowserSupabase()
            const resolved = sb
              ? await resolveCityIdFromLabel(sb, linked.city)
              : null
            if (resolved) matchCityId = resolved
          }
        }
        const autoTitle =
          matchType === 'players'
            ? `Faltan ${formData.playersNeeded} ${
                formData.playersNeeded === 1 ? 'jugador' : 'jugadores'
              }`
            : matchType === 'open'
              ? 'Revuelta'
              : matchType === 'team_pick_public'
                ? 'Selección de equipos públicos'
                : matchType === 'team_pick_private'
                  ? 'Selección de equipos privado'
                  : 'Partido'
        const res = await addMatchOpportunity({
          type: matchType,
          title: formData.title.trim() || autoTitle,
          description: formData.description,
          teamName: formData.teamName || undefined,
          venue: formData.venue,
          location: matchLocationLabel,
          cityId: matchCityId,
          dateTime,
          level: formData.level,
          creatorId: currentUser.id,
          creatorName: currentUser.name,
          creatorPhoto: currentUser.photo,
          playersNeeded:
            matchType === 'rival' ||
            matchType === 'team_pick_public' ||
            matchType === 'team_pick_private'
              ? undefined
              : formData.playersNeeded,
          playersJoined:
            matchType === 'rival' ||
            matchType === 'team_pick_public' ||
            matchType === 'team_pick_private'
              ? undefined
              : 0,
          gender: currentUser.gender,
          status: 'pending',
          creatorIsGoalkeeper:
            matchType === 'open' ? creatorIsGoalkeeper : undefined,
          playersSeekProfile:
            matchType === 'players' && playersSeekProfile
              ? playersSeekProfile
              : undefined,
          sportsVenueId: linked?.id,
          bookCourtSlot:
            linked && bookCourtSlot ? true : undefined,
          courtSlotMinutes: linked?.slotDurationMinutes,
          privateRevueltaTeamId:
            matchType === 'open' && privateRevueltaTeamId
              ? privateRevueltaTeamId
              : undefined,
          creatorEncounterLineupRole:
            matchType === 'team_pick_public' || matchType === 'team_pick_private'
              ? teamPickCreatorRole
              : undefined,
          teamPickColorA:
            matchType === 'team_pick_public' || matchType === 'team_pick_private'
              ? coerceTeamPickJerseyPresetHex(teamPickColorA) ??
                DEFAULT_TEAM_PICK_COLOR_A
              : undefined,
          teamPickColorB:
            matchType === 'team_pick_public' || matchType === 'team_pick_private'
              ? coerceTeamPickJerseyPresetHex(teamPickColorB) ??
                DEFAULT_TEAM_PICK_COLOR_B
              : undefined,
        })
        if (!res.ok) {
          if (res.code === 'no_court') {
            setBookingNoCourt(true)
            setVenueTimesRefreshKey((k) => k + 1)
          }
          return
        }
        if (res.opportunityId) {
          setPublishedOpportunityId(res.opportunityId)
        }
        if (
          matchType === 'team_pick_private' &&
          typeof res.joinCode === 'string' &&
          res.joinCode.trim()
        ) {
          setCreatedTeamPickJoinCode(res.joinCode.trim())
        }
      }

      setIsSubmitted(true)
    } finally {
      submitLockRef.current = false
      setIsPublishing(false)
    }
  }

  if (isSubmitted) {
    const whenLine =
      formData.date && formData.time
        ? formatCreateMatchWhenLine(formData.date, formData.time)
        : ''
    const shareTitle = publishedTitleForShare({
      matchType,
      formData,
      rivalMode,
      selectedTeam,
      selectedRivalTeam,
    })
    const pageUrl =
      typeof window !== 'undefined' && publishedOpportunityId
        ? revueltaInviteAbsoluteUrl(
            publishedOpportunityId,
            window.location.origin
          )
        : null
    const shareMessage = buildCreateMatchSuccessShareText({
      title: shareTitle,
      venue: formData.venue,
      location: formData.location,
      whenLine,
      publicPageUrl: pageUrl,
      matchType: matchType ?? null,
      joinCode:
        matchType === 'team_pick_private' ? createdTeamPickJoinCode : null,
    })

    const copyShareMessage = async () => {
      try {
        await navigator.clipboard.writeText(shareMessage)
        toast.success('Mensaje copiado')
      } catch {
        toast.error('No se pudo copiar')
      }
    }

    const shareNativeOrCopy = async () => {
      try {
        if (navigator.share) {
          await navigator.share({
            title: shareTitle,
            text: shareMessage,
            url: pageUrl ?? undefined,
          })
          return
        }
        await copyShareMessage()
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        await copyShareMessage()
      }
    }

    const shareWhatsApp = () => {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(shareMessage)}`,
        '_blank',
        'noopener,noreferrer'
      )
    }

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md w-full">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="font-brand-heading text-2xl text-foreground">
              {matchType === 'reserve' ? 'Reserva creada' : 'Publicado!'}
            </h1>
            <p className="text-muted-foreground mt-2">
              {matchType === 'rival' && rivalMode === 'direct' && selectedRivalTeam 
                ? `Tu desafio a ${selectedRivalTeam.name} ha sido enviado` 
                : matchType === 'rival' ? 'Tu busqueda de rival ya esta visible'
                : matchType === 'players' ? 'Tu busqueda de jugadores ya esta visible' 
                : matchType === 'reserve'
                  ? 'Tu solicitud de reserva quedó pendiente de confirmación.'
                  : matchType === 'team_pick_public'
                    ? 'Tu selección de equipos pública ya está visible.'
                    : matchType === 'team_pick_private'
                      ? 'Tu selección de equipos privada ya está creada.'
                      : 'Tu revuelta ya esta visible'}
            </p>
            {matchType === 'team_pick_private' && createdTeamPickJoinCode ? (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Código para invitar
                </p>
                <p className="text-3xl font-mono font-bold tracking-[0.35em] text-primary text-center">
                  {createdTeamPickJoinCode}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Compartilo con quienes quieras que se sumen; lo van a necesitar al
                  unirse en la app.
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 px-3 py-4 text-left space-y-3">
            <p className="text-xs font-semibold text-foreground text-center uppercase tracking-wide">
              Compartir invitación
            </p>
            <p className="text-[11px] text-muted-foreground text-center leading-snug">
              El texto incluye lugar, fecha y enlace cuando aplica.
              {matchType === 'team_pick_private'
                ? ' En selección privada también va el código de unión.'
                : null}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2 h-11"
                onClick={() => void copyShareMessage()}
              >
                <Copy className="h-4 w-4 shrink-0" aria-hidden />
                Copiar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2 h-11"
                onClick={() => void shareNativeOrCopy()}
              >
                <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                Compartir
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2 h-11 border-green-700/50 bg-green-950/30 hover:bg-green-950/50"
                onClick={() => shareWhatsApp()}
              >
                <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
                WhatsApp
              </Button>
            </div>
          </div>

          <Button
            onClick={() => setCurrentScreen('home')}
            className="w-full max-w-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Volver al inicio
          </Button>
        </div>
      </div>
    )
  }

  const totalStepsForFlow =
    matchType === 'rival' ? 4 : matchType === 'players' ? 4 : 2

  const showCasualForm =
    (matchType === 'open' && step === 2) ||
    (matchType === 'players' && step === 4) ||
    ((matchType === 'team_pick_public' || matchType === 'team_pick_private') &&
      step === 2)

  const showReserveForm = matchType === 'reserve' && step === 2

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="border-b border-border p-4">
        <AppScreenBrandHeading
          before={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          }
          title="Crear partido"
          subtitle={
            matchType === 'rival'
              ? `Paso ${step} de 4`
              : matchType
                ? `Paso ${step} de ${totalStepsForFlow}`
                : 'Paso 1'
          }
          titleClassName="text-lg font-semibold"
        />
      </header>

      <main className="p-4">
        {step === 1 && (
          <div className="space-y-6">
            {step1TeamPickSubstep === 'menu' ? (
              <>
                <Card className="border-primary/35 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <Info
                        className="w-5 h-5 text-primary shrink-0 mt-0.5"
                        aria-hidden
                      />
                      <div className="min-w-0 space-y-2">
                        <p className="text-sm font-semibold text-foreground">
                          Antes de publicar
                        </p>
                        <ul className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                          {CREATE_MATCH_GUIDELINES.map((line, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-primary shrink-0 select-none">•</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="text-center space-y-2">
                  <h2 className="font-brand-heading text-2xl text-foreground">
                    Qué quieres hacer?
                  </h2>
                  <p className="text-muted-foreground">
                    Elige una opción para comenzar
                  </p>
                </div>

                <div className="space-y-4 mt-8">
                  <TypeCard
                    icon={<Target className="w-8 h-8" />}
                    title="Buscar rival"
                    description="Tu equipo vs otro equipo"
                    selected={matchType === 'rival'}
                    onClick={() => {
                      setStep1TeamPickSubstep('menu')
                      setMatchType('rival')
                    }}
                    color="red"
                  />
                  <TypeCard
                    icon={<Users className="w-8 h-8" />}
                    title="Buscar jugadores"
                    description="Te faltan jugadores para completar"
                    selected={matchType === 'players'}
                    disabled
                    unavailableLabel="No disponible"
                    onClick={() => {
                      toast.info(
                        'Buscar jugadores estará disponible pronto. Por ahora usa Revuelta o Selección de equipos.'
                      )
                    }}
                    color="green"
                  />
                  <TypeCard
                    icon={<Shuffle className="w-8 h-8" />}
                    title="Crear revuelta"
                    description="Partido abierto para todos"
                    selected={matchType === 'open'}
                    onClick={() => {
                      setStep1TeamPickSubstep('menu')
                      setMatchType('open')
                      setFormData((f) => ({
                        ...f,
                        playersNeeded: Math.min(12, Math.max(10, f.playersNeeded)),
                      }))
                    }}
                    color="gold"
                  />
                  <TypeCard
                    icon={<Swords className="w-8 h-8" />}
                    title="Selección de equipos"
                    description="Únete al equipo A o B y prepárate para jugar."
                    selected={
                      matchType === 'team_pick_public' ||
                      matchType === 'team_pick_private'
                    }
                    onClick={() => {
                      setStep1TeamPickSubstep('visibility')
                      setMatchType(null)
                    }}
                    color="gold"
                  />
                  <TypeCard
                    icon={<CalendarCheck2 className="w-8 h-8" />}
                    title="Solo reservar cancha"
                    description="Reserva rápida sin crear partido"
                    selected={matchType === 'reserve'}
                    onClick={() => {
                      setStep1TeamPickSubstep('menu')
                      setMatchType('reserve')
                    }}
                    color="green"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-5">
                <Button
                  type="button"
                  variant="ghost"
                  className="-ml-2 gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setStep1TeamPickSubstep('menu')
                    if (
                      matchType === 'team_pick_public' ||
                      matchType === 'team_pick_private'
                    ) {
                      setMatchType(null)
                    }
                  }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Otras opciones
                </Button>
                <div className="text-center space-y-2">
                  <h2 className="font-brand-heading text-2xl text-foreground">
                    Tipo de partido
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed px-1">
                    Elige si cualquiera puede sumarse o solo quien tenga el código
                    de unión.
                  </p>
                </div>
                <div className="space-y-4">
                  <TypeCard
                    icon={<Swords className="w-8 h-8" />}
                    title="Público"
                    description="Aparece en el listado: cualquier jugador puede unirse al equipo A o B."
                    selected={matchType === 'team_pick_public'}
                    onClick={() => setMatchType('team_pick_public')}
                    color="green"
                  />
                  <TypeCard
                    icon={<Swords className="w-8 h-8" />}
                    title="Privado"
                    description="No aparece como los demás: solo entra quien tenga el código de 4 dígitos que compartes."
                    selected={matchType === 'team_pick_private'}
                    onClick={() => setMatchType('team_pick_private')}
                    color="red"
                  />
                </div>
              </div>
            )}

            <Button
              onClick={() => {
                if (matchType === 'rival') {
                  if (rivalChallengerTeams.length === 0) {
                    setCurrentScreen('teams')
                  } else {
                    setStep(2)
                  }
                } else {
                  if (matchType === 'players') {
                    toast.info(
                      'Buscar jugadores está temporalmente no disponible.'
                    )
                    return
                  }
                  setStep(2)
                }
              }}
              disabled={
                step1TeamPickSubstep === 'visibility'
                  ? matchType !== 'team_pick_public' &&
                    matchType !== 'team_pick_private'
                  : !matchType || matchType === 'players'
              }
              className="w-full h-14 mt-8 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {matchType === 'rival' && rivalChallengerTeams.length === 0
                ? 'Crear equipo primero'
                : 'Continuar'}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            {matchType === 'rival' && rivalChallengerTeams.length === 0 && (
              <p className="text-center text-sm text-muted-foreground mt-3">
                Necesitas ser capitán o vicecapitán de un equipo para buscar rival
              </p>
            )}
          </div>
        )}

        {/* Step 2 for Rival: Select your team */}
        {step === 2 && matchType === 'rival' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-brand-heading text-2xl text-foreground">Selecciona tu equipo</h2>
              <p className="text-muted-foreground">Elige el equipo que desafiara</p>
            </div>

            <div className="space-y-3 mt-6">
              {rivalChallengerTeams.map((team) => (
                <Card 
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                  className={`bg-card cursor-pointer transition-all ${
                    selectedTeam?.id === team.id 
                      ? 'border-primary ring-2 ring-primary/20' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                        {team.logo ? (
                          <img src={team.logo} alt={team.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/20">
                            <Shield className="w-7 h-7 text-primary" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{team.name}</h3>
                          {currentUser &&
                            userIsTeamPrimaryCaptain(team, currentUser.id) && (
                            <Crown className="w-4 h-4 text-accent" />
                          )}
                          {currentUser &&
                            team.viceCaptainId === currentUser.id &&
                            !userIsTeamPrimaryCaptain(team, currentUser.id) && (
                              <Award className="w-4 h-4 text-sky-500" />
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {levelLabels[team.level]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {team.members.length}/{TEAM_ROSTER_MAX} jugadores
                          </span>
                        </div>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedTeam?.id === team.id ? 'border-primary bg-primary' : 'border-border'
                      }`}>
                        {selectedTeam?.id === team.id && <div className="w-2.5 h-2.5 rounded-full bg-background" />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              onClick={() => setStep(3)}
              disabled={!selectedTeam}
              className="w-full h-14 mt-6 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Continuar
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 3 for Rival: Select rival team */}
        {step === 3 && matchType === 'rival' && selectedTeam && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-brand-heading text-2xl text-foreground">Selecciona rival</h2>
              <p className="text-muted-foreground">
                <span className="text-primary font-medium">{selectedTeam.name}</span> puede desafiar directo o publicar búsqueda abierta
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRivalMode('open')
                  setSelectedRivalTeam(null)
                }}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  rivalMode === 'open'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                Buscar rival abierto
              </button>
              <button
                type="button"
                onClick={() => setRivalMode('direct')}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  rivalMode === 'direct'
                    ? 'border-red-500 bg-red-500/10 text-red-400'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                Desafiar equipo específico
              </button>
            </div>

            {rivalMode === 'direct' && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar equipo rival..."
                    value={rivalSearch}
                    onChange={(e) => setRivalSearch(e.target.value)}
                    className="pl-10 h-11 bg-secondary border-border"
                  />
                </div>

                <div className="space-y-3 mt-6">
                  {rivalTeams.length > 0 ? (
                    rivalTeams.map((team) => (
                      <Card 
                        key={team.id}
                        onClick={() => setSelectedRivalTeam(team)}
                        className={`bg-card cursor-pointer transition-all ${
                          selectedRivalTeam?.id === team.id 
                            ? 'border-red-500 ring-2 ring-red-500/20' 
                            : 'border-border hover:border-red-500/50'
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                              {team.logo ? (
                                <img src={team.logo} alt={team.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-red-500/20">
                                  <Shield className="w-7 h-7 text-red-400" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-foreground">{team.name}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {levelLabels[team.level]}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {team.members.length}/{TEAM_ROSTER_MAX} jugadores
                                </span>
                              </div>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                              selectedRivalTeam?.id === team.id ? 'border-red-500 bg-red-500' : 'border-border'
                            }`}>
                              {selectedRivalTeam?.id === team.id && <div className="w-2.5 h-2.5 rounded-full bg-background" />}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="bg-card border-border border-dashed">
                      <CardContent className="p-8 text-center">
                        <Swords className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">No hay equipos rivales disponibles</p>
                        <p className="text-xs text-muted-foreground mt-1">Espera a que otros equipos se registren</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}

            <Button
              onClick={() => {
                if (selectedTeam) {
                  setFormData((prev) => ({ ...prev, level: selectedTeam.level }))
                }
                setStep(4)
              }}
              disabled={rivalMode === 'direct' && !selectedRivalTeam}
              className="w-full h-14 mt-6 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              <Swords className="w-5 h-5 mr-2" />
              {rivalMode === 'direct' ? 'Desafiar y continuar' : 'Publicar búsqueda y continuar'}
            </Button>
          </div>
        )}

        {/* Step 4 for Rival: Match details */}
        {step === 4 && matchType === 'rival' && selectedTeam && (
          <div className="space-y-6">
            {/* VS Preview */}
            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden mx-auto mb-2">
                    {selectedTeam.logo ? (
                      <img src={selectedTeam.logo} alt={selectedTeam.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary/20">
                        <Shield className="w-8 h-8 text-primary" />
                      </div>
                    )}
                  </div>
                  <p className="font-semibold text-foreground text-sm">{selectedTeam.name}</p>
                </div>
                <div className="px-4">
                  <span className="font-brand-heading text-2xl text-accent">VS</span>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden mx-auto mb-2">
                    {rivalMode === 'direct' && selectedRivalTeam?.logo ? (
                      <img src={selectedRivalTeam.logo} alt={selectedRivalTeam.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-red-500/20">
                        <Shield className="w-8 h-8 text-red-400" />
                      </div>
                    )}
                  </div>
                  <p className="font-semibold text-foreground text-sm">
                    {rivalMode === 'direct'
                      ? selectedRivalTeam?.name
                      : 'Rival por confirmar'}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <h2 className="font-brand-heading text-xl text-foreground">Detalles del desafio</h2>
            </div>

            <div className="space-y-4">
              {/* Description */}
              <div className="space-y-2">
                <Label className="text-foreground">Mensaje (opcional)</Label>
                <Textarea
                  placeholder="Ej: Los esperamos, vengan preparados..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none"
                  rows={2}
                />
              </div>

              <CanchaLugarSelect
                label={
                  <>
                    <MapPin className="w-4 h-4 text-primary" />
                    Cancha propuesta
                  </>
                }
                sportsVenues={sportsVenuesFromDb}
                linkedVenueId={linkedVenueId}
                venue={formData.venue}
                onVenueChange={({ linkedVenueId: id, venue, city }) => {
                  setLinkedVenueId(id)
                  setBookCourtSlot(false)
                  setBookingNoCourt(false)
                  setFormData((f) => ({
                    ...f,
                    venue,
                    ...(city !== undefined ? { location: city } : {}),
                  }))
                }}
              />

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Fecha
                  </Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => {
                      setBookingNoCourt(false)
                      setFormData({ ...formData, date: e.target.value })
                    }}
                    className="h-12 bg-secondary border-border text-foreground"
                  />
                </div>
                <HoraSlotSelect
                  value={formData.time}
                  onValueChange={(time) => {
                    setBookingNoCourt(false)
                    setFormData({ ...formData, time })
                  }}
                  options={
                    linkedVenueId && formData.date
                      ? venueTimeOptions ?? []
                      : TIME_SLOT_OPTIONS
                  }
                  loading={linkedVenueId !== null && formData.date !== '' && loadingVenueTimes}
                  helperText={
                    linkedVenueId && formData.date ? venueTimeHelp : null
                  }
                />
              </div>
              {shouldSuggestAlternatives &&
              linkedVenueId &&
              formData.date &&
              formData.time ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-sm text-foreground font-medium">
                    {bookingNoCourt
                      ? `Se ocupó justo el último cupo a las ${labelForHm(
                          formData.time
                        )}.`
                      : `Este centro no tiene cupo a las ${labelForHm(
                          formData.time
                        )}.`}
                  </p>
                  {loadingAlternativeVenues ? (
                    <p className="text-xs text-muted-foreground">
                      Buscando otros centros con ese horario…
                    </p>
                  ) : alternativeVenues.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {alternativeVenues.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className="px-3 py-1.5 rounded-full text-xs border border-border bg-card hover:border-primary/40"
                          onClick={() => {
                            setLinkedVenueId(v.id)
                            setBookCourtSlot(true)
                            setBookingNoCourt(false)
                            setFormData((prev) => ({
                              ...prev,
                              venue: v.name,
                              location: v.city,
                            }))
                          }}
                        >
                          {v.name} — {v.city}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No encontramos otros centros disponibles para ese horario.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Star className="w-4 h-4 text-primary" />
                  Nivel del partido
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, level: lvl.value })}
                      className={`p-3 rounded-xl border-2 transition-all text-center ${
                        formData.level === lvl.value
                          ? 'border-red-500 bg-red-500/10'
                          : 'border-border bg-secondary hover:border-muted-foreground'
                      }`}
                    >
                      <span
                        className={`font-medium text-sm ${
                          formData.level === lvl.value ? 'text-red-400' : 'text-foreground'
                        }`}
                      >
                        {lvl.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={
                isPublishing ||
                !formData.venue ||
                !formData.date ||
                !formData.time ||
                !selectedVenueHasChosenTime ||
                bookingNoCourt
              }
              aria-busy={isPublishing}
              className="w-full h-14 mt-4 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              {isPublishing ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" aria-hidden />
              ) : (
                <Swords className="w-5 h-5 mr-2" />
              )}
              {isPublishing
                ? 'Publicando…'
                : rivalMode === 'direct'
                  ? 'Enviar desafío'
                  : 'Publicar búsqueda de rival'}
            </Button>
          </div>
        )}

        {/* Step 2: buscar jugadores — cantidad */}
        {step === 2 && matchType === 'players' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-brand-heading text-2xl text-foreground">
                ¿Cuántos jugadores necesitas?
              </h2>
              <p className="text-sm text-muted-foreground">
                Solo cuentan quienes se sumen a la búsqueda; tú no ocupas cupo.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Cantidad
              </Label>
              <div className="flex items-center justify-center gap-4 py-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      playersNeeded: Math.max(1, formData.playersNeeded - 1),
                    })
                  }
                  className="border-border h-12 w-12"
                >
                  -
                </Button>
                <span className="font-brand-heading text-3xl text-foreground w-14 text-center">
                  {formData.playersNeeded}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      playersNeeded: Math.min(12, formData.playersNeeded + 1),
                    })
                  }
                  className="border-border h-12 w-12"
                >
                  +
                </Button>
              </div>
            </div>
            <Button
              onClick={() => setStep(3)}
              className="w-full h-14 mt-6 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Continuar
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 3: buscar jugadores — tipo de cupos */}
        {step === 3 && matchType === 'players' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-brand-heading text-2xl text-foreground">
                ¿Qué te falta completar?
              </h2>
              <p className="text-sm text-muted-foreground">
                Necesitas {formData.playersNeeded}{' '}
                {formData.playersNeeded === 1 ? 'jugador' : 'jugadores'} en total.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {(
                [
                  ['gk_only', 'Solo arquero(s)', 'Buscan uno o más arqueros.'] as const,
                  [
                    'field_only',
                    'Solo jugadores de campo',
                    'No necesitan arquero en esta búsqueda.',
                  ] as const,
                  [
                    'gk_and_field',
                    'Arquero y jugadores de campo',
                    'Máximo 1 arquero y el resto de campo.',
                  ] as const,
                ] as const
              ).map(([value, title, desc]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPlayersSeekProfile(value)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    playersSeekProfile === value
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:border-primary/40'
                  }`}
                >
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </button>
              ))}
            </div>
            <Button
              onClick={() => setStep(4)}
              disabled={!playersSeekProfile}
              className="w-full h-14 mt-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Continuar al formulario
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* Formulario: revuelta (paso 2) o buscar jugadores (paso 4) */}
        {showCasualForm && matchType && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-brand-heading text-xl text-foreground">
                {matchType === 'players' && 'Detalles de la busqueda'}
                {matchType === 'open' && 'Detalles de la revuelta'}
                {(matchType === 'team_pick_public' ||
                  matchType === 'team_pick_private') &&
                  'Selección de equipos — detalles del partido'}
              </h2>
            </div>

            <div className="space-y-4">
              {/* Title/description full only for revuelta */}
              {matchType === 'open' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-foreground">Titulo</Label>
                    <Input
                      placeholder="Ej: Partido domingo en la tarde"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Descripcion (opcional)</Label>
                    <Textarea
                      placeholder="Agrega mas detalles..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none"
                      rows={3}
                    />
                  </div>
                  {getUserTeams().length > 0 && (
                    <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Label htmlFor="private-rev" className="text-foreground">
                            Juega una Revuelta con los integrantes de tu equipo (partido privado)
                          </Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Juega junto a tus amigos miembros de tu equipo un partido
                            amistoso tipo revuelta. Si faltan jugadores, jugadores externos
                            podrán solicitar unirse al partido y tú, como organizador,
                            serás quien decida si aceptas o rechazas a estos jugadores.
                          </p>
                        </div>
                        <Switch
                          id="private-rev"
                          checked={!!privateRevueltaTeamId}
                          onCheckedChange={(on) => {
                            if (!on) setPrivateRevueltaTeamId(null)
                            else {
                              const ut = getUserTeams()
                              setPrivateRevueltaTeamId(ut[0]?.id ?? null)
                            }
                          }}
                        />
                      </div>
                      {privateRevueltaTeamId ? (
                        <div className="space-y-2">
                          <Label className="text-foreground">Equipo</Label>
                          <Select
                            value={privateRevueltaTeamId}
                            onValueChange={(v) => setPrivateRevueltaTeamId(v)}
                          >
                            <SelectTrigger className="h-12 bg-secondary border-border">
                              <SelectValue placeholder="Elige equipo" />
                            </SelectTrigger>
                            <SelectContent>
                              {getUserTeams().map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}

              {(matchType === 'team_pick_public' ||
                matchType === 'team_pick_private') && (
                <>
                  <p className="text-sm text-muted-foreground text-center leading-relaxed">
                    {matchType === 'team_pick_public'
                      ? 'Los jugadores eligen equipo A o B y su rol (arquero o línea). Máximo 6 por equipo.'
                      : 'Solo quien tenga el código de 4 dígitos podrá unirse. Te lo mostraremos al publicar.'}
                  </p>
                  <div className="space-y-2">
                    <Label className="text-foreground">Título (opcional)</Label>
                    <Input
                      placeholder="Ej: 6vs6 sábado en la tarde"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      className="h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Descripción (opcional)</Label>
                    <Textarea
                      placeholder="Reglas, pelota, vestimenta…"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      Tu rol (organizás en equipo A)
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ['gk', 'Arquero'],
                          ['defensa', 'Defensa'],
                          ['mediocampista', 'Mediocampista'],
                          ['delantero', 'Delantero'],
                        ] as const
                      ).map(([value, label]) => (
                        <Button
                          key={value}
                          type="button"
                          variant={teamPickCreatorRole === value ? 'default' : 'outline'}
                          className="h-11 text-sm"
                          onClick={() => setTeamPickCreatorRole(value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Color de equipo</Label>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <TeamPickJerseyColorPicker
                        label="Equipo A"
                        value={teamPickColorA}
                        fallbackHex={DEFAULT_TEAM_PICK_COLOR_A}
                        onChange={setTeamPickColorA}
                      />
                      <TeamPickJerseyColorPicker
                        label="Equipo B"
                        value={teamPickColorB}
                        fallbackHex={DEFAULT_TEAM_PICK_COLOR_B}
                        onChange={setTeamPickColorB}
                      />
                    </div>
                  </div>
                </>
              )}

              {matchType === 'players' && (
                <div className="space-y-2">
                  <Label className="text-foreground">Resumen</Label>
                  <p className="text-sm text-muted-foreground rounded-lg border border-border bg-secondary/30 px-3 py-2">
                    Publicaremos una búsqueda rápida con cancha, fecha, hora y cupos faltantes.
                  </p>
                </div>
              )}

              {matchType === 'players' && (
                <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="text-foreground font-medium">
                      {formData.playersNeeded}
                    </span>{' '}
                    {formData.playersNeeded === 1 ? 'cupo' : 'cupos'} ·{' '}
                    {playersSeekProfile === 'gk_only' && 'Solo arquero(s)'}
                    {playersSeekProfile === 'field_only' && 'Solo jugadores de campo'}
                    {playersSeekProfile === 'gk_and_field' &&
                      'Arquero (máx. 1) + jugadores de campo'}
                  </p>
                </div>
              )}

              {/* Jugadores necesarios solo revuelta (open) */}
              {matchType === 'open' && (
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Jugadores necesarios
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Total en cancha (incluye tu cupo como organizador). Mín. 10 · Máx. 12.
                  </p>
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          playersNeeded: Math.max(
                            10,
                            formData.playersNeeded - 1
                          ),
                        })
                      }
                      className="border-border"
                    >
                      -
                    </Button>
                    <span className="font-brand-heading text-2xl text-foreground w-12 text-center">
                      {formData.playersNeeded}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          playersNeeded: Math.min(12, formData.playersNeeded + 1),
                        })
                      }
                      className="border-border"
                    >
                      +
                    </Button>
                  </div>
                </div>
              )}

              {matchType === 'open' && (
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Tu rol en la revuelta
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={!creatorIsGoalkeeper ? 'default' : 'outline'}
                      className="flex-1 h-11"
                      onClick={() => setCreatorIsGoalkeeper(false)}
                    >
                      Jugador de campo
                    </Button>
                    <Button
                      type="button"
                      variant={creatorIsGoalkeeper ? 'default' : 'outline'}
                      className="flex-1 h-11"
                      onClick={() => setCreatorIsGoalkeeper(true)}
                    >
                      Arquero
                    </Button>
                  </div>
                </div>
              )}

              <CanchaLugarSelect
                label={
                  <>
                    <MapPin className="w-4 h-4 text-primary" />
                    Cancha / Lugar
                  </>
                }
                sportsVenues={sportsVenuesFromDb}
                linkedVenueId={linkedVenueId}
                venue={formData.venue}
                onVenueChange={({ linkedVenueId: id, venue, city }) => {
                  setLinkedVenueId(id)
                  setBookCourtSlot(!!id)
                  setBookingNoCourt(false)
                  setFormData((f) => ({
                    ...f,
                    venue,
                    ...(city !== undefined ? { location: city } : {}),
                  }))
                }}
              />
              {linkedVenueId && bookCourtSlot && venuePricingHintText ? (
                <div className="rounded-lg border border-emerald-700/25 bg-emerald-500/[0.12] px-3 py-2.5 text-xs leading-relaxed text-emerald-950 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-50">
                  {venuePricingHintText}
                </div>
              ) : null}

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Fecha
                  </Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => {
                      setBookingNoCourt(false)
                      setFormData({ ...formData, date: e.target.value })
                    }}
                    className="h-12 bg-secondary border-border text-foreground"
                  />
                </div>
                <HoraSlotSelect
                  value={formData.time}
                  onValueChange={(time) => {
                    setBookingNoCourt(false)
                    setFormData({ ...formData, time })
                  }}
                  options={
                    linkedVenueId && formData.date
                      ? venueTimeOptions ?? []
                      : TIME_SLOT_OPTIONS
                  }
                  loading={linkedVenueId !== null && formData.date !== '' && loadingVenueTimes}
                  helperText={
                    linkedVenueId && formData.date ? venueTimeHelp : null
                  }
                />
              </div>
              {shouldSuggestAlternatives &&
              linkedVenueId &&
              formData.date &&
              formData.time ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-sm text-foreground font-medium">
                    {bookingNoCourt
                      ? `Se ocupó justo el último cupo a las ${labelForHm(
                          formData.time
                        )}.`
                      : `Este centro no tiene cupo a las ${labelForHm(
                          formData.time
                        )}.`}
                  </p>
                  {loadingAlternativeVenues ? (
                    <p className="text-xs text-muted-foreground">
                      Buscando otros centros con ese horario…
                    </p>
                  ) : alternativeVenues.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {alternativeVenues.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className="px-3 py-1.5 rounded-full text-xs border border-border bg-card hover:border-primary/40"
                          onClick={() => {
                            setLinkedVenueId(v.id)
                            setBookCourtSlot(true)
                            setBookingNoCourt(false)
                            setFormData((prev) => ({
                              ...prev,
                              venue: v.name,
                              location: v.city,
                            }))
                          }}
                        >
                          {v.name} — {v.city}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No encontramos otros centros disponibles para ese horario.
                    </p>
                  )}
                </div>
              ) : null}

              {(matchType === 'open' ||
                matchType === 'team_pick_public' ||
                matchType === 'team_pick_private') && (
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    Nivel
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {LEVELS.map((lvl) => (
                      <button
                        key={lvl.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, level: lvl.value })}
                        className={`p-3 rounded-xl border-2 transition-all text-center ${
                          formData.level === lvl.value
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-secondary hover:border-muted-foreground'
                        }`}
                      >
                        <span className={`font-medium text-sm ${
                          formData.level === lvl.value ? 'text-primary' : 'text-foreground'
                        }`}>
                          {lvl.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={
                isPublishing ||
                !formData.venue ||
                !formData.date ||
                !formData.time ||
                !selectedVenueHasChosenTime ||
                bookingNoCourt
              }
              aria-busy={isPublishing}
              className="w-full h-14 mt-4 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin shrink-0" aria-hidden />
                  Publicando…
                </>
              ) : matchType === 'players' ? (
                'Publicar búsqueda rápida'
              ) : matchType === 'team_pick_public' || matchType === 'team_pick_private' ? (
                'Publicar selección de equipos'
              ) : (
                'Publicar'
              )}
            </Button>
          </div>
        )}

        {showReserveForm && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-brand-heading text-xl text-foreground">Reserva rápida</h2>
              <p className="text-sm text-muted-foreground">
                Reserva una cancha sin crear partido.
              </p>
            </div>
            <div className="space-y-4">
              <CanchaLugarSelect
                label={
                  <>
                    <MapPin className="w-4 h-4 text-primary" />
                    Centro deportivo
                  </>
                }
                sportsVenues={sportsVenuesFromDb}
                linkedVenueId={linkedVenueId}
                venue={formData.venue}
                onVenueChange={({ linkedVenueId: id, venue, city }) => {
                  setLinkedVenueId(id)
                  setBookCourtSlot(true)
                  setBookingNoCourt(false)
                  setFormData((f) => ({
                    ...f,
                    venue,
                    ...(city !== undefined ? { location: city } : {}),
                  }))
                }}
              />
              {linkedVenueId && venuePricingHintText ? (
                <div className="rounded-lg border border-emerald-700/25 bg-emerald-500/[0.12] px-3 py-2.5 text-xs leading-relaxed text-emerald-950 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-50">
                  {venuePricingHintText}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Fecha
                  </Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => {
                      setBookingNoCourt(false)
                      setFormData({ ...formData, date: e.target.value })
                    }}
                    className="h-12 bg-secondary border-border text-foreground"
                  />
                </div>
                <HoraSlotSelect
                  value={formData.time}
                  onValueChange={(time) => {
                    setBookingNoCourt(false)
                    setFormData({ ...formData, time })
                  }}
                  options={
                    linkedVenueId && formData.date
                      ? venueTimeOptions ?? []
                      : TIME_SLOT_OPTIONS
                  }
                  loading={linkedVenueId !== null && formData.date !== '' && loadingVenueTimes}
                  helperText={linkedVenueId && formData.date ? venueTimeHelp : null}
                />
              </div>
              {shouldSuggestAlternatives &&
              linkedVenueId &&
              formData.date &&
              formData.time ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-sm text-foreground font-medium">
                    {bookingNoCourt
                      ? `Se ocupó justo el último cupo a las ${labelForHm(formData.time)}.`
                      : `Este centro no tiene cupo a las ${labelForHm(formData.time)}.`}
                  </p>
                  {loadingAlternativeVenues ? (
                    <p className="text-xs text-muted-foreground">
                      Buscando otros centros con ese horario…
                    </p>
                  ) : alternativeVenues.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {alternativeVenues.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className="px-3 py-1.5 rounded-full text-xs border border-border bg-card hover:border-primary/40"
                          onClick={() => {
                            setLinkedVenueId(v.id)
                            setBookingNoCourt(false)
                            setFormData((prev) => ({
                              ...prev,
                              venue: v.name,
                              location: v.city,
                            }))
                          }}
                        >
                          {v.name} — {v.city}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No encontramos otros centros disponibles para ese horario.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={
                isPublishing ||
                !linkedVenueId ||
                !formData.date ||
                !formData.time ||
                !selectedVenueHasChosenTime ||
                bookingNoCourt
              }
              aria-busy={isPublishing}
              className="w-full h-14 mt-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin shrink-0" aria-hidden />
                  Reservando…
                </>
              ) : (
                'Reservar cancha'
              )}
            </Button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

const CANCHA_DB_PREFIX = 'db:'

function canchaSelectValue(
  linkedVenueId: string | null,
  venue: string,
  sportsVenues: SportsVenue[]
): string | undefined {
  if (linkedVenueId) return `${CANCHA_DB_PREFIX}${linkedVenueId}`
  const byName = sportsVenues.find((v) => v.name === venue)
  if (byName) return `${CANCHA_DB_PREFIX}${byName.id}`
  return undefined
}

function CanchaLugarSelect({
  label,
  sportsVenues,
  linkedVenueId,
  venue,
  onVenueChange,
}: {
  label: ReactNode
  sportsVenues: SportsVenue[]
  linkedVenueId: string | null
  venue: string
  onVenueChange: (p: {
    linkedVenueId: string | null
    venue: string
    city?: string
  }) => void
}) {
  const selectValue = canchaSelectValue(linkedVenueId, venue, sportsVenues)

  return (
    <div className="space-y-2">
      <Label className="text-foreground flex items-center gap-2">{label}</Label>
      {sportsVenues.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-3">
          No hay centros deportivos registrados en la app. Cuando un centro se
          dé de alta, aparecerá aquí.
        </p>
      ) : (
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (!v.startsWith(CANCHA_DB_PREFIX)) return
            const id = v.slice(CANCHA_DB_PREFIX.length)
            const sv = sportsVenues.find((x) => x.id === id)
            if (!sv) return
            onVenueChange({
              linkedVenueId: id,
              venue: sv.name,
              city: sv.city,
            })
          }}
        >
          <SelectTrigger className="w-full h-12 bg-secondary border-border text-foreground">
            <SelectValue placeholder="Selecciona un centro deportivo" />
          </SelectTrigger>
          <SelectContent className="max-h-[min(24rem,var(--radix-select-content-available-height))]">
            {sportsVenues.map((sv) => (
              <SelectItem key={sv.id} value={`${CANCHA_DB_PREFIX}${sv.id}`}>
                {sv.name} — {sv.city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function HoraSlotSelect({
  value,
  onValueChange,
  options,
  loading,
  helperText,
}: {
  value: string
  onValueChange: (time: string) => void
  options: Array<{ value: string; label: string }>
  loading?: boolean
  helperText?: string | null
}) {
  return (
    <div className="space-y-2">
      <Label className="text-foreground flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        Hora
      </Label>
      <Select
        value={value || undefined}
        onValueChange={onValueChange}
        disabled={loading || options.length === 0}
      >
        <SelectTrigger className="w-full h-12 bg-secondary border-border text-foreground">
          <SelectValue
            placeholder={loading ? 'Buscando horarios…' : 'Selecciona la hora'}
          />
        </SelectTrigger>
        <SelectContent>
          {options.map(({ value: v, label }) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helperText ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  )
}

function TypeCard({
  icon,
  title,
  description,
  selected,
  onClick,
  color,
  disabled = false,
  unavailableLabel,
}: {
  icon: ReactNode
  title: string
  description: string
  selected: boolean
  onClick: () => void
  color: 'red' | 'green' | 'gold'
  disabled?: boolean
  unavailableLabel?: string
}) {
  const colorClasses = {
    red: selected ? 'border-red-500 bg-red-500/10' : 'border-border hover:border-red-500/50',
    green: selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
    gold: selected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50',
  }

  const iconColors = {
    red: 'text-red-400',
    green: 'text-primary',
    gold: 'text-accent',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`w-full p-6 rounded-2xl border-2 transition-all flex items-center gap-4 ${colorClasses[color]} ${
        disabled
          ? 'cursor-not-allowed opacity-75 saturate-50 hover:border-border'
          : ''
      }`}
    >
      <div className={`p-3 rounded-xl ${
        color === 'red' ? 'bg-red-500/20' :
        color === 'green' ? 'bg-primary/20' :
        'bg-accent/20'
      }`}>
        <span className={iconColors[color]}>{icon}</span>
      </div>
      <div className="text-left flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-brand-heading text-lg text-foreground">{title}</h3>
          {disabled && unavailableLabel ? (
            <Badge
              variant="outline"
              className="border-amber-500/45 bg-amber-500/10 text-amber-300"
            >
              {unavailableLabel}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
        selected ? `border-${color === 'gold' ? 'accent' : color === 'green' ? 'primary' : 'red-500'} bg-${color === 'gold' ? 'accent' : color === 'green' ? 'primary' : 'red-500'}` : 'border-border'
      }`}>
        {selected && <div className="w-2.5 h-2.5 rounded-full bg-background" />}
      </div>
    </button>
  )
}
