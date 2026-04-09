'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppContextType } from '@/lib/app-context-contract'
import {
  type AppScreen,
  PLAYER_NAV_SCREENS,
} from '@/lib/app-context-contract'
import {
  AppDomainProviders,
  useComposedAppContext,
} from '@/lib/contexts/domain-contexts'
import { useStableCallback } from '@/lib/hooks/use-stable-callback'
import { toast } from 'sonner'
import {
  MatchOpportunity,
  MatchesHubTab,
  OnboardingData,
  VenueOnboardingData,
  Gender,
  Level,
  RivalChallenge,
  RevueltaResult,
  RivalResult,
  Team,
  TeamInvite,
  TeamJoinRequest,
  TeamPrivateSettings,
  User,
} from './types'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { getPublicSiteOrigin } from '@/lib/site-url'
import {
  mapMatchOpportunityFromDb,
  DEFAULT_AVATAR,
  type MatchOpportunityRow,
} from '@/lib/supabase/mappers'
import { formatAuthError } from '@/lib/supabase/auth-errors'
import { payOrganizerToastMessage } from '@/lib/court-pricing'
import { teamIsInPlayerGeo } from '@/lib/team-geo-filter'
import {
  MATCH_OPPORTUNITY_SELECT_WITH_GEO,
  TEAM_SELECT_WITH_GEO,
  fetchDefaultCityId,
  resolveCityIdFromLabel,
} from '@/lib/supabase/geo-queries'
import { TEAM_ROSTER_MAX } from '@/lib/team-roster'
import {
  userIsConfirmedMemberOfTeam,
  userIsTeamStaffCaptain,
} from '@/lib/team-membership'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import {
  capturePrefillCreateQuery,
  tryNavigateCreateAfterPlayerReady,
} from '@/lib/create-prefill'
import { buildRandomRevueltaLineup } from '@/lib/revuelta-lineup'
import { playersJoinRules } from '@/lib/players-seek-profile'
import {
  uploadProfileAvatarFile,
  cacheBustPublicUrl,
} from '@/lib/supabase/profile-photo'
import {
  persistPlayerLastNav,
  type PlayerNavId,
} from '@/lib/player-nav-storage'
import {
  computeAgeFromBirthDate,
  isValidPlayerAgeFromBirthDate,
  parseBirthDateLocal,
} from '@/lib/age-birthday'
import { isValidFullPlayerWhatsapp } from '@/lib/player-whatsapp'
import {
  getAuthUserEmail,
  isTeamLimitReached,
  isUserReadOnly,
  needsOnboardingProfile,
  toastReadOnly,
  toastTeamLimitReached,
} from '@/lib/core/auth-store'
import {
  captureInviteParamsFromUrl,
  clearSessionNavigationState,
  consumePendingPlayerDeepLink,
  consumeScreenQueryParam,
  resolvePlayerScreenFromQuery,
  shouldOpenAuthFromRegisterInvite,
} from '@/lib/core/navigation-store'
import { usePlayerRealtimeManager } from '@/lib/core/realtime-manager'
import {
  fetchLatestMatchOpportunities,
  loadPlayerMatchBundle,
} from '@/lib/services/match.service'
import {
  fetchLatestTeams,
  fetchLatestTeamInvitesForUser,
  fetchLatestTeamJoinRequestsForUser,
  saveTeamPrivateSettings,
  loadPlayerTeamBundle,
  loadPlayerTeamsAndInvites,
} from '@/lib/services/team.service'
import { loadOtherPlayersForUser, loadProfileForUser } from '@/lib/services/user.service'
import { loadVenueForOwner } from '@/lib/services/venue.service'
import {
  resetPresenceDebounceState,
  updateLastSeen,
} from '@/lib/services/presence.service'

export function AppProvider({ children }: { children: ReactNode }) {
  const [authLoading, setAuthLoading] = useState(true)
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('landing')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [profilePhotoCacheBust, setProfilePhotoCacheBust] = useState(0)
  const [profilePhotoEpochByUser, setProfilePhotoEpochByUser] = useState<
    Record<string, number>
  >({})
  const [profilesRealtimeGeneration, setProfilesRealtimeGeneration] = useState(0)
  const [matchOpportunities, setMatchOpportunities] = useState<
    MatchOpportunity[]
  >([])
  const [users, setUsers] = useState<User[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([])
  const [teamJoinRequests, setTeamJoinRequests] = useState<TeamJoinRequest[]>(
    []
  )
  const [rivalChallenges, setRivalChallenges] = useState<RivalChallenge[]>([])
  const [participatingOpportunityIds, setParticipatingOpportunityIds] = useState<
    string[]
  >([])
  const [selectedChatOpportunityId, setSelectedChatOpportunityId] = useState<
    string | null
  >(null)
  const [selectedMatchOpportunityId, setSelectedMatchOpportunityId] = useState<
    string | null
  >(null)
  const [publicProfileUserId, setPublicProfileUserId] = useState<string | null>(
    null
  )
  const [initialMatchesTab, setInitialMatchesTab] =
    useState<MatchesHubTab | null>(null)
  const [teamsDetailFocusTeamId, setTeamsDetailFocusTeamId] = useState<
    string | null
  >(null)
  const [onboardingSource, setOnboardingSource] = useState<
    'registration' | 'profile_edit'
  >('registration')

  const isAuthenticated = currentUser !== null

  const currentUserRef = useRef<User | null>(null)
  currentUserRef.current = currentUser

  const profilePhotoCacheBustRef = useRef(0)
  profilePhotoCacheBustRef.current = profilePhotoCacheBust
  const profilePhotoEpochByUserRef = useRef<Record<string, number>>({})
  profilePhotoEpochByUserRef.current = profilePhotoEpochByUser

  const openProfileEditor = useCallback(() => {
    setOnboardingSource('profile_edit')
    setCurrentScreen('onboarding')
  }, [])

  const bumpProfilePhotoCache = useCallback(() => {
    setProfilePhotoCacheBust((n) => n + 1)
  }, [])

  /** Identidad estable; lee bust/epoch/user actuales vía refs (menos invalidación de contextos). */
  const avatarDisplayUrl = useStableCallback(
    (url: string | null | undefined, userId?: string | null) => {
      const raw = url?.trim()
      if (!raw) return DEFAULT_AVATAR
      if (raw === DEFAULT_AVATAR) return DEFAULT_AVATAR
      let v = 0
      const selfId = currentUserRef.current?.id
      if (userId && selfId === userId) {
        v += profilePhotoCacheBustRef.current
      }
      if (userId) {
        v += profilePhotoEpochByUserRef.current[userId] ?? 0
      }
      return cacheBustPublicUrl(raw, v)
    }
  )

  const updateProfilePhoto = useStableCallback(async (file: File) => {
    const u = currentUserRef.current
    if (!u || !isSupabaseConfigured()) {
      return { ok: false, error: 'Sesión no disponible.' }
    }
    const supabase = getBrowserSupabase()
    if (!supabase) {
      return { ok: false, error: 'Cliente no disponible.' }
    }
    const up = await uploadProfileAvatarFile(supabase, u.id, file)
    if ('error' in up) {
      toast.error(up.error)
      return { ok: false, error: up.error }
    }
    const { error } = await supabase
      .from('profiles')
      .update({ photo_url: up.publicUrl })
      .eq('id', u.id)
    if (error) {
      toast.error(error.message)
      return { ok: false, error: error.message }
    }
    setCurrentUser({
      ...u,
      photo: up.publicUrl,
    })
    bumpProfilePhotoCache()
    toast.success('Foto de perfil actualizada')
    return { ok: true }
  })

  const login = useStableCallback(async (
    email: string,
    password: string,
    isSignUp: boolean
  ): Promise<{
    ok: boolean
    error?: string
    needsOnboarding?: boolean
    needsVenueOnboarding?: boolean
    isVenue?: boolean
    isAdmin?: boolean
  }> => {
    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        error:
          'Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local',
      }
    }
    try {
      const supabase = getBrowserSupabase()
      if (!supabase) {
        return { ok: false, error: 'Cliente no disponible.' }
      }
      const emailTrimmed = email.trim()
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
        })
        if (error) return { ok: false, error: formatAuthError(error) }
        if (data.user && !data.session) {
          return {
            ok: false,
            error:
              'Revisa tu correo para confirmar la cuenta antes de iniciar sesión.',
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        })
        if (error) return { ok: false, error: formatAuthError(error) }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.email) {
        return { ok: false, error: 'No se pudo obtener la sesión.' }
      }

      const profile = await loadProfileForUser(supabase, user.id, user.email)
      if (!profile) {
        return { ok: false, error: 'No se encontró el perfil.' }
      }

      setCurrentUser(profile)

      if (profile.accountType === 'admin') {
        setMatchOpportunities([])
        setUsers([])
        setTeams([])
        setTeamInvites([])
        setTeamJoinRequests([])
        setParticipatingOpportunityIds([])
        setRivalChallenges([])
        return {
          ok: true,
          needsOnboarding: false,
          isVenue: false,
          isAdmin: true,
        }
      }

      if (profile.accountType === 'venue') {
        setMatchOpportunities([])
        setUsers([])
        setTeams([])
        setTeamInvites([])
        setTeamJoinRequests([])
        setParticipatingOpportunityIds([])
        setRivalChallenges([])
        const venueRow = await loadVenueForOwner(supabase, user.id)
        return {
          ok: true,
          needsOnboarding: false,
          needsVenueOnboarding: !venueRow,
          isVenue: true,
        }
      }

      const [matchBundle, teamBundle, others] = await Promise.all([
        loadPlayerMatchBundle(supabase, user.id),
        loadPlayerTeamBundle(supabase, user.id),
        loadOtherPlayersForUser(supabase, user.id, profile.gender),
      ])
      setMatchOpportunities(matchBundle.matchOpportunities)
      setUsers(others)
      setTeams(teamBundle.teams)
      setTeamInvites(teamBundle.teamInvites)
      setTeamJoinRequests(teamBundle.teamJoinRequests)
      setParticipatingOpportunityIds(matchBundle.participatingOpportunityIds)
      setRivalChallenges(matchBundle.rivalChallenges)

      return {
        ok: true,
        needsOnboarding: needsOnboardingProfile(profile),
        isVenue: false,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de conexión'
      return { ok: false, error: msg }
    }
  })

  const loginWithGoogle = useCallback(async (): Promise<{
    ok: boolean
    error?: string
  }> => {
    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        error:
          'Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local',
      }
    }
    try {
      const supabase = getBrowserSupabase()
      if (!supabase) {
        return { ok: false, error: 'Cliente no disponible.' }
      }
      const origin = getPublicSiteOrigin()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/`,
        },
      })
      if (error) return { ok: false, error: formatAuthError(error) }
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de conexión'
      return { ok: false, error: msg }
    }
  }, [])

  const logout = useStableCallback(async () => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getBrowserSupabase()
        if (!supabase) return
        await supabase.auth.signOut()
      }
    } catch {
      // ignorar
    }
    try {
      clearSessionNavigationState()
    } catch {}
    setCurrentUser(null)
    setProfilePhotoCacheBust(0)
    setProfilePhotoEpochByUser({})
    setProfilesRealtimeGeneration(0)
    setUsers([])
    setMatchOpportunities([])
    setTeams([])
    setTeamInvites([])
    setTeamJoinRequests([])
    setRivalChallenges([])
    setParticipatingOpportunityIds([])
    setSelectedChatOpportunityId(null)
    setTeamsDetailFocusTeamId(null)
    setCurrentScreen('landing')
  })

  const completeOnboarding = useStableCallback(async (data: OnboardingData) => {
    if (!currentUser || !isSupabaseConfigured()) return
    if (currentUser.accountType !== 'player') return
    const photo = data.photo?.trim()
    if (!photo || photo === DEFAULT_AVATAR) {
      toast.error('Debes subir una foto de perfil para continuar.')
      return
    }
    if (!data.birthDate || !isValidPlayerAgeFromBirthDate(data.birthDate)) {
      toast.error(
        'La fecha de nacimiento debe corresponder a una edad entre 17 y 60 años.'
      )
      return
    }
    const waTrim = data.whatsappPhone.trim()
    if (!isValidFullPlayerWhatsapp(waTrim)) {
      toast.error(
        'WhatsApp debe ser chileno: +569 y 8 dígitos (completa el número en tu perfil).'
      )
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const birth = parseBirthDateLocal(data.birthDate)
    let nextCityId = data.cityId?.trim()
      ? data.cityId.trim()
      : (await resolveCityIdFromLabel(supabase, data.city)) ?? currentUser.cityId
    const { error } = await supabase
      .from('profiles')
      .update({
        name: data.name,
        birth_date: data.birthDate,
        ...(onboardingSource === 'profile_edit'
          ? {}
          : { gender: data.gender }),
        whatsapp_phone: waTrim,
        position: data.position,
        level: data.level,
        city: data.city,
        city_id: nextCityId,
        availability: data.availability,
        photo_url: photo,
        player_essentials_completed_at: new Date().toISOString(),
      })
      .eq('id', currentUser.id)

    if (error) {
      toast.error(error.message)
      return
    }

    void updateLastSeen(supabase, currentUser.id, { force: true })

    const refreshed = await loadProfileForUser(
      supabase,
      currentUser.id,
      currentUser.email
    )
    if (refreshed) {
      setCurrentUser(refreshed)
    } else {
      setCurrentUser({
        ...currentUser,
        name: data.name,
        birthDate: birth,
        age: computeAgeFromBirthDate(birth),
        gender:
          onboardingSource === 'profile_edit' ? currentUser.gender : data.gender,
        position: data.position,
        level: data.level,
        city: data.city,
        cityId: nextCityId,
        availability: data.availability,
        whatsappPhone: waTrim,
        photo,
        playerEssentialsCompletedAt: new Date(),
        email: currentUser.email,
        createdAt: currentUser.createdAt,
      })
    }
    if (onboardingSource === 'profile_edit') {
      setOnboardingSource('registration')
      toast.success('Perfil actualizado')
      setCurrentScreen('profile')
    } else {
      if (tryNavigateCreateAfterPlayerReady()) {
        setCurrentScreen('create')
      } else {
        setCurrentScreen('home')
      }
    }
  })

  const completeVenueOnboarding = useStableCallback(async (data: VenueOnboardingData) => {
    if (!currentUser || !isSupabaseConfigured()) return
    if (currentUser.accountType !== 'venue') return
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const existing = await loadVenueForOwner(supabase, currentUser.id)
    if (existing) {
      setCurrentScreen('venueDashboard')
      return
    }
    const slot = Math.min(
      180,
      Math.max(15, Math.round(data.slotDurationMinutes) || 60)
    )
    let venueCityId = data.cityId.trim()
    if (!venueCityId) {
      venueCityId = (await fetchDefaultCityId(supabase)) ?? ''
    }
    if (!venueCityId) {
      toast.error('No se pudo determinar la ciudad. Espera un momento e intenta de nuevo.')
      return
    }
    const { error: insErr } = await supabase.from('sports_venues').insert({
      owner_id: currentUser.id,
      name: data.name.trim(),
      address: data.address.trim(),
      phone: data.phone.trim(),
      city: data.city.trim() || 'Rancagua',
      city_id: venueCityId,
      maps_url: data.mapsUrl?.trim() || null,
      slot_duration_minutes: slot,
      is_paused: false,
    })
    if (insErr) {
      toast.error(insErr.message)
      return
    }
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ name: data.name.trim() })
      .eq('id', currentUser.id)
    if (profErr) {
      toast.error(profErr.message)
    }
    setCurrentUser({
      ...currentUser,
      name: data.name.trim(),
    })
    void updateLastSeen(supabase, currentUser.id, { force: true })
    toast.success('Centro creado')
    setCurrentScreen('venueDashboard')
  })

  const addMatchOpportunity = useStableCallback(async (
    m: Omit<MatchOpportunity, 'id' | 'createdAt'> & {
      creatorIsGoalkeeper?: boolean
      bookCourtSlot?: boolean
      courtSlotMinutes?: number
    }
  ): Promise<{ ok: true } | { ok: false; code?: 'no_court'; error: string }> => {
    if (!currentUser || !isSupabaseConfigured()) {
      return { ok: false as const, error: 'Sesión no disponible.' }
    }
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return { ok: false as const, error: ro.reason || 'Cuenta restringida.' }
    }
    if (m.privateRevueltaTeamId) {
      if (m.type !== 'open') {
        return {
          ok: false as const,
          error: 'La revuelta privada solo aplica a partidos tipo revuelta.',
        }
      }
      const tm = teams.find((t) => t.id === m.privateRevueltaTeamId)
      if (!userIsConfirmedMemberOfTeam(tm, currentUser.id)) {
        toast.error('Debés ser miembro del equipo para crear una revuelta privada.')
        return {
          ok: false as const,
          error: 'No eres miembro del equipo seleccionado.',
        }
      }
    }
    const supabase = getBrowserSupabase()
    if (!supabase) {
      return { ok: false as const, error: 'Cliente no disponible.' }
    }
    const cityId = m.cityId || currentUser.cityId
    const { data, error } = await supabase.rpc(
      'create_match_opportunity_with_optional_reservation',
      {
        p_type: m.type,
        p_title: m.title,
        p_description: m.description ?? null,
        p_location: m.location,
        p_venue: m.venue,
        p_city_id: cityId,
        p_date_time: m.dateTime.toISOString(),
        p_level: m.level,
        p_team_name: m.teamName ?? null,
        p_players_needed: m.playersNeeded ?? null,
        p_players_joined: m.playersJoined ?? 0,
        p_players_seek_profile:
          m.type === 'players' && m.playersSeekProfile ? m.playersSeekProfile : null,
        p_gender: m.gender,
        p_status: m.status,
        p_sports_venue_id: m.sportsVenueId ?? null,
        p_book_court_slot: m.bookCourtSlot === true,
        p_court_slot_minutes: m.courtSlotMinutes ?? 60,
        p_private_revuelta_team_id: m.privateRevueltaTeamId ?? null,
        p_creator_is_goalkeeper: m.creatorIsGoalkeeper === true,
      }
    )
    if (error) {
      toast.error(error.message)
      return { ok: false as const, error: error.message }
    }
    const payload = data as
      | { ok?: boolean; error?: string; message?: string }
      | null
      | undefined
    if (!payload?.ok) {
      const code = payload?.error ?? 'unknown'
      if (code === 'no_court') {
        toast.error('No hay cancha libre en ese horario en este centro.')
        return {
          ok: false as const,
          code: 'no_court',
          error: 'No hay cancha libre en ese horario en este centro.',
        }
      }
      const msg =
        typeof payload?.message === 'string' && payload.message.trim()
          ? payload.message
          : 'No se pudo crear el partido.'
      toast.error(msg)
      return { ok: false as const, error: msg }
    }

    const matchBundle = await loadPlayerMatchBundle(supabase, currentUser.id)
    setMatchOpportunities(matchBundle.matchOpportunities)
    setParticipatingOpportunityIds(matchBundle.participatingOpportunityIds)
    void updateLastSeen(supabase, currentUser.id, { force: true })
    return { ok: true as const }
  })

  const reserveVenueOnly = useStableCallback(async ({
    sportsVenueId,
    startsAt,
    durationMinutes,
  }: {
    sportsVenueId: string
    startsAt: Date
    durationMinutes: number
  }): Promise<{ ok: true } | { ok: false; code?: 'no_court'; error: string }> => {
    if (!currentUser || !isSupabaseConfigured()) {
      return { ok: false as const, error: 'Sesión no disponible.' }
    }
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return { ok: false as const, error: ro.reason || 'Cuenta restringida.' }
    }
    const supabase = getBrowserSupabase()
    if (!supabase) {
      return { ok: false as const, error: 'Cliente no disponible.' }
    }
    const end = new Date(startsAt.getTime() + durationMinutes * 60 * 1000)
    const { error } = await supabase.rpc('book_venue_slot', {
      p_venue_id: sportsVenueId,
      p_starts_at: startsAt.toISOString(),
      p_ends_at: end.toISOString(),
    })
    if (error) {
      if (error.message.includes('no_court')) {
        toast.error('No hay cancha libre en ese horario en este centro.')
        return {
          ok: false as const,
          code: 'no_court',
          error: 'No hay cancha libre en ese horario en este centro.',
        }
      }
      toast.error(error.message)
      return { ok: false as const, error: error.message }
    }
    toast.success('Reserva creada en estado pendiente de pago.')
    void updateLastSeen(supabase, currentUser.id, { force: true })
    return { ok: true as const }
  })

  const joinMatchOpportunity = useStableCallback(async (
    opportunityId: string,
    options?: { isGoalkeeper?: boolean }
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const opp = matchOpportunities.find((m) => m.id === opportunityId)
    if (opp?.creatorId === currentUser.id) {
      toast.info('Eres el organizador de este partido.')
      return
    }
    if (participatingOpportunityIds.includes(opportunityId)) {
      toast.info('Ya estás en este partido.')
      return
    }
    if (!opp) {
      toast.error('No encontramos este partido.')
      return
    }

    const supabase = getBrowserSupabase()
    if (!supabase) return
    const isGkRequest = options?.isGoalkeeper === true
    const { data, error } = await supabase.rpc('join_match_opportunity', {
      p_opportunity_id: opportunityId,
      p_is_goalkeeper: isGkRequest,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    const payload = data as
      | { ok?: boolean; error?: string; message?: string }
      | null
      | undefined
    if (!payload?.ok) {
      const code = payload?.error ?? 'unknown'
      if (code === 'private_revuelta_requires_request') {
        toast.error(
          'Revuelta privada de equipo: pedí ingreso con «Solicitar» y el organizador del partido te aceptará.'
        )
        return
      }
      if (code === 'past') {
        toast.error('Este partido ya pasó. Ya no se puede unir.')
        return
      }
      const msg =
        typeof payload?.message === 'string' && payload.message.trim()
          ? payload.message
          : 'No se pudo unir al partido.'
      toast.error(msg)
      return
    }
    const matchBundle = await loadPlayerMatchBundle(supabase, currentUser.id)
    setParticipatingOpportunityIds(matchBundle.participatingOpportunityIds)
    setMatchOpportunities(matchBundle.matchOpportunities)
    setSelectedChatOpportunityId(opportunityId)
    setCurrentScreen('chat')
    const joinedFresh = matchBundle.matchOpportunities.find((m) => m.id === opportunityId)
    const payLine = joinedFresh
      ? payOrganizerToastMessage(joinedFresh)
      : null
    toast.success(
      payLine
        ? `¡Te uniste al partido! Coordina en el chat. ${payLine}`
        : '¡Te uniste al partido! Coordina aquí con el grupo.'
    )
    void updateLastSeen(supabase, currentUser.id, { force: true })
  })

  const requestJoinPrivateRevuelta = useStableCallback(async (
    opportunityId: string,
    isGoalkeeper: boolean
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || !isSupabaseConfigured()) {
      return { ok: false, error: 'Sesión no disponible.' }
    }
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return { ok: false, error: ro.reason }
    }
    const opp = matchOpportunities.find((m) => m.id === opportunityId)
    if (!opp || opp.type !== 'open' || !opp.privateRevueltaTeamId) {
      toast.error('Esta revuelta no admite solicitud externa.')
      return { ok: false, error: 'No aplica.' }
    }
    const privTeam = teams.find((t) => t.id === opp.privateRevueltaTeamId)
    if (userIsConfirmedMemberOfTeam(privTeam, currentUser.id)) {
      toast.info('Sos del equipo: unite con el flujo normal.')
      return { ok: false, error: 'Miembro del equipo.' }
    }
    const supabase = getBrowserSupabase()
    if (!supabase) {
      return { ok: false, error: 'Cliente no disponible.' }
    }
    const { data, error } = await supabase.rpc('request_revuelta_external_join', {
      p_opportunity_id: opportunityId,
      p_is_goalkeeper: isGoalkeeper,
    })
    if (error) {
      toast.error(error.message)
      return { ok: false, error: error.message }
    }
    const payload = data as
      | { ok?: boolean; error?: string; message?: string }
      | null
      | undefined
    if (!payload?.ok) {
      const code = payload?.error ?? 'unknown'
      if (code === 'duplicate') {
        toast.info('Ya tenés una solicitud pendiente para este partido.')
        return { ok: false, error: 'duplicate' }
      }
      if (code === 'past') {
        toast.error('Este partido ya pasó. Ya no se puede solicitar.')
        return { ok: false, error: 'past' }
      }
      const msg =
        typeof payload?.message === 'string' && payload.message.trim()
          ? payload.message
          : 'No se pudo enviar la solicitud.'
      toast.error(msg)
      return { ok: false, error: msg }
    }
    toast.success('Solicitud enviada. El organizador del partido la revisará.')
    void updateLastSeen(supabase, currentUser.id, { force: true })
    return { ok: true }
  })

  const respondToRevueltaExternalRequest = useStableCallback(async (
    requestId: string,
    accept: boolean
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || !isSupabaseConfigured()) {
      return { ok: false, error: 'Sesión no disponible.' }
    }
    const supabase = getBrowserSupabase()
    if (!supabase) {
      return { ok: false, error: 'Cliente no disponible.' }
    }
    const fn = accept
      ? 'accept_revuelta_external_request'
      : 'decline_revuelta_external_request'
    const { data, error } = await supabase.rpc(fn, { p_request_id: requestId })
    if (error) {
      toast.error(error.message)
      return { ok: false, error: error.message }
    }
    const payload = data as { ok?: boolean; error?: string } | null
    if (!payload?.ok) {
      const msg =
        typeof payload?.error === 'string' ? payload.error : 'No se pudo procesar.'
      toast.error(msg)
      return { ok: false, error: msg }
    }
    toast.success(
      accept ? 'Jugador agregado al partido.' : 'Solicitud rechazada.'
    )
    const matchBundle = await loadPlayerMatchBundle(supabase, currentUser.id)
    setMatchOpportunities(matchBundle.matchOpportunities)
    setParticipatingOpportunityIds(matchBundle.participatingOpportunityIds)
    void updateLastSeen(supabase, currentUser.id, { force: true })
    return { ok: true }
  })

  const randomizeRevueltaTeams = useStableCallback(async (
    opportunityId: string,
    colorHexA: string,
    colorHexB: string
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const hexOk = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s.trim())
    if (!hexOk(colorHexA) || !hexOk(colorHexB)) {
      toast.error('Color de camiseta no válido.')
      return
    }
    if (colorHexA.trim().toLowerCase() === colorHexB.trim().toLowerCase()) {
      toast.error('Elige dos colores distintos para cada equipo.')
      return
    }
    const opp = matchOpportunities.find((m) => m.id === opportunityId)
    if (!opp || opp.type !== 'open' || opp.creatorId !== currentUser.id) {
      toast.error('Solo el organizador puede sortear equipos en esta revuelta.')
      return
    }
    const needed = opp.playersNeeded ?? 0
    const joined = opp.playersJoined ?? 0
    if (needed <= 0 || joined < needed) {
      toast.error('Completa todos los cupos antes de sortear equipos.')
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const { data: parts, error: pErr } = await supabase
      .from('match_opportunity_participants')
      .select('user_id, is_goalkeeper, status')
      .eq('opportunity_id', opportunityId)
    if (pErr) {
      toast.error(pErr.message)
      return
    }
    const byUser = new Map<string, boolean>()
    let joinedDb = 0
    let gkCount = 0
    for (const p of parts ?? []) {
      const st = p.status as string
      if (st !== 'confirmed' && st !== 'pending') continue
      joinedDb++
      const uid = p.user_id as string
      const gk = p.is_goalkeeper === true
      if (gk) gkCount++
      byUser.set(uid, (byUser.get(uid) ?? false) || gk)
    }
    if (opp.creatorId && !byUser.has(opp.creatorId)) {
      byUser.set(opp.creatorId, false)
    }

    // En revuelta exigimos lista completa y 2 arqueros antes de sortear.
    if (needed > 0 && joinedDb !== needed) {
      toast.error('La lista aún no está completa para sortear equipos.')
      return
    }
    if (gkCount < 2) {
      toast.error('Se necesitan 2 arqueros inscritos para poder sortear.')
      return
    }
    const roster = [...byUser.entries()].map(([userId, isGoalkeeper]) => ({
      userId,
      isGoalkeeper,
    }))
    const lineup = buildRandomRevueltaLineup(
      roster,
      colorHexA.trim(),
      colorHexB.trim()
    )
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('match_opportunities')
      .update({
        revuelta_lineup: lineup,
        updated_at: now,
      })
      .eq('id', opportunityId)
      .eq('creator_id', currentUser.id)
    if (error) {
      toast.error(error.message)
      return
    }
    const matches = await fetchLatestMatchOpportunities(supabase)
    setMatchOpportunities(matches)
    toast.success('¡Equipos sorteados! Equipo A y Equipo B listos.')
  })

  const refreshCurrentUserProfile = useStableCallback(async () => {
    if (!isSupabaseConfigured()) return
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return
    const profile = await loadProfileForUser(supabase, user.id, user.email)
    if (profile) setCurrentUser(profile)
  })

  const submitRivalCaptainVote = useStableCallback(async (
    opportunityId: string,
    vote: RivalResult
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const { error } = await supabase.rpc('submit_rival_captain_vote', {
      p_opportunity_id: opportunityId,
      p_vote: vote,
    })
    if (error) {
      const msg = error.message
      if (msg.includes('not_captain')) {
        toast.error('Solo los capitanes pueden votar el resultado.')
      } else if (msg.includes('challenge_not_accepted')) {
        toast.error('El desafío debe estar aceptado para votar.')
      } else {
        toast.error(msg)
      }
      return
    }
    const matches = await fetchLatestMatchOpportunities(supabase)
    setMatchOpportunities(matches)
    await refreshCurrentUserProfile()
    toast.success('Voto registrado.')
  })

  const finalizeRivalOrganizerOverride = useStableCallback(async (
    opportunityId: string,
    result: RivalResult
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const { error } = await supabase.rpc('finalize_rival_organizer_override', {
      p_opportunity_id: opportunityId,
      p_result: result,
    })
    if (error) {
      const msg = error.message
      if (msg.includes('deadline_not_reached')) {
        toast.error(
          'El desempate del organizador está disponible 72 h después de la hora programada del partido.'
        )
      } else if (msg.includes('not_disputed')) {
        toast.error('No hay desacuerdo entre capitanes que resolver.')
      } else {
        toast.error(msg)
      }
      return
    }
    const matches = await fetchLatestMatchOpportunities(supabase)
    setMatchOpportunities(matches)
    await refreshCurrentUserProfile()
    toast.success('Resultado confirmado. Ventana de calificaciones 48 h.')
  })

  const finalizeMatchOpportunity = useStableCallback(async (
    opportunityId: string,
    outcome:
      | { kind: 'casual' }
      | { kind: 'revuelta'; revueltaResult: RevueltaResult }
      | { kind: 'rival'; rivalResult: RivalResult }
  ): Promise<boolean> => {
    if (!currentUser || !isSupabaseConfigured()) return false
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return false
    }
    const opp = matchOpportunities.find((m) => m.id === opportunityId)
    if (!opp || opp.creatorId !== currentUser.id) {
      toast.error('Solo el organizador puede finalizar el partido.')
      return false
    }
    if (opp.status === 'completed') {
      toast.info('Este partido ya está finalizado.')
      return false
    }
    if (opp.type === 'players' && outcome.kind !== 'casual') {
      toast.error('Indica el cierre como partido casual.')
      return false
    }
    if (opp.type === 'open' && outcome.kind !== 'revuelta') {
      toast.error('Indica el resultado (equipo A, B o empate).')
      return false
    }
    if (opp.type === 'rival' && outcome.kind !== 'rival') {
      toast.error(
        'Indica el resultado (equipo del organizador, equipo rival o empate).'
      )
      return false
    }

    const supabase = getBrowserSupabase()
    if (!supabase) return false
    if (opp.type === 'rival' && outcome.kind === 'rival') {
      const { error } = await supabase.rpc('finalize_rival_match', {
        p_opportunity_id: opportunityId,
        p_result: outcome.rivalResult,
      })
      if (error) {
        const msg = error.message
        if (msg.includes('disputed_use_override')) {
          toast.error(
            'Hay desacuerdo entre capitanes: usa el desempate tras 72 h o resolvé el conflicto desde la app.'
          )
        } else if (msg.includes('challenge_not_accepted')) {
          toast.error('El desafío debe estar aceptado para registrar el resultado.')
        } else {
          toast.error(msg)
        }
        return false
      }
      const matches = await fetchLatestMatchOpportunities(supabase)
      setMatchOpportunities(matches)
      await refreshCurrentUserProfile()
      toast.success('Partido finalizado. Los jugadores pueden calificar en las próximas 48 h.')
      return true
    }

    if (opp.type === 'open' && outcome.kind === 'revuelta') {
      const { error } = await supabase.rpc('finalize_revuelta_match', {
        p_opportunity_id: opportunityId,
        p_result: outcome.revueltaResult,
      })
      if (error) {
        toast.error(error.message)
        return false
      }
      const matches = await fetchLatestMatchOpportunities(supabase)
      setMatchOpportunities(matches)
      await refreshCurrentUserProfile()
      toast.success('Partido finalizado. Los jugadores pueden calificar en las próximas 48 h.')
      return true
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('match_opportunities')
      .update({
        status: 'completed',
        finalized_at: now,
        updated_at: now,
        rival_result: null,
        revuelta_result: null,
        casual_completed: true,
      })
      .eq('id', opportunityId)
      .eq('creator_id', currentUser.id)

    if (error) {
      toast.error(error.message)
      return false
    }

    const matches = await fetchLatestMatchOpportunities(supabase)
    setMatchOpportunities(matches)
    await refreshCurrentUserProfile()
    toast.success('Partido finalizado. Los jugadores pueden calificar en las próximas 48 h.')
    return true
  })

  const suspendMatchOpportunity = useStableCallback(async (
    opportunityId: string,
    reason: string
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const opp = matchOpportunities.find((m) => m.id === opportunityId)
    if (!opp || opp.creatorId !== currentUser.id) {
      toast.error('Solo el organizador puede suspender el partido.')
      return
    }
    if (opp.status === 'completed') {
      toast.error('No puedes suspender un partido ya finalizado.')
      return
    }
    const cleanReason = reason.trim()
    if (cleanReason.length < 5) {
      toast.error('El motivo debe tener al menos 5 caracteres.')
      return
    }

    const supabase = getBrowserSupabase()
    if (!supabase) return
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('match_opportunities')
      .update({
        status: 'cancelled',
        suspended_at: now,
        suspended_reason: cleanReason,
        updated_at: now,
      })
      .eq('id', opportunityId)
      .eq('creator_id', currentUser.id)

    if (error) {
      toast.error(error.message)
      return
    }

    const matches = await fetchLatestMatchOpportunities(supabase)
    setMatchOpportunities(matches)
    toast.success('Partido suspendido.')
  })

  const submitMatchRating = useStableCallback(async (
    opportunityId: string,
    payload: {
      organizerRating: number | null
      matchRating: number
      levelRating: number
      comment?: string
    }
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const sbRating = getBrowserSupabase()
    if (!sbRating) return
    const { error } = await sbRating
      .from('match_opportunity_ratings')
      .insert({
        opportunity_id: opportunityId,
        rater_id: currentUser.id,
        organizer_rating: payload.organizerRating,
        match_rating: payload.matchRating,
        level_rating: payload.levelRating,
        comment: payload.comment?.trim() || null,
      })

    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('¡Gracias por tu calificación!')
  })

  const getFilteredMatches = useStableCallback((gender: Gender) => {
    const userRegion = currentUser?.regionId
    return matchOpportunities.filter((m) => {
      if (m.gender !== gender) return false
      if (!userRegion) return true
      if (!m.cityRegionId) return true
      return m.cityRegionId === userRegion
    })
  })

  const getFilteredUsers = useStableCallback((gender: Gender) => {
    return users.filter(
      (u) => u.gender === gender && u.id !== currentUser?.id
    )
  })

  const createTeam = useStableCallback(async (team: Omit<Team, 'id' | 'createdAt'>) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const { data, error } = await supabase.rpc('create_team_with_captain', {
      p_name: team.name,
      p_logo_url: team.logo ?? null,
      p_level: team.level,
      p_city: team.city,
      p_city_id: team.cityId,
      p_gender: team.gender,
      p_description: team.description ?? null,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    const payload = data as
      | { ok?: boolean; error?: string; message?: string; teamId?: string }
      | null
      | undefined
    if (!payload?.ok) {
      const msg =
        typeof payload?.message === 'string' && payload.message.trim()
          ? payload.message
          : 'No se pudo crear el equipo.'
      if (msg.includes('team_limit_reached')) toastTeamLimitReached()
      else toast.error(msg)
      return
    }

    const teamBundle = await loadPlayerTeamsAndInvites(supabase, currentUser.id)
    setTeams(teamBundle.teams)
    setTeamInvites(teamBundle.teamInvites)
    void updateLastSeen(supabase, currentUser.id, { force: true })
  })

  const updateTeam = useStableCallback(async (
    teamId: string,
    updates: {
      name?: string
      description?: string | null
      logo?: string | null
    }
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const row: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (updates.name !== undefined) {
      const n = updates.name.trim()
      if (n.length < 2) {
        toast.error('El nombre del equipo debe tener al menos 2 caracteres.')
        return
      }
      row.name = n
    }
    if (updates.description !== undefined) {
      const d =
        updates.description === null
          ? ''
          : String(updates.description).trim()
      row.description = d.length > 0 ? d : null
    }
    if (updates.logo !== undefined) {
      row.logo_url = updates.logo
    }

    const { error } = await supabase
      .from('teams')
      .update(row)
      .eq('id', teamId)
      .eq('captain_id', currentUser.id)

    if (error) {
      toast.error(error.message)
      return
    }

    const freshTeams = await fetchLatestTeams(supabase)
    setTeams(freshTeams)
    toast.success('Equipo actualizado')
  })

  const deleteTeam = useStableCallback(async (teamId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const team = teams.find((t) => t.id === teamId)
    if (!team || team.captainId !== currentUser.id) {
      toast.error('Solo el capitán puede eliminar el equipo.')
      return
    }
    const { error } = await supabase.from('teams').delete().eq('id', teamId)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Equipo eliminado')
    const freshTeams = await fetchLatestTeams(supabase)
    setTeams(freshTeams)
  })

  const leaveTeam = useStableCallback(async (teamId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const team = teams.find((t) => t.id === teamId)
    if (team?.captainId === currentUser.id) {
      toast.error('El capitán no puede retirarse; debe eliminar el equipo.')
      return
    }
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', currentUser.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Te retiraste del equipo')
    const [freshTeams, freshInvites, joinReqs] = await Promise.all([
      fetchLatestTeams(supabase),
      fetchLatestTeamInvitesForUser(supabase, currentUser.id),
      fetchLatestTeamJoinRequestsForUser(supabase, currentUser.id),
    ])
    setTeams(freshTeams)
    setTeamInvites(freshInvites)
    setTeamJoinRequests(joinReqs)
  })

  const updateTeamPrivateSettings = useStableCallback(async (
    teamId: string,
    payload: { whatsappInviteUrl?: string | null; rulesText?: string | null }
  ): Promise<TeamPrivateSettings | null> => {
    if (!currentUser || !isSupabaseConfigured()) return null
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return null
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return null
    const team = teams.find((t) => t.id === teamId)
    if (!team || team.captainId !== currentUser.id) return null

    const saved = await saveTeamPrivateSettings(supabase, teamId, payload)
    if (!saved) {
      toast.error('No se pudo guardar la coordinación del equipo.')
      return null
    }

    toast.success('Coordinación del equipo guardada')
    return saved
  })

  const createRivalChallenge = useStableCallback(async (payload: {
    challengerTeam: Team
    mode: 'direct' | 'open'
    challengedTeam?: Team
    message?: string
    venue: string
    location: string
    dateTime: Date
    level: Level
  }) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    if (!userIsTeamStaffCaptain(payload.challengerTeam, currentUser.id)) {
      toast.error(
        'Solo el capitán o el vicecapitán del equipo pueden crear un desafío.'
      )
      return
    }

    const title =
      payload.mode === 'direct' && payload.challengedTeam
        ? `${payload.challengerTeam.name} vs ${payload.challengedTeam.name}`
        : `${payload.challengerTeam.name} busca rival`
    const description =
      payload.message?.trim() ||
      (payload.mode === 'direct'
        ? `Desafío directo de ${payload.challengerTeam.name}`
        : `${payload.challengerTeam.name} está buscando rival`)

    const rivalCityId =
      (await resolveCityIdFromLabel(supabase, payload.location)) ??
      currentUser.cityId

    const { data, error } = await supabase.rpc('create_rival_challenge', {
      p_mode: payload.mode,
      p_challenger_team_id: payload.challengerTeam.id,
      p_challenged_team_id:
        payload.mode === 'direct' ? payload.challengedTeam?.id ?? null : null,
      p_venue: payload.venue,
      p_location: payload.location,
      p_city_id: rivalCityId,
      p_date_time: payload.dateTime.toISOString(),
      p_level: payload.level,
      p_title: title,
      p_description: description,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    const rpcPayload = data as
      | { ok?: boolean; error?: string; message?: string; opportunityId?: string }
      | null
      | undefined
    if (!rpcPayload?.ok) {
      toast.error(
        (typeof rpcPayload?.message === 'string' && rpcPayload.message) ||
          'No se pudo crear el desafío'
      )
      return
    }

    // Estado fuente: refrescar desde DB para mantener consistencia (evita duplicar lógica de mapeo).
    const matchBundle = await loadPlayerMatchBundle(supabase, currentUser.id)
    setRivalChallenges(matchBundle.rivalChallenges)
    setMatchOpportunities(matchBundle.matchOpportunities)
    toast.success(
      payload.mode === 'direct'
        ? `Desafío enviado a ${payload.challengedTeam?.name ?? 'equipo rival'}`
        : 'Búsqueda de rival publicada'
    )
  })

  const respondToRivalChallenge = useStableCallback(async (
    challengeId: string,
    accept: boolean,
    myTeamId?: string
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const challenge = rivalChallenges.find((c) => c.id === challengeId)
    if (!challenge || challenge.status !== 'pending') {
      toast.error('Desafío no disponible.')
      return
    }

    const { data, error } = await supabase.rpc('respond_rival_challenge', {
      p_challenge_id: challengeId,
      p_accept: accept,
      p_my_team_id: myTeamId ?? null,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    const payload = data as
      | { ok?: boolean; error?: string; message?: string }
      | null
      | undefined
    if (!payload?.ok) {
      toast.error(
        (typeof payload?.message === 'string' && payload.message.trim()) ||
          'No se pudo procesar el desafío.'
      )
      return
    }
    if (accept) {
      setSelectedChatOpportunityId(challenge.opportunityId)
      setCurrentScreen('chat')
      toast.success('¡Desafío aceptado! Ya pueden coordinar en el chat.')
    } else {
      toast.success('Desafío rechazado.')
    }

    const matchBundle = await loadPlayerMatchBundle(supabase, currentUser.id)
    setRivalChallenges(matchBundle.rivalChallenges)
    setMatchOpportunities(matchBundle.matchOpportunities)
    setParticipatingOpportunityIds(matchBundle.participatingOpportunityIds)
  })

  const acceptRivalOpportunityWithTeam = useStableCallback(async (
    opportunityId: string,
    myTeamId: string
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const challenge = rivalChallenges.find(
      (c) => c.opportunityId === opportunityId && c.status === 'pending'
    )
    if (!challenge) {
      toast.error('No se encontró un desafío pendiente para este partido.')
      return
    }
    const myTeam = teams.find((t) => t.id === myTeamId)
    if (!myTeam || !userIsTeamStaffCaptain(myTeam, currentUser.id)) {
      toast.error('Solo el capitán o vicecapitán del equipo puede aceptar el desafío.')
      return
    }
    await respondToRivalChallenge(challenge.id, true, myTeamId)
  })

  const inviteToTeam = useStableCallback(async (teamId: string, userId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const { error } = await supabase.from('team_invites').insert({
      team_id: teamId,
      inviter_id: currentUser.id,
      invitee_id: userId,
      status: 'pending',
    })
    if (error) {
      toast.error(
        error.code === '23505'
          ? 'Ya existe una invitación pendiente para este jugador.'
          : error.message
      )
      return
    }
    const invites = await fetchLatestTeamInvitesForUser(supabase, currentUser.id)
    setTeamInvites(invites)
  })

  const respondToInvite = useStableCallback(async (inviteId: string, accept: boolean) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const invite = teamInvites.find((i) => i.id === inviteId)
    if (!invite) return

    if (accept) {
      const { data, error } = await supabase.rpc('accept_team_invite', {
        p_invite_id: inviteId,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      const payload = data as
        | { ok?: boolean; error?: string; message?: string }
        | null
        | undefined
      if (!payload?.ok) {
        const msg =
          typeof payload?.message === 'string' && payload.message.trim()
            ? payload.message
            : 'No se pudo aceptar la invitación.'
        if (msg.includes('team_limit_reached')) toastTeamLimitReached()
        else toast.error(msg)
        return
      }
      void updateLastSeen(supabase, currentUser.id, { force: true })
    } else {
      const { error } = await supabase
        .from('team_invites')
        .update({ status: 'declined' })
        .eq('id', inviteId)
      if (error) {
        toast.error(error.message)
        return
      }
    }

    const teamBundle = await loadPlayerTeamsAndInvites(supabase, currentUser.id)
    setTeams(teamBundle.teams)
    setTeamInvites(teamBundle.teamInvites)
  })

  const requestToJoinTeam = useStableCallback(async (teamId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const { error } = await supabase.from('team_join_requests').insert({
      team_id: teamId,
      requester_id: currentUser.id,
      status: 'pending',
    })
    if (error) {
      toast.error(
        error.code === '23505'
          ? 'Ya tienes una solicitud pendiente para este equipo.'
          : error.message
      )
      return
    }
    const list = await fetchLatestTeamJoinRequestsForUser(supabase, currentUser.id)
    setTeamJoinRequests(list)
    toast.success('Solicitud enviada al equipo')
    void updateLastSeen(supabase, currentUser.id, { force: true })
  })

  const setTeamViceCaptain = useStableCallback(async (
    teamId: string,
    viceUserId: string | null
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const team = teams.find((t) => t.id === teamId)
    if (!team || team.captainId !== currentUser.id) {
      toast.error('Solo el capitán del equipo puede designar al vicecapitán.')
      return
    }
    if (viceUserId && viceUserId === team.captainId) return
    if (viceUserId) {
      const ok = team.members.some(
        (m) => m.id === viceUserId && m.status === 'confirmed'
      )
      if (!ok) {
        toast.error('El vicecapitán debe ser un miembro confirmado del plantel.')
        return
      }
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const { error } = await supabase
      .from('teams')
      .update({
        vice_captain_id: viceUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)
      .eq('captain_id', currentUser.id)
    if (error) {
      toast.error(error.message)
      return
    }
    const freshTeams = await fetchLatestTeams(supabase)
    setTeams(freshTeams)
    toast.success(
      viceUserId ? 'Vicecapitán designado.' : 'Vicecapitán removido.'
    )
  })

  const removeTeamMember = useStableCallback(async (teamId: string, memberUserId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const team = teams.find((t) => t.id === teamId)
    if (!team || !userIsTeamStaffCaptain(team, currentUser.id)) {
      toast.error('No tenés permiso para quitar jugadores de este equipo.')
      return
    }
    if (memberUserId === team.captainId) {
      toast.error('No podés quitar al capitán del equipo.')
      return
    }
    if (memberUserId === currentUser.id) {
      toast.error('Para salir del equipo usá «Salir».')
      return
    }
    const ok = confirm('¿Retirar a este jugador del plantel?')
    if (!ok) return
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', memberUserId)
    if (error) {
      toast.error(error.message)
      return
    }
    const [freshTeams, invites, joinReqs] = await Promise.all([
      fetchLatestTeams(supabase),
      fetchLatestTeamInvitesForUser(supabase, currentUser.id),
      fetchLatestTeamJoinRequestsForUser(supabase, currentUser.id),
    ])
    setTeams(freshTeams)
    setTeamInvites(invites)
    setTeamJoinRequests(joinReqs)
    toast.success('Jugador retirado del equipo')
  })

  const respondToJoinRequest = useStableCallback(async (requestId: string, accept: boolean) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const req = teamJoinRequests.find((r) => r.id === requestId)
    if (!req || req.status !== 'pending') return
    const team = teams.find((t) => t.id === req.teamId)
    if (!team || !userIsTeamStaffCaptain(team, currentUser.id)) return

    if (!accept) {
      const { data, error } = await supabase.rpc('respond_team_join_request', {
        p_request_id: requestId,
        p_accept: false,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      const payload = data as
        | { ok?: boolean; error?: string; message?: string }
        | null
        | undefined
      if (!payload?.ok) {
        const msg =
          typeof payload?.message === 'string' && payload.message.trim()
            ? payload.message
            : 'No se pudo rechazar la solicitud.'
        toast.error(msg)
        return
      }
      const list = await fetchLatestTeamJoinRequestsForUser(supabase, currentUser.id)
      setTeamJoinRequests(list)
      toast.success('Solicitud rechazada')
      return
    }

    const { data, error } = await supabase.rpc('respond_team_join_request', {
      p_request_id: requestId,
      p_accept: true,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    const payload = data as
      | { ok?: boolean; error?: string; message?: string }
      | null
      | undefined
    if (!payload?.ok) {
      const msg =
        typeof payload?.message === 'string' && payload.message.trim()
          ? payload.message
          : 'No se pudo aceptar la solicitud.'
      if (msg.includes('team_limit_reached')) toastTeamLimitReached()
      else toast.error(msg)
      return
    }

    const [freshTeams, list] = await Promise.all([
      fetchLatestTeams(supabase),
      fetchLatestTeamJoinRequestsForUser(supabase, currentUser.id),
    ])
    setTeams(freshTeams)
    setTeamJoinRequests(list)
    toast.success(`${req.requesterName} ya es parte del equipo`)
    void updateLastSeen(supabase, currentUser.id, { force: true })
  })

  const cancelJoinRequest = useStableCallback(async (requestId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const ro = isUserReadOnly(currentUser)
    if (ro.readonly) {
      toastReadOnly(ro.reason)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const req = teamJoinRequests.find((r) => r.id === requestId)
    if (!req || req.requesterId !== currentUser.id || req.status !== 'pending')
      return
    const { error } = await supabase
      .from('team_join_requests')
      .delete()
      .eq('id', requestId)
    if (error) {
      toast.error(error.message)
      return
    }
    const list = await fetchLatestTeamJoinRequestsForUser(supabase, currentUser.id)
    setTeamJoinRequests(list)
    toast.success('Solicitud cancelada')
  })

  const getUserTeams = useStableCallback(() => {
    if (!currentUser) return []
    return teams.filter(
      (t) =>
        t.captainId === currentUser.id ||
        t.members.some((m) => m.id === currentUser.id)
    )
  })

  const getFilteredTeams = useStableCallback((gender: Gender) => {
    if (!currentUser) return []
    return teams.filter((t) => {
      if (t.gender !== gender) return false
      return teamIsInPlayerGeo(t, {
        regionId: currentUser.regionId,
        cityId: currentUser.cityId,
      })
    })
  })

  const clearSessionState = useCallback(() => {
    resetPresenceDebounceState()
    clearSessionNavigationState()
    setCurrentUser(null)
    setProfilePhotoCacheBust(0)
    setProfilePhotoEpochByUser({})
    setProfilesRealtimeGeneration(0)
    setUsers([])
    setMatchOpportunities([])
    setTeams([])
    setTeamInvites([])
    setTeamJoinRequests([])
    setRivalChallenges([])
    setParticipatingOpportunityIds([])
    setSelectedChatOpportunityId(null)
    setSelectedMatchOpportunityId(null)
    setInitialMatchesTab(null)
    setTeamsDetailFocusTeamId(null)
    setOnboardingSource('registration')
  }, [])

  const loadAppStateForAuthUser = useCallback(async (authUser: SupabaseAuthUser) => {
    if (!isSupabaseConfigured()) return
    const email = getAuthUserEmail(authUser)
    if (!email) return
    try {
      const supabase = getBrowserSupabase()
      if (!supabase) return
      const profile = await loadProfileForUser(supabase, authUser.id, email)
      if (!profile) return
      setCurrentUser(profile)
      void updateLastSeen(supabase, authUser.id)

      if (profile.accountType === 'venue' || profile.accountType === 'admin') {
        setMatchOpportunities([])
        setUsers([])
        setTeams([])
        setTeamInvites([])
        setTeamJoinRequests([])
        setParticipatingOpportunityIds([])
        setRivalChallenges([])
        return
      }

      const [matchBundle, teamBundle, others] = await Promise.all([
        loadPlayerMatchBundle(supabase, authUser.id),
        loadPlayerTeamBundle(supabase, authUser.id),
        loadOtherPlayersForUser(supabase, authUser.id, profile.gender),
      ])
      setMatchOpportunities(matchBundle.matchOpportunities)
      setUsers(others)
      setTeams(teamBundle.teams)
      setTeamInvites(teamBundle.teamInvites)
      setTeamJoinRequests(teamBundle.teamJoinRequests)
      setParticipatingOpportunityIds(matchBundle.participatingOpportunityIds)
      setRivalChallenges(matchBundle.rivalChallenges)
    } catch {
      // offline / error de red
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const finishAuthLoading = () => {
      if (mounted) setAuthLoading(false)
    }

    if (!isSupabaseConfigured()) {
      finishAuthLoading()
      return () => {
        mounted = false
      }
    }

    const supabase = getBrowserSupabase()
    if (!supabase) {
      finishAuthLoading()
      return () => {
        mounted = false
      }
    }

    // Nunca uses callback `async` aquí: Supabase emite INITIAL_SESSION dentro de un lock;
    // await + peticiones del cliente reintentan ese lock → deadlock y spinner infinito.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT') {
        clearSessionState()
        return
      }

      if (event === 'INITIAL_SESSION') {
        if (session?.user && getAuthUserEmail(session.user)) {
          const safety = window.setTimeout(() => {
            if (mounted) finishAuthLoading()
          }, 15000)
          void loadAppStateForAuthUser(session.user).finally(() => {
            window.clearTimeout(safety)
            if (mounted) finishAuthLoading()
          })
        } else {
          clearSessionState()
          finishAuthLoading()
        }
        return
      }

      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        if (session?.user && getAuthUserEmail(session.user)) {
          void loadAppStateForAuthUser(session.user)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [clearSessionState, loadAppStateForAuthUser])

  /** ?joinTeam= & ?register=1 → sessionStorage y URL limpia */
  useEffect(() => {
    captureInviteParamsFromUrl()
  }, [])

  useEffect(() => {
    capturePrefillCreateQuery()
  }, [])

  /** Sin sesión: `/?screen=auth` abre login/registro (p. ej. enlace desde `/centro/...`). */
  useEffect(() => {
    if (authLoading) return
    if (currentUser) return
    const screen = consumeScreenQueryParam()
    if (screen === 'auth') {
      setCurrentScreen('auth')
    }
  }, [authLoading, currentUser])

  /** `/?screen=...`: navegación directa desde páginas públicas (ej: centro). */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'player') return
    if (needsOnboardingProfile(currentUser)) return
    const screen = resolvePlayerScreenFromQuery(
      consumeScreenQueryParam(),
      PLAYER_NAV_SCREENS
    )
    if (!screen) return
    setCurrentScreen(screen)
    persistPlayerLastNav(screen as PlayerNavId)
  }, [authLoading, currentUser])

  /** Recordar última pestaña principal (barra inferior en `/centro/...`). */
  useEffect(() => {
    if (!currentUser || currentUser.accountType !== 'player') return
    if (!PLAYER_NAV_SCREENS.has(currentScreen)) return
    persistPlayerLastNav(currentScreen as PlayerNavId)
  }, [currentUser, currentScreen])

  /** Abrir Crear tras `/?prefillCreate=1` solo en el efecto landing/auth → home más abajo.
   *  Un segundo efecto aquí llamaba también a `tryNavigateCreateAfterPlayerReady`, vaciaba
   *  sessionStorage y el otro efecto acababa en `setCurrentScreen('home')`. */

  /** Cuenta centro: onboarding sin `sports_venues` o panel si ya existe. */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'venue') return
    if (currentScreen === 'auth') return

    let cancelled = false
    void (async () => {
      try {
        if (!isSupabaseConfigured()) return
        const supabase = getBrowserSupabase()
        if (!supabase) return
        const v = await loadVenueForOwner(supabase, currentUser.id)
        if (cancelled) return

        if (!v) {
          if (currentScreen !== 'venueOnboarding') {
            setCurrentScreen('venueOnboarding')
          }
          return
        }

        if (currentScreen === 'venueOnboarding') {
          setCurrentScreen('venueDashboard')
          return
        }

        const venueScreens: AppScreen[] = ['venueDashboard', 'venueOnboarding']
        if (!venueScreens.includes(currentScreen)) {
          setCurrentScreen('venueDashboard')
        }
      } catch {
        // red / offline
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, currentUser, currentScreen])

  /** Cuenta admin: siempre entra al dashboard admin. */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'admin') return
    if (currentScreen === 'auth') return
    if (currentScreen !== 'adminDashboard') {
      setCurrentScreen('adminDashboard')
    }
  }, [authLoading, currentUser, currentScreen])

  /** Jugador baneado: solo pantalla Perfil (resto de la app deshabilitada en UI). */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'player') return
    if (!currentUser.modBannedAt) return
    if (currentScreen !== 'profile') {
      setCurrentScreen('profile')
    }
  }, [authLoading, currentUser, currentScreen])

  /** Invitación con registro: abrir auth desde landing */
  useEffect(() => {
    if (authLoading || currentUser) return
    if (currentScreen !== 'landing') return
    if (shouldOpenAuthFromRegisterInvite()) setCurrentScreen('auth')
  }, [authLoading, currentUser, currentScreen])

  /**
   * Tras OAuth (o recarga en `/`) la pantalla vuelve a `landing` con sesión ya activa:
   * enviamos al jugador al home u onboarding como en el login por email.
   */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'player') return
    if (currentScreen !== 'landing' && currentScreen !== 'auth') return
    if (currentUser.modBannedAt) {
      setCurrentScreen('profile')
      return
    }
    if (needsOnboardingProfile(currentUser)) {
      setOnboardingSource('registration')
      setCurrentScreen('onboarding')
      return
    }
    if (tryNavigateCreateAfterPlayerReady()) {
      setCurrentScreen('create')
      return
    }
    setCurrentScreen('home')
  }, [authLoading, currentUser, currentScreen])

  /** Tras sesión + perfil listo: deep link equipo (prioridad) o detalle de revuelta */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'player') return
    if (currentUser.modBannedAt) return
    if (needsOnboardingProfile(currentUser)) return
    const { teamId, matchId } = consumePendingPlayerDeepLink()
    if (teamId) {
      setTeamsDetailFocusTeamId(teamId)
      setCurrentScreen('teams')
      return
    }
    if (matchId) {
      setSelectedMatchOpportunityId(matchId)
      setCurrentScreen('matchDetails')
    }
  }, [authLoading, currentUser])

  usePlayerRealtimeManager({
    currentUser,
    currentUserRef,
    setMatchOpportunities,
    setParticipatingOpportunityIds,
    setRivalChallenges,
    setTeams,
    setTeamInvites,
    setTeamJoinRequests,
    setUsers,
    setProfilePhotoEpochByUser,
    setProfilesRealtimeGeneration,
    setCurrentUser,
  })

  const openPublicProfile = useStableCallback((userId: string) => {
    const id = userId?.trim()
    if (!id) return
    if (currentUser?.id && id === currentUser.id) {
      setCurrentScreen('profile')
      return
    }
    setPublicProfileUserId(id)
  })

  const closePublicProfile = useStableCallback(() => {
    setPublicProfileUserId(null)
  })

  const uiContextValue = useMemo(
    () => ({
      currentScreen,
      setCurrentScreen,
      selectedChatOpportunityId,
      setSelectedChatOpportunityId,
      selectedMatchOpportunityId,
      setSelectedMatchOpportunityId,
      publicProfileUserId,
      openPublicProfile,
      closePublicProfile,
      initialMatchesTab,
      setInitialMatchesTab,
      teamsDetailFocusTeamId,
      setTeamsDetailFocusTeamId,
      onboardingSource,
      setOnboardingSource,
      openProfileEditor,
    }),
    [
      currentScreen,
      selectedChatOpportunityId,
      selectedMatchOpportunityId,
      publicProfileUserId,
      initialMatchesTab,
      teamsDetailFocusTeamId,
      onboardingSource,
    ]
  )

  const authContextValue = useMemo(
    () => ({
      authLoading,
      currentUser,
      setCurrentUser,
      isAuthenticated,
      login,
      loginWithGoogle,
      logout,
      completeOnboarding,
      completeVenueOnboarding,
      updateProfilePhoto,
      profilePhotoCacheBust,
      bumpProfilePhotoCache,
      profilesRealtimeGeneration,
      avatarDisplayUrl,
      refreshCurrentUserProfile,
    }),
    [
      authLoading,
      currentUser,
      isAuthenticated,
      profilePhotoCacheBust,
      profilesRealtimeGeneration,
    ]
  )

  const matchContextValue = useMemo(
    () => ({
      matchOpportunities,
      addMatchOpportunity,
      reserveVenueOnly,
      joinMatchOpportunity,
      requestJoinPrivateRevuelta,
      respondToRevueltaExternalRequest,
      randomizeRevueltaTeams,
      finalizeMatchOpportunity,
      submitRivalCaptainVote,
      finalizeRivalOrganizerOverride,
      suspendMatchOpportunity,
      submitMatchRating,
      users,
      getFilteredMatches,
      getFilteredUsers,
      participatingOpportunityIds,
      rivalChallenges,
    }),
    [matchOpportunities, users, participatingOpportunityIds, rivalChallenges]
  )

  const teamContextValue = useMemo(
    () => ({
      teams,
      teamInvites,
      teamJoinRequests,
      createTeam,
      updateTeam,
      deleteTeam,
      leaveTeam,
      updateTeamPrivateSettings,
      createRivalChallenge,
      respondToRivalChallenge,
      acceptRivalOpportunityWithTeam,
      inviteToTeam,
      respondToInvite,
      requestToJoinTeam,
      respondToJoinRequest,
      cancelJoinRequest,
      setTeamViceCaptain,
      removeTeamMember,
      getUserTeams,
      getFilteredTeams,
    }),
    [teams, teamInvites, teamJoinRequests]
  )

  return (
    <AppDomainProviders
      ui={uiContextValue}
      auth={authContextValue}
      match={matchContextValue}
      team={teamContextValue}
    >
      {children}
    </AppDomainProviders>
  )
}

export function useApp(): AppContextType {
  return useComposedAppContext()
}

export type { AppContextType, AppScreen } from '@/lib/app-context-contract'

export {
  useAppAuth,
  useAppMatch,
  useAppTeam,
  useAppUI,
  useComposedAppContext,
} from '@/lib/contexts/domain-contexts'
