import type {
  Gender,
  Level,
  MatchOpportunity,
  MatchesHubTab,
  OnboardingData,
  VenueOnboardingData,
  RevueltaResult,
  RivalChallenge,
  RivalResult,
  Team,
  TeamInvite,
  TeamJoinRequest,
  TeamPrivateSettings,
  User,
} from './types'

export type AppScreen =
  | 'landing'
  | 'auth'
  | 'onboarding'
  | 'home'
  | 'create'
  | 'explore'
  | 'matches'
  | 'chat'
  | 'matchDetails'
  | 'profile'
  | 'teams'
  | 'venueOnboarding'
  | 'venueDashboard'
  | 'adminDashboard'

export const PLAYER_NAV_SCREENS = new Set<AppScreen>([
  'home',
  'explore',
  'matches',
  'create',
  'teams',
  'profile',
])

/** Contrato único de la app; `useApp()` y los contextos por dominio lo satisfacen entre todos. */
export interface AppContextType {
  authLoading: boolean
  currentScreen: AppScreen
  setCurrentScreen: (screen: AppScreen) => void
  currentUser: User | null
  setCurrentUser: (user: User | null) => void
  isAuthenticated: boolean
  login: (
    email: string,
    password: string,
    isSignUp: boolean
  ) => Promise<{
    ok: boolean
    error?: string
    needsOnboarding?: boolean
    needsVenueOnboarding?: boolean
    isVenue?: boolean
    isAdmin?: boolean
  }>
  loginWithGoogle: () => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  completeOnboarding: (data: OnboardingData) => Promise<void>
  completeVenueOnboarding: (data: VenueOnboardingData) => Promise<void>
  openProfileEditor: () => void
  onboardingSource: 'registration' | 'profile_edit'
  setOnboardingSource: (source: 'registration' | 'profile_edit') => void
  updateProfilePhoto: (file: File) => Promise<{ ok: boolean; error?: string }>
  profilePhotoCacheBust: number
  bumpProfilePhotoCache: () => void
  profilesRealtimeGeneration: number
  avatarDisplayUrl: (
    url: string | null | undefined,
    userId?: string | null
  ) => string
  matchOpportunities: MatchOpportunity[]
  addMatchOpportunity: (
    match: Omit<MatchOpportunity, 'id' | 'createdAt'> & {
      creatorIsGoalkeeper?: boolean
      bookCourtSlot?: boolean
      courtSlotMinutes?: number
    }
  ) => Promise<{ ok: true } | { ok: false; code?: 'no_court'; error: string }>
  reserveVenueOnly: (payload: {
    sportsVenueId: string
    startsAt: Date
    durationMinutes: number
  }) => Promise<{ ok: true } | { ok: false; code?: 'no_court'; error: string }>
  joinMatchOpportunity: (
    opportunityId: string,
    options?: { isGoalkeeper?: boolean }
  ) => Promise<void>
  requestJoinPrivateRevuelta: (
    opportunityId: string,
    isGoalkeeper: boolean
  ) => Promise<{ ok: boolean; error?: string }>
  respondToRevueltaExternalRequest: (
    requestId: string,
    accept: boolean
  ) => Promise<{ ok: boolean; error?: string }>
  randomizeRevueltaTeams: (
    opportunityId: string,
    colorHexA: string,
    colorHexB: string
  ) => Promise<void>
  finalizeMatchOpportunity: (
    opportunityId: string,
    outcome:
      | { kind: 'casual' }
      | { kind: 'revuelta'; revueltaResult: RevueltaResult }
      | { kind: 'rival'; rivalResult: RivalResult }
  ) => Promise<boolean>
  submitRivalCaptainVote: (
    opportunityId: string,
    vote: RivalResult
  ) => Promise<void>
  finalizeRivalOrganizerOverride: (
    opportunityId: string,
    result: RivalResult
  ) => Promise<void>
  refreshCurrentUserProfile: () => Promise<void>
  suspendMatchOpportunity: (
    opportunityId: string,
    reason: string
  ) => Promise<void>
  leaveMatchOpportunityWithReason: (
    opportunityId: string,
    reason: string
  ) => Promise<void>
  rescheduleMatchOpportunityWithReason: (payload: {
    opportunityId: string
    venue: string
    location: string
    dateTime: Date
    reason: string
  }) => Promise<void>
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
  teamJoinRequests: TeamJoinRequest[]
  rivalChallenges: RivalChallenge[]
  createTeam: (team: Omit<Team, 'id' | 'createdAt'>) => Promise<void>
  updateTeam: (
    teamId: string,
    updates: {
      name?: string
      description?: string | null
      logo?: string | null
    }
  ) => Promise<void>
  deleteTeam: (teamId: string) => Promise<void>
  leaveTeam: (teamId: string) => Promise<void>
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
  requestToJoinTeam: (teamId: string) => Promise<void>
  respondToJoinRequest: (requestId: string, accept: boolean) => Promise<void>
  cancelJoinRequest: (requestId: string) => Promise<void>
  setTeamViceCaptain: (
    teamId: string,
    viceUserId: string | null
  ) => Promise<void>
  removeTeamMember: (teamId: string, memberUserId: string) => Promise<void>
  getUserTeams: () => Team[]
  getFilteredTeams: (gender: Gender) => Team[]
  participatingOpportunityIds: string[]
  selectedChatOpportunityId: string | null
  setSelectedChatOpportunityId: (id: string | null) => void
  selectedMatchOpportunityId: string | null
  setSelectedMatchOpportunityId: (id: string | null) => void
  publicProfileUserId: string | null
  openPublicProfile: (userId: string) => void
  closePublicProfile: () => void
  initialMatchesTab: MatchesHubTab | null
  setInitialMatchesTab: (tab: MatchesHubTab | null) => void
  teamsDetailFocusTeamId: string | null
  setTeamsDetailFocusTeamId: (id: string | null) => void
}
