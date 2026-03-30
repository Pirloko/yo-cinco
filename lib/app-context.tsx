'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import {
  MatchOpportunity,
  MatchesHubTab,
  OnboardingData,
  VenueOnboardingData,
  Gender,
  Level,
  RivalChallenge,
  RivalResult,
  Team,
  TeamInvite,
  TeamJoinRequest,
  TeamPrivateSettings,
  User,
} from './types'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { getPublicSiteOrigin } from '@/lib/site-url'
import {
  mapMatchOpportunityFromDb,
  DEFAULT_AVATAR,
  type MatchOpportunityRow,
} from '@/lib/supabase/mappers'
import { formatAuthError } from '@/lib/supabase/auth-errors'
import { payOrganizerToastMessage } from '@/lib/court-pricing'
import {
  fetchMatchOpportunities,
  fetchOtherProfiles,
  fetchProfileForUser,
} from '@/lib/supabase/queries'
import {
  MATCH_OPPORTUNITY_SELECT_WITH_GEO,
  TEAM_SELECT_WITH_GEO,
  fetchDefaultCityId,
  resolveCityIdFromLabel,
} from '@/lib/supabase/geo-queries'
import {
  fetchTeamInvitesForUser,
  fetchTeamJoinRequestsForUser,
  fetchTeamPrivateSettings,
  fetchTeamsWithMembers,
} from '@/lib/supabase/team-queries'
import { fetchParticipatingOpportunityIds } from '@/lib/supabase/message-queries'
import { fetchRivalChallengesForUser } from '@/lib/supabase/rival-challenge-queries'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import {
  isValidTeamInviteId,
  JOIN_REGISTER_STORAGE_KEY,
  JOIN_TEAM_STORAGE_KEY,
} from '@/lib/team-invite-url'
import {
  JOIN_MATCH_STORAGE_KEY,
} from '@/lib/match-invite-url'
import {
  capturePrefillCreateQuery,
  OPEN_CREATE_AFTER_AUTH_KEY,
  tryNavigateCreateAfterPlayerReady,
} from '@/lib/create-prefill'
import { buildRandomRevueltaLineup } from '@/lib/revuelta-lineup'
import { playersJoinRules } from '@/lib/players-seek-profile'
import { uploadProfileAvatarFile } from '@/lib/supabase/profile-photo'
import { fetchVenueForOwner } from '@/lib/supabase/venue-queries'
import {
  persistPlayerLastNav,
  type PlayerNavId,
} from '@/lib/player-nav-storage'

function isTeamLimitReached(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: unknown }
  return typeof e.message === 'string' && e.message.includes('team_limit_reached')
}

function toastTeamLimitReached() {
  toast.error('Llegaste al máximo de 5 equipos.')
}

function getAuthUserEmail(u: SupabaseAuthUser): string | undefined {
  if (u.email) return u.email
  const meta = u.user_metadata
  if (meta && typeof meta.email === 'string') return meta.email
  return undefined
}

type AppScreen =
  | 'landing'
  | 'auth'
  | 'onboarding'
  | 'home'
  | 'create'
  | 'explore'
  | 'swipe'
  | 'matches'
  | 'chat'
  | 'matchDetails'
  | 'profile'
  | 'teams'
  | 'venueOnboarding'
  | 'venueDashboard'
  | 'adminDashboard'

const PLAYER_NAV_SCREENS = new Set<AppScreen>([
  'home',
  'explore',
  'matches',
  'create',
  'teams',
  'profile',
])

function needsOnboardingProfile(u: User): boolean {
  if (u.accountType !== 'player') return false
  return u.name.trim().length < 2 || u.age < 16
}

interface AppContextType {
  authLoading: boolean
  currentScreen: AppScreen
  setCurrentScreen: (screen: AppScreen) => void
  currentUser: User | null
  setCurrentUser: (user: User | null) => void
  isAuthenticated: boolean
  login: (
    email: string,
    password: string,
    gender: Gender,
    isSignUp: boolean,
    whatsappPhone?: string
  ) => Promise<{
    ok: boolean
    error?: string
    needsOnboarding?: boolean
    needsVenueOnboarding?: boolean
    isVenue?: boolean
    isAdmin?: boolean
  }>
  /** OAuth: redirige al proveedor; al volver a `/` la sesión se detecta en URL. */
  loginWithGoogle: () => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  completeOnboarding: (data: OnboardingData) => Promise<void>
  /** Primera configuración del centro (`sports_venues`) para cuentas venue. */
  completeVenueOnboarding: (data: VenueOnboardingData) => Promise<void>
  /** Mismo flujo que el registro, pero precargado y vuelve a Perfil al terminar. */
  openProfileEditor: () => void
  onboardingSource: 'registration' | 'profile_edit'
  setOnboardingSource: (source: 'registration' | 'profile_edit') => void
  /** Sube imagen a Storage y actualiza `photo_url` del perfil. */
  updateProfilePhoto: (file: File) => Promise<{ ok: boolean; error?: string }>
  matchOpportunities: MatchOpportunity[]
  addMatchOpportunity: (
    match: Omit<MatchOpportunity, 'id' | 'createdAt'> & {
      /** Revuelta (open): el organizador entra como participante con este rol. */
      creatorIsGoalkeeper?: boolean
      /** Reservar cancha vía RPC al publicar (centros deportivos). */
      bookCourtSlot?: boolean
      courtSlotMinutes?: number
    }
  ) => Promise<{ ok: true } | { ok: false; code?: 'no_court'; error: string }>
  /** Reserva de cancha sin crear partido. */
  reserveVenueOnly: (payload: {
    sportsVenueId: string
    startsAt: Date
    durationMinutes: number
  }) => Promise<{ ok: true } | { ok: false; code?: 'no_court'; error: string }>
  /** Apuntarse a un partido ajeno (participante confirmado + acceso al chat). Revuelta: opción arquero. */
  joinMatchOpportunity: (
    opportunityId: string,
    options?: { isGoalkeeper?: boolean }
  ) => Promise<void>
  /** Organizador revuelta (cupos llenos): sorteo aleatorio A/B + colores camiseta. */
  randomizeRevueltaTeams: (
    opportunityId: string,
    colorHexA: string,
    colorHexB: string
  ) => Promise<void>
  /** Organizador: cerrar partido y registrar resultado (rival o casual). */
  finalizeMatchOpportunity: (
    opportunityId: string,
    outcome:
      | { kind: 'rival'; rivalResult: RivalResult }
      | { kind: 'casual' }
  ) => Promise<void>
  suspendMatchOpportunity: (
    opportunityId: string,
    reason: string
  ) => Promise<void>
  /** Participante u organizador: una calificación por usuario (ventana 48 h). */
  submitMatchRating: (
    opportunityId: string,
    payload: {
      organizerRating: number | null
      matchRating: number
      levelRating: number
      comment?: string
    }
  ) => Promise<void>
  users: User[]
  getFilteredMatches: (gender: Gender) => MatchOpportunity[]
  getFilteredUsers: (gender: Gender) => User[]
  teams: Team[]
  teamInvites: TeamInvite[]
  /** Solicitudes de ingreso (como capitán o como solicitante). */
  teamJoinRequests: TeamJoinRequest[]
  rivalChallenges: RivalChallenge[]
  createTeam: (team: Omit<Team, 'id' | 'createdAt'>) => Promise<void>
  /** Capitán: actualizar nombre, descripción y/o logo (logo_url en DB; archivo en Storage `team-logos`). */
  updateTeam: (
    teamId: string,
    updates: {
      name?: string
      description?: string | null
      logo?: string | null
    }
  ) => Promise<void>
  /** Capitán: eliminar equipo completo (cascade). */
  deleteTeam: (teamId: string) => Promise<void>
  /** Miembro (no capitán): retirarse del equipo. */
  leaveTeam: (teamId: string) => Promise<void>
  /** Capitán: enlace WhatsApp y reglas internas (tabla privada; solo miembros leen). */
  updateTeamPrivateSettings: (
    teamId: string,
    payload: { whatsappInviteUrl?: string | null; rulesText?: string | null }
  ) => Promise<TeamPrivateSettings | null>
  createRivalChallenge: (payload: {
    challengerTeam: Team
    mode: 'direct' | 'open'
    challengedTeam?: Team
    message?: string
    venue: string
    location: string
    dateTime: Date
    level: Level
  }) => Promise<void>
  respondToRivalChallenge: (
    challengeId: string,
    accept: boolean,
    myTeamId?: string
  ) => Promise<void>
  acceptRivalOpportunityWithTeam: (
    opportunityId: string,
    myTeamId: string
  ) => Promise<void>
  inviteToTeam: (teamId: string, userId: string) => Promise<void>
  respondToInvite: (inviteId: string, accept: boolean) => Promise<void>
  /** Jugador: pedir unirse a un equipo (mismo género, no miembro). */
  requestToJoinTeam: (teamId: string) => Promise<void>
  /** Capitán: aceptar o rechazar solicitud. */
  respondToJoinRequest: (requestId: string, accept: boolean) => Promise<void>
  /** Jugador: retirar solicitud pendiente. */
  cancelJoinRequest: (requestId: string) => Promise<void>
  getUserTeams: () => Team[]
  getFilteredTeams: (gender: Gender) => Team[]
  /** Oportunidades donde el usuario se apuntó como participante (no incluye ser creador). */
  participatingOpportunityIds: string[]
  selectedChatOpportunityId: string | null
  setSelectedChatOpportunityId: (id: string | null) => void
  selectedMatchOpportunityId: string | null
  setSelectedMatchOpportunityId: (id: string | null) => void
  /** Al navegar a Partidos (ej. campana), abrir esta pestaña una vez. */
  initialMatchesTab: MatchesHubTab | null
  setInitialMatchesTab: (tab: MatchesHubTab | null) => void
  /** Deep link: abrir detalle de equipo en Equipos (se consume al aplicar). */
  teamsDetailFocusTeamId: string | null
  setTeamsDetailFocusTeamId: (id: string | null) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [authLoading, setAuthLoading] = useState(true)
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('landing')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
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
  const [initialMatchesTab, setInitialMatchesTab] =
    useState<MatchesHubTab | null>(null)
  const [teamsDetailFocusTeamId, setTeamsDetailFocusTeamId] = useState<
    string | null
  >(null)
  const [onboardingSource, setOnboardingSource] = useState<
    'registration' | 'profile_edit'
  >('registration')

  const isAuthenticated = currentUser !== null

  const openProfileEditor = useCallback(() => {
    setOnboardingSource('profile_edit')
    setCurrentScreen('onboarding')
  }, [])

  const updateProfilePhoto = useCallback(
    async (file: File) => {
      if (!currentUser || !isSupabaseConfigured()) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const supabase = createClient()
      const up = await uploadProfileAvatarFile(supabase, currentUser.id, file)
      if ('error' in up) {
        toast.error(up.error)
        return { ok: false, error: up.error }
      }
      const { error } = await supabase
        .from('profiles')
        .update({ photo_url: up.publicUrl })
        .eq('id', currentUser.id)
      if (error) {
        toast.error(error.message)
        return { ok: false, error: error.message }
      }
      setCurrentUser({
        ...currentUser,
        photo: up.publicUrl,
      })
      toast.success('Foto de perfil actualizada')
      return { ok: true }
    },
    [currentUser]
  )

  const login = async (
    email: string,
    password: string,
    gender: Gender,
    isSignUp: boolean,
    whatsappPhone?: string
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
      const supabase = createClient()
      const emailTrimmed = email.trim()
      if (isSignUp) {
        const whatsapp = whatsappPhone?.trim() ?? ''
        if (!whatsapp) {
          return { ok: false, error: 'Debes ingresar tu WhatsApp.' }
        }
        const { data, error } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
          options: { data: { gender, whatsapp_phone: whatsapp } },
        })
        if (error) return { ok: false, error: formatAuthError(error) }
        if (data.user && !data.session) {
          return {
            ok: false,
            error:
              'Revisa tu correo para confirmar la cuenta antes de iniciar sesión.',
          }
        }
        if (data.user) {
          await supabase
            .from('profiles')
            .update({ gender, whatsapp_phone: whatsapp })
            .eq('id', data.user.id)
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

      const profile = await fetchProfileForUser(supabase, user.id, user.email)
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
        const venueRow = await fetchVenueForOwner(supabase, user.id)
        return {
          ok: true,
          needsOnboarding: false,
          needsVenueOnboarding: !venueRow,
          isVenue: true,
        }
      }

      const [matches, others, teamList, invites, joinReqs, partIds, challenges] =
        await Promise.all([
          fetchMatchOpportunities(supabase),
          fetchOtherProfiles(supabase, user.id, profile.gender),
          fetchTeamsWithMembers(supabase),
          fetchTeamInvitesForUser(supabase, user.id),
          fetchTeamJoinRequestsForUser(supabase, user.id),
          fetchParticipatingOpportunityIds(supabase, user.id),
          fetchRivalChallengesForUser(supabase, user.id),
        ])
      setMatchOpportunities(matches)
      setUsers(others)
      setTeams(teamList)
      setTeamInvites(invites)
      setTeamJoinRequests(joinReqs)
      setParticipatingOpportunityIds(partIds)
      setRivalChallenges(challenges)

      return {
        ok: true,
        needsOnboarding: needsOnboardingProfile(profile),
        isVenue: false,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de conexión'
      return { ok: false, error: msg }
    }
  }

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
      const supabase = createClient()
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

  const logout = async () => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient()
        await supabase.auth.signOut()
      }
    } catch {
      // ignorar
    }
    try {
      sessionStorage.removeItem(JOIN_TEAM_STORAGE_KEY)
      sessionStorage.removeItem(JOIN_MATCH_STORAGE_KEY)
      sessionStorage.removeItem(JOIN_REGISTER_STORAGE_KEY)
      sessionStorage.removeItem(OPEN_CREATE_AFTER_AUTH_KEY)
    } catch {
      // ignore
    }
    setCurrentUser(null)
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
  }

  const completeOnboarding = async (data: OnboardingData) => {
    if (!currentUser || !isSupabaseConfigured()) return
    if (currentUser.accountType !== 'player') return
    const supabase = createClient()
    const photo = data.photo || DEFAULT_AVATAR
    let nextCityId = data.cityId?.trim()
      ? data.cityId.trim()
      : (await resolveCityIdFromLabel(supabase, data.city)) ?? currentUser.cityId
    const { error } = await supabase
      .from('profiles')
      .update({
        name: data.name,
        age: data.age,
        gender: data.gender,
        whatsapp_phone: data.whatsappPhone.trim(),
        position: data.position,
        level: data.level,
        city: data.city,
        city_id: nextCityId,
        availability: data.availability,
        photo_url: photo,
      })
      .eq('id', currentUser.id)

    if (error) {
      toast.error(error.message)
      return
    }

    const refreshed = await fetchProfileForUser(
      supabase,
      currentUser.id,
      currentUser.email
    )
    if (refreshed) {
      setCurrentUser(refreshed)
    } else {
      setCurrentUser({
        ...currentUser,
        ...data,
        cityId: nextCityId,
        whatsappPhone: data.whatsappPhone.trim(),
        photo,
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
  }

  const completeVenueOnboarding = async (data: VenueOnboardingData) => {
    if (!currentUser || !isSupabaseConfigured()) return
    if (currentUser.accountType !== 'venue') return
    const supabase = createClient()
    const existing = await fetchVenueForOwner(supabase, currentUser.id)
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
    toast.success('Centro creado')
    setCurrentScreen('venueDashboard')
  }

  const addMatchOpportunity = async (
    m: Omit<MatchOpportunity, 'id' | 'createdAt'> & {
      creatorIsGoalkeeper?: boolean
      bookCourtSlot?: boolean
      courtSlotMinutes?: number
    }
  ): Promise<{ ok: true } | { ok: false; code?: 'no_court'; error: string }> => {
    if (!currentUser || !isSupabaseConfigured()) {
      return { ok: false as const, error: 'Sesión no disponible.' }
    }
    const supabase = createClient()

    let reservationId: string | null = null
    if (
      m.sportsVenueId &&
      m.bookCourtSlot === true &&
      m.type !== 'rival'
    ) {
      const dur = m.courtSlotMinutes ?? 60
      const end = new Date(m.dateTime.getTime() + dur * 60 * 1000)
      const { data: resRpc, error: rpcErr } = await supabase.rpc(
        'book_venue_slot',
        {
          p_venue_id: m.sportsVenueId,
          p_starts_at: m.dateTime.toISOString(),
          p_ends_at: end.toISOString(),
        }
      )
      if (rpcErr) {
        if (rpcErr.message.includes('no_court')) {
          toast.error('No hay cancha libre en ese horario en este centro.')
          return {
            ok: false as const,
            code: 'no_court',
            error: 'No hay cancha libre en ese horario en este centro.',
          }
        }
        toast.error(rpcErr.message)
        return { ok: false as const, error: rpcErr.message }
      }
      reservationId = resRpc as string
    }

    const cityId = m.cityId || currentUser.cityId
    const insert: Record<string, unknown> = {
      type: m.type,
      title: m.title,
      description: m.description ?? null,
      location: m.location,
      venue: m.venue,
      city_id: cityId,
      date_time: m.dateTime.toISOString(),
      level: m.level,
      creator_id: m.creatorId,
      team_name: m.teamName ?? null,
      players_needed: m.playersNeeded ?? null,
      players_joined: m.playersJoined ?? 0,
      players_seek_profile:
        m.type === 'players' && m.playersSeekProfile
          ? m.playersSeekProfile
          : null,
      gender: m.gender,
      status: m.status,
      sports_venue_id: m.sportsVenueId ?? null,
      venue_reservation_id: reservationId,
    }
    const { data, error } = await supabase
      .from('match_opportunities')
      .insert(insert)
      .select(MATCH_OPPORTUNITY_SELECT_WITH_GEO)
      .single()

    if (error) {
      toast.error(error.message)
      return { ok: false as const, error: error.message }
    }

    const row = data as MatchOpportunityRow
    const oppId = row.id

    if (reservationId) {
      const { error: linkErr } = await supabase
        .from('venue_reservations')
        .update({ match_opportunity_id: oppId })
        .eq('id', reservationId)
      if (linkErr) {
        toast.error(linkErr.message)
      }
    }

    if (m.type === 'open') {
      const { error: partErr } = await supabase
        .from('match_opportunity_participants')
        .insert({
          opportunity_id: oppId,
          user_id: currentUser.id,
          status: 'confirmed',
          is_goalkeeper: m.creatorIsGoalkeeper === true,
        })
      if (partErr) {
        toast.error(partErr.message)
        await supabase.from('match_opportunities').delete().eq('id', oppId)
        return { ok: false as const, error: partErr.message }
      }
    }

    const [matches, partIds] = await Promise.all([
      fetchMatchOpportunities(supabase),
      fetchParticipatingOpportunityIds(supabase, currentUser.id),
    ])
    setMatchOpportunities(matches)
    setParticipatingOpportunityIds(partIds)
    return { ok: true as const }
  }

  const reserveVenueOnly = async ({
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
    const supabase = createClient()
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
    return { ok: true as const }
  }

  const joinMatchOpportunity = async (
    opportunityId: string,
    options?: { isGoalkeeper?: boolean }
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
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

    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    if (opp.dateTime.getTime() < midnight.getTime()) {
      toast.error('Este partido ya pasó. Ya no se puede unir.')
      return
    }
    const cap = opp.playersNeeded ?? 0
    const isGkRequest = options?.isGoalkeeper === true

    let insertAsGk = false

    if (opp.type === 'open') {
      const { data: partRows, error: partQErr } = await supabase
        .from('match_opportunity_participants')
        .select('is_goalkeeper, status')
        .eq('opportunity_id', opportunityId)
      if (partQErr) {
        toast.error(partQErr.message)
        return
      }
      let gkCount = 0
      let fieldCount = 0
      let joinedDb = 0
      for (const p of partRows ?? []) {
        const st = p.status as string
        if (st !== 'pending' && st !== 'confirmed') continue
        joinedDb++
        if (p.is_goalkeeper === true) gkCount++
        else fieldCount++
      }

      if (cap > 0 && joinedDb >= cap) {
        toast.error('No quedan cupos en este partido.')
        return
      }

      const gkLeft = Math.max(0, 2 - gkCount)
      const fieldCap = Math.max(0, cap - 2)
      const fieldLeft = Math.max(0, fieldCap - fieldCount)

      insertAsGk = isGkRequest
      if (insertAsGk) {
        if (gkLeft <= 0) {
          toast.error('Solo quedan cupos de jugadores.')
          return
        }
      } else {
        if (fieldLeft <= 0 && gkLeft > 0) {
          toast.error('Solo quedan cupos de arquero.')
          return
        }
        if (fieldLeft <= 0) {
          toast.error('No quedan cupos en este partido.')
          return
        }
      }
    } else if (opp.type === 'players') {
      const { data: partRows, error: partQErr } = await supabase
        .from('match_opportunity_participants')
        .select('is_goalkeeper, status')
        .eq('opportunity_id', opportunityId)
      if (partQErr) {
        toast.error(partQErr.message)
        return
      }
      let gkCount = 0
      let fieldCount = 0
      let joinedDb = 0
      for (const p of partRows ?? []) {
        const st = p.status as string
        if (st !== 'pending' && st !== 'confirmed') continue
        joinedDb++
        if (p.is_goalkeeper === true) gkCount++
        else fieldCount++
      }
      if (cap > 0 && joinedDb >= cap) {
        toast.error('No quedan cupos en este partido.')
        return
      }
      const rules = playersJoinRules(opp)
      if (rules.kind === 'legacy') {
        insertAsGk = false
      } else if (rules.kind === 'gk_only') {
        if (!isGkRequest) {
          toast.error('Esta búsqueda solo admite arqueros.')
          return
        }
        if (gkCount >= rules.max) {
          toast.error('Ya no quedan cupos de arquero.')
          return
        }
        insertAsGk = true
      } else if (rules.kind === 'field_only') {
        if (isGkRequest) {
          toast.error('Solo buscan jugadores de campo.')
          return
        }
        if (fieldCount >= rules.max) {
          toast.error('No quedan cupos de jugador de campo.')
          return
        }
        insertAsGk = false
      } else {
        const maxField = rules.maxField
        if (isGkRequest) {
          if (gkCount >= 1) {
            toast.error('Ya hay un arquero; en esta búsqueda solo cabe uno.')
            return
          }
          insertAsGk = true
        } else {
          if (fieldCount >= maxField) {
            toast.error('No quedan cupos de jugador de campo.')
            return
          }
          insertAsGk = false
        }
      }
    } else {
      if (cap > 0 && (opp.playersJoined ?? 0) >= cap) {
        toast.error('No quedan cupos en este partido.')
        return
      }
    }

    const { error } = await supabase.from('match_opportunity_participants').insert({
      opportunity_id: opportunityId,
      user_id: currentUser.id,
      status: 'confirmed',
      is_goalkeeper: insertAsGk,
    })
    if (error) {
      if (error.code === '23505') {
        toast.info('Ya estás registrado en este partido.')
      } else {
        toast.error(error.message)
      }
      return
    }
    const [partIds, matches] = await Promise.all([
      fetchParticipatingOpportunityIds(supabase, currentUser.id),
      fetchMatchOpportunities(supabase),
    ])
    setParticipatingOpportunityIds(partIds)
    setMatchOpportunities(matches)
    setSelectedChatOpportunityId(opportunityId)
    setCurrentScreen('chat')
    const joinedFresh = matches.find((m) => m.id === opportunityId)
    const payLine = joinedFresh
      ? payOrganizerToastMessage(joinedFresh)
      : null
    toast.success(
      payLine
        ? `¡Te uniste al partido! Coordina en el chat. ${payLine}`
        : '¡Te uniste al partido! Coordina aquí con el grupo.'
    )
  }

  const randomizeRevueltaTeams = async (
    opportunityId: string,
    colorHexA: string,
    colorHexB: string
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
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
    const supabase = createClient()
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
    const matches = await fetchMatchOpportunities(supabase)
    setMatchOpportunities(matches)
    toast.success('¡Equipos sorteados! Equipo A y Equipo B listos.')
  }

  const finalizeMatchOpportunity = async (
    opportunityId: string,
    outcome:
      | { kind: 'rival'; rivalResult: RivalResult }
      | { kind: 'casual' }
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const opp = matchOpportunities.find((m) => m.id === opportunityId)
    if (!opp || opp.creatorId !== currentUser.id) {
      toast.error('Solo el organizador puede finalizar el partido.')
      return
    }
    if (opp.status === 'completed') {
      toast.info('Este partido ya está finalizado.')
      return
    }
    if (opp.type === 'rival' && outcome.kind !== 'rival') {
      toast.error('Indica el resultado del partido.')
      return
    }
    if (opp.type !== 'rival' && outcome.kind !== 'casual') {
      toast.error('Tipo de partido no válido.')
      return
    }

    const supabase = createClient()
    const now = new Date().toISOString()
    const update: Record<string, unknown> = {
      status: 'completed',
      finalized_at: now,
      updated_at: now,
    }
    if (opp.type === 'rival' && outcome.kind === 'rival') {
      update.rival_result = outcome.rivalResult
      update.casual_completed = null
    } else {
      update.rival_result = null
      update.casual_completed = true
    }

    const { error } = await supabase
      .from('match_opportunities')
      .update(update)
      .eq('id', opportunityId)
      .eq('creator_id', currentUser.id)

    if (error) {
      toast.error(error.message)
      return
    }

    const matches = await fetchMatchOpportunities(supabase)
    setMatchOpportunities(matches)
    toast.success('Partido finalizado. Los jugadores pueden calificar en las próximas 48 h.')
  }

  const suspendMatchOpportunity = async (
    opportunityId: string,
    reason: string
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
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

    const supabase = createClient()
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

    const matches = await fetchMatchOpportunities(supabase)
    setMatchOpportunities(matches)
    toast.success('Partido suspendido.')
  }

  const submitMatchRating = async (
    opportunityId: string,
    payload: {
      organizerRating: number | null
      matchRating: number
      levelRating: number
      comment?: string
    }
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const { error } = await createClient()
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
  }

  const getFilteredMatches = (gender: Gender) => {
    const userRegion = currentUser?.regionId
    return matchOpportunities.filter((m) => {
      if (m.gender !== gender) return false
      if (!userRegion) return true
      if (!m.cityRegionId) return true
      return m.cityRegionId === userRegion
    })
  }

  const getFilteredUsers = (gender: Gender) => {
    return users.filter(
      (u) => u.gender === gender && u.id !== currentUser?.id
    )
  }

  const createTeam = async (team: Omit<Team, 'id' | 'createdAt'>) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
    const { data: teamRow, error } = await supabase
      .from('teams')
      .insert({
        name: team.name,
        logo_url: team.logo ?? null,
        level: team.level,
        captain_id: team.captainId,
        city: team.city,
        city_id: team.cityId,
        gender: team.gender,
        description: team.description ?? null,
      })
      .select(TEAM_SELECT_WITH_GEO)
      .single()

    if (error) {
      if (isTeamLimitReached(error)) {
        toastTeamLimitReached()
      } else {
        toast.error(error.message)
      }
      return
    }

    const captain =
      team.members.find((m) => m.id === currentUser.id) ?? team.members[0]
    if (!captain) {
      toast.error('No se pudo determinar el capitán del equipo.')
      return
    }

    const { error: memErr } = await supabase.from('team_members').insert({
      team_id: teamRow.id,
      user_id: captain.id,
      position: captain.position,
      photo_url: captain.photo,
      status: 'confirmed',
    })

    if (memErr) {
      if (isTeamLimitReached(memErr)) {
        toastTeamLimitReached()
      } else {
      toast.error(memErr.message)
      }
      return
    }

    const [freshTeams, freshInvites] = await Promise.all([
      fetchTeamsWithMembers(supabase),
      fetchTeamInvitesForUser(supabase, currentUser.id),
    ])
    setTeams(freshTeams)
    setTeamInvites(freshInvites)
  }

  const updateTeam = async (
    teamId: string,
    updates: {
      name?: string
      description?: string | null
      logo?: string | null
    }
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
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

    const freshTeams = await fetchTeamsWithMembers(supabase)
    setTeams(freshTeams)
    toast.success('Equipo actualizado')
  }

  const deleteTeam = async (teamId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
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
    const freshTeams = await fetchTeamsWithMembers(supabase)
    setTeams(freshTeams)
  }

  const leaveTeam = async (teamId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
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
      fetchTeamsWithMembers(supabase),
      fetchTeamInvitesForUser(supabase, currentUser.id),
      fetchTeamJoinRequestsForUser(supabase, currentUser.id),
    ])
    setTeams(freshTeams)
    setTeamInvites(freshInvites)
    setTeamJoinRequests(joinReqs)
  }

  const updateTeamPrivateSettings = async (
    teamId: string,
    payload: { whatsappInviteUrl?: string | null; rulesText?: string | null }
  ): Promise<TeamPrivateSettings | null> => {
    if (!currentUser || !isSupabaseConfigured()) return null
    const supabase = createClient()
    const team = teams.find((t) => t.id === teamId)
    if (!team || team.captainId !== currentUser.id) return null

    const { data: cur } = await supabase
      .from('team_private_settings')
      .select('whatsapp_invite_url, rules_text')
      .eq('team_id', teamId)
      .maybeSingle()

    const nextWhatsapp =
      payload.whatsappInviteUrl !== undefined
        ? (payload.whatsappInviteUrl?.trim() || null)
        : ((cur?.whatsapp_invite_url as string | null) ?? null)
    const nextRules =
      payload.rulesText !== undefined
        ? (payload.rulesText?.trim() || null)
        : ((cur?.rules_text as string | null) ?? null)

    const { error } = await supabase.from('team_private_settings').upsert(
      {
        team_id: teamId,
        whatsapp_invite_url: nextWhatsapp,
        rules_text: nextRules,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'team_id' }
    )

    if (error) {
      toast.error(error.message)
      return null
    }

    toast.success('Coordinación del equipo guardada')
    return {
      teamId,
      whatsappInviteUrl: nextWhatsapp,
      rulesText: nextRules,
    }
  }

  const createRivalChallenge = async (payload: {
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
    const supabase = createClient()
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

    const { data: oppData, error: oppErr } = await supabase
      .from('match_opportunities')
      .insert({
        type: 'rival',
        title,
        description,
        location: payload.location,
        venue: payload.venue,
        city_id: rivalCityId,
        date_time: payload.dateTime.toISOString(),
        level: payload.level,
        creator_id: currentUser.id,
        team_name: payload.challengerTeam.name,
        gender: currentUser.gender,
        status: 'pending',
      })
      .select(MATCH_OPPORTUNITY_SELECT_WITH_GEO)
      .single()

    if (oppErr || !oppData) {
      toast.error(oppErr?.message ?? 'No se pudo crear el desafío')
      return
    }

    const challengeInsert = {
      opportunity_id: oppData.id,
      challenger_team_id: payload.challengerTeam.id,
      challenger_captain_id: currentUser.id,
      challenged_team_id:
        payload.mode === 'direct' ? payload.challengedTeam?.id ?? null : null,
      challenged_captain_id:
        payload.mode === 'direct'
          ? payload.challengedTeam?.captainId ?? null
          : null,
      mode: payload.mode,
      status: 'pending',
    }
    const { error: chErr } = await supabase
      .from('rival_challenges')
      .insert(challengeInsert)

    if (chErr) {
      toast.error(chErr.message)
      return
    }

    const row = oppData as MatchOpportunityRow
    const mapped = mapMatchOpportunityFromDb(row, {
      id: currentUser.id,
      name: currentUser.name,
      photo_url: currentUser.photo,
    })
    setMatchOpportunities((prev) => [mapped, ...prev])

    const freshChallenges = await fetchRivalChallengesForUser(supabase, currentUser.id)
    setRivalChallenges(freshChallenges)
    toast.success(
      payload.mode === 'direct'
        ? `Desafío enviado a ${payload.challengedTeam?.name ?? 'equipo rival'}`
        : 'Búsqueda de rival publicada'
    )
  }

  const respondToRivalChallenge = async (
    challengeId: string,
    accept: boolean,
    myTeamId?: string
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
    const challenge = rivalChallenges.find((c) => c.id === challengeId)
    if (!challenge || challenge.status !== 'pending') {
      toast.error('Desafío no disponible.')
      return
    }

    if (!accept) {
      const { error } = await supabase
        .from('rival_challenges')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
          accepted_team_id: null,
          accepted_captain_id: currentUser.id,
        })
        .eq('id', challengeId)
      if (error) toast.error(error.message)
      else toast.success('Desafío rechazado.')
    } else {
      let acceptedTeamId = challenge.challengedTeamId
      if (challenge.mode === 'open') {
        if (!myTeamId) {
          toast.error('Selecciona tu equipo para aceptar este desafío.')
          return
        }
        acceptedTeamId = myTeamId
      }

      const acceptedTeam = teams.find((t) => t.id === acceptedTeamId)
      const challengerTeam = teams.find((t) => t.id === challenge.challengerTeamId)
      const updatePayload: Record<string, unknown> = {
        status: 'accepted',
        responded_at: new Date().toISOString(),
        accepted_team_id: acceptedTeamId,
        accepted_captain_id: currentUser.id,
      }
      if (challenge.mode === 'open') {
        updatePayload.challenged_team_id = acceptedTeamId
        updatePayload.challenged_captain_id = currentUser.id
      }

      const { error: updErr } = await supabase
        .from('rival_challenges')
        .update(updatePayload)
        .eq('id', challengeId)
      if (updErr) {
        toast.error(updErr.message)
        return
      }

      await supabase
        .from('match_opportunities')
        .update({
          status: 'confirmed',
          title:
            challengerTeam && acceptedTeam
              ? `${challengerTeam.name} vs ${acceptedTeam.name}`
              : challenge.opportunityTitle,
        })
        .eq('id', challenge.opportunityId)

      await supabase.from('match_opportunity_participants').upsert({
        opportunity_id: challenge.opportunityId,
        user_id: currentUser.id,
        status: 'confirmed',
        is_goalkeeper: false,
      })

      setSelectedChatOpportunityId(challenge.opportunityId)
      setCurrentScreen('chat')
      toast.success('¡Desafío aceptado! Ya pueden coordinar en el chat.')
    }

    const [freshChallenges, matches, partIds] = await Promise.all([
      fetchRivalChallengesForUser(supabase, currentUser.id),
      fetchMatchOpportunities(supabase),
      fetchParticipatingOpportunityIds(supabase, currentUser.id),
    ])
    setRivalChallenges(freshChallenges)
    setMatchOpportunities(matches)
    setParticipatingOpportunityIds(partIds)
  }

  const acceptRivalOpportunityWithTeam = async (
    opportunityId: string,
    myTeamId: string
  ) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const challenge = rivalChallenges.find(
      (c) => c.opportunityId === opportunityId && c.status === 'pending'
    )
    if (!challenge) {
      toast.error('No se encontró un desafío pendiente para este partido.')
      return
    }
    await respondToRivalChallenge(challenge.id, true, myTeamId)
  }

  const inviteToTeam = async (teamId: string, userId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
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
    const invites = await fetchTeamInvitesForUser(supabase, currentUser.id)
    setTeamInvites(invites)
  }

  const respondToInvite = async (inviteId: string, accept: boolean) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
    const invite = teamInvites.find((i) => i.id === inviteId)
    if (!invite) return

    if (accept) {
      const { error: memErr } = await supabase.from('team_members').insert({
        team_id: invite.teamId,
        user_id: currentUser.id,
        position: currentUser.position,
        photo_url: currentUser.photo,
        status: 'confirmed',
      })
      if (memErr) {
        if (isTeamLimitReached(memErr)) {
          toastTeamLimitReached()
        } else {
        toast.error(memErr.message)
        }
        return
      }
      const { error: updErr } = await supabase
        .from('team_invites')
        .update({ status: 'accepted' })
        .eq('id', inviteId)
      if (updErr) {
        toast.error(updErr.message)
        return
      }
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

    const [freshTeams, freshInvites] = await Promise.all([
      fetchTeamsWithMembers(supabase),
      fetchTeamInvitesForUser(supabase, currentUser.id),
    ])
    setTeams(freshTeams)
    setTeamInvites(freshInvites)
  }

  const requestToJoinTeam = async (teamId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
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
    const list = await fetchTeamJoinRequestsForUser(supabase, currentUser.id)
    setTeamJoinRequests(list)
    toast.success('Solicitud enviada al capitán')
  }

  const respondToJoinRequest = async (requestId: string, accept: boolean) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
    const req = teamJoinRequests.find((r) => r.id === requestId)
    if (!req || req.status !== 'pending') return
    const team = teams.find((t) => t.id === req.teamId)
    if (!team || team.captainId !== currentUser.id) return

    if (!accept) {
      const { error } = await supabase
        .from('team_join_requests')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', requestId)
      if (error) {
        toast.error(error.message)
        return
      }
      const list = await fetchTeamJoinRequestsForUser(supabase, currentUser.id)
      setTeamJoinRequests(list)
      toast.success('Solicitud rechazada')
      return
    }

    if (team.members.length >= 6) {
      toast.error('La plantilla ya está completa (6 jugadores).')
      return
    }

    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('position, photo_url')
      .eq('id', req.requesterId)
      .single()

    if (profErr || !prof) {
      toast.error('No se pudo cargar el perfil del jugador.')
      return
    }

    const { error: memErr } = await supabase.from('team_members').insert({
      team_id: req.teamId,
      user_id: req.requesterId,
      position: prof.position,
      photo_url: (prof.photo_url as string) || DEFAULT_AVATAR,
      status: 'confirmed',
    })
    if (memErr) {
      if (isTeamLimitReached(memErr)) {
        toastTeamLimitReached()
      } else {
      toast.error(memErr.message)
      }
      return
    }

    const { error: updErr } = await supabase
      .from('team_join_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', requestId)
    if (updErr) {
      toast.error(updErr.message)
      return
    }

    const [freshTeams, list] = await Promise.all([
      fetchTeamsWithMembers(supabase),
      fetchTeamJoinRequestsForUser(supabase, currentUser.id),
    ])
    setTeams(freshTeams)
    setTeamJoinRequests(list)
    toast.success(`${req.requesterName} ya es parte del equipo`)
  }

  const cancelJoinRequest = async (requestId: string) => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
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
    const list = await fetchTeamJoinRequestsForUser(supabase, currentUser.id)
    setTeamJoinRequests(list)
    toast.success('Solicitud cancelada')
  }

  const getUserTeams = () => {
    if (!currentUser) return []
    return teams.filter(
      (t) =>
        t.captainId === currentUser.id ||
        t.members.some((m) => m.id === currentUser.id)
    )
  }

  const getFilteredTeams = (gender: Gender) => {
    return teams.filter((t) => t.gender === gender)
  }

  const refreshAppData = useCallback(async () => {
    if (!currentUser || !isSupabaseConfigured()) return
    try {
      const supabase = createClient()
      const [matches, others, teamList, invites, joinReqs, partIds, challenges] =
        await Promise.all([
          fetchMatchOpportunities(supabase),
          fetchOtherProfiles(supabase, currentUser.id, currentUser.gender),
          fetchTeamsWithMembers(supabase),
          fetchTeamInvitesForUser(supabase, currentUser.id),
          fetchTeamJoinRequestsForUser(supabase, currentUser.id),
          fetchParticipatingOpportunityIds(supabase, currentUser.id),
          fetchRivalChallengesForUser(supabase, currentUser.id),
        ])
      setMatchOpportunities(matches)
      setUsers(others)
      setTeams(teamList)
      setTeamInvites(invites)
      setTeamJoinRequests(joinReqs)
      setParticipatingOpportunityIds(partIds)
      setRivalChallenges(challenges)
    } catch {
      // red/offline
    }
  }, [currentUser])

  const clearSessionState = useCallback(() => {
    try {
      sessionStorage.removeItem(JOIN_TEAM_STORAGE_KEY)
      sessionStorage.removeItem(JOIN_MATCH_STORAGE_KEY)
      sessionStorage.removeItem(JOIN_REGISTER_STORAGE_KEY)
      sessionStorage.removeItem(OPEN_CREATE_AFTER_AUTH_KEY)
    } catch {
      // ignore
    }
    setCurrentUser(null)
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
      const supabase = createClient()
      const profile = await fetchProfileForUser(supabase, authUser.id, email)
      if (!profile) return
      setCurrentUser(profile)

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

      const [matches, others, teamList, invites, joinReqs, partIds, challenges] =
        await Promise.all([
          fetchMatchOpportunities(supabase),
          fetchOtherProfiles(supabase, authUser.id, profile.gender),
          fetchTeamsWithMembers(supabase),
          fetchTeamInvitesForUser(supabase, authUser.id),
          fetchTeamJoinRequestsForUser(supabase, authUser.id),
          fetchParticipatingOpportunityIds(supabase, authUser.id),
          fetchRivalChallengesForUser(supabase, authUser.id),
        ])
      setMatchOpportunities(matches)
      setUsers(others)
      setTeams(teamList)
      setTeamInvites(invites)
      setTeamJoinRequests(joinReqs)
      setParticipatingOpportunityIds(partIds)
      setRivalChallenges(challenges)
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

    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch {
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
    if (typeof window === 'undefined') return
    try {
      const sp = new URLSearchParams(window.location.search)
      const jt = sp.get('joinTeam')
      if (jt && isValidTeamInviteId(jt)) {
        sessionStorage.setItem(JOIN_TEAM_STORAGE_KEY, jt)
      }
      const jm = sp.get('joinMatch')
      if (jm && isValidTeamInviteId(jm)) {
        sessionStorage.setItem(JOIN_MATCH_STORAGE_KEY, jm)
      }
      if (sp.get('register') === '1') {
        sessionStorage.setItem(JOIN_REGISTER_STORAGE_KEY, '1')
      }
      if (jt || jm || sp.get('register') === '1') {
        window.history.replaceState({}, '', '/')
      }
    } catch {
      // modo privado / storage bloqueado
    }
  }, [])

  useEffect(() => {
    capturePrefillCreateQuery()
  }, [])

  /** `/?screen=...`: navegación directa desde páginas públicas (ej: centro). */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'player') return
    if (needsOnboardingProfile(currentUser)) return
    if (typeof window === 'undefined') return
    try {
      const sp = new URLSearchParams(window.location.search)
      const screen = sp.get('screen')
      if (!screen) return
      if (!PLAYER_NAV_SCREENS.has(screen as AppScreen)) {
        window.history.replaceState({}, '', '/')
        return
      }
      setCurrentScreen(screen as AppScreen)
      persistPlayerLastNav(screen as PlayerNavId)
      window.history.replaceState({}, '', '/')
    } catch {
      // ignore
    }
  }, [authLoading, currentUser])

  /** Recordar última pestaña principal (barra inferior en `/centro/...`). */
  useEffect(() => {
    if (!currentUser || currentUser.accountType !== 'player') return
    if (!PLAYER_NAV_SCREENS.has(currentScreen)) return
    persistPlayerLastNav(currentScreen as PlayerNavId)
  }, [currentUser, currentScreen])

  /** Jugador ya con sesión: abrir Crear si venía de un centro (`/?prefillCreate=1`). */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'player') return
    if (needsOnboardingProfile(currentUser)) return
    if (tryNavigateCreateAfterPlayerReady()) {
      setCurrentScreen('create')
    }
  }, [authLoading, currentUser])

  /** Cuenta centro: onboarding sin `sports_venues` o panel si ya existe. */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'venue') return
    if (currentScreen === 'auth') return

    let cancelled = false
    void (async () => {
      try {
        if (!isSupabaseConfigured()) return
        const supabase = createClient()
        const v = await fetchVenueForOwner(supabase, currentUser.id)
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

  /** Invitación con registro: abrir auth desde landing */
  useEffect(() => {
    if (authLoading || currentUser) return
    if (currentScreen !== 'landing') return
    try {
      if (sessionStorage.getItem(JOIN_REGISTER_STORAGE_KEY) === '1') {
        setCurrentScreen('auth')
      }
    } catch {
      // ignore
    }
  }, [authLoading, currentUser, currentScreen])

  /**
   * Tras OAuth (o recarga en `/`) la pantalla vuelve a `landing` con sesión ya activa:
   * enviamos al jugador al home u onboarding como en el login por email.
   */
  useEffect(() => {
    if (authLoading || !currentUser) return
    if (currentUser.accountType !== 'player') return
    if (currentScreen !== 'landing' && currentScreen !== 'auth') return
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
    if (needsOnboardingProfile(currentUser)) return
    let tid: string | null = null
    let mid: string | null = null
    try {
      tid = sessionStorage.getItem(JOIN_TEAM_STORAGE_KEY)
      mid = sessionStorage.getItem(JOIN_MATCH_STORAGE_KEY)
    } catch {
      return
    }
    if (tid && isValidTeamInviteId(tid)) {
      try {
        sessionStorage.removeItem(JOIN_TEAM_STORAGE_KEY)
      } catch {
        // ignore
      }
      setTeamsDetailFocusTeamId(tid)
      setCurrentScreen('teams')
      return
    }
    if (mid && isValidTeamInviteId(mid)) {
      try {
        sessionStorage.removeItem(JOIN_MATCH_STORAGE_KEY)
      } catch {
        // ignore
      }
      setSelectedMatchOpportunityId(mid)
      setCurrentScreen('matchDetails')
    }
  }, [authLoading, currentUser])

  const refreshTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) return
    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch {
      return
    }

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => {
        void refreshAppData()
      }, 250)
    }

    const channel = supabase
      .channel(`app-realtime:${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_opportunities' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_opportunity_participants' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rival_challenges' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_invites' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_join_requests' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_members' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_private_settings' },
        scheduleRefresh
      )
      .subscribe()

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      supabase.removeChannel(channel)
    }
  }, [currentUser, refreshAppData])

  return (
    <AppContext.Provider
      value={{
        authLoading,
        currentScreen,
        setCurrentScreen,
        currentUser,
        setCurrentUser,
        isAuthenticated,
        login,
        loginWithGoogle,
        logout,
        completeOnboarding,
        completeVenueOnboarding,
        openProfileEditor,
        onboardingSource,
        setOnboardingSource,
        updateProfilePhoto,
        matchOpportunities,
        addMatchOpportunity,
        reserveVenueOnly,
        joinMatchOpportunity,
        randomizeRevueltaTeams,
        finalizeMatchOpportunity,
        suspendMatchOpportunity,
        submitMatchRating,
        users,
        getFilteredMatches,
        getFilteredUsers,
        teams,
        teamInvites,
        teamJoinRequests,
        rivalChallenges,
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
        getUserTeams,
        getFilteredTeams,
        participatingOpportunityIds,
        selectedChatOpportunityId,
        setSelectedChatOpportunityId,
        selectedMatchOpportunityId,
        setSelectedMatchOpportunityId,
        initialMatchesTab,
        setInitialMatchesTab,
        teamsDetailFocusTeamId,
        setTeamsDetailFocusTeamId,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
