'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import type { AppContextType } from '@/lib/app-context-contract'

export type UIContextValue = Pick<
  AppContextType,
  | 'currentScreen'
  | 'setCurrentScreen'
  | 'selectedChatOpportunityId'
  | 'setSelectedChatOpportunityId'
  | 'selectedMatchOpportunityId'
  | 'setSelectedMatchOpportunityId'
  | 'publicProfileUserId'
  | 'openPublicProfile'
  | 'closePublicProfile'
  | 'initialMatchesTab'
  | 'setInitialMatchesTab'
  | 'teamsDetailFocusTeamId'
  | 'setTeamsDetailFocusTeamId'
  | 'onboardingSource'
  | 'setOnboardingSource'
  | 'openProfileEditor'
>

export type AuthContextValue = Pick<
  AppContextType,
  | 'authLoading'
  | 'currentUser'
  | 'setCurrentUser'
  | 'isAuthenticated'
  | 'login'
  | 'loginWithGoogle'
  | 'logout'
  | 'completeOnboarding'
  | 'completeVenueOnboarding'
  | 'updateProfilePhoto'
  | 'profilePhotoCacheBust'
  | 'bumpProfilePhotoCache'
  | 'profilesRealtimeGeneration'
  | 'avatarDisplayUrl'
  | 'refreshCurrentUserProfile'
>

export type MatchContextValue = Pick<
  AppContextType,
  | 'matchOpportunities'
  | 'addMatchOpportunity'
  | 'reserveVenueOnly'
  | 'joinMatchOpportunity'
  | 'joinTeamPickMatchOpportunity'
  | 'resolveTeamPickPrivateJoinCode'
  | 'setTeamPickParticipantLineup'
  | 'organizerRemoveTeamPickParticipant'
  | 'requestJoinPrivateRevuelta'
  | 'respondToRevueltaExternalRequest'
  | 'randomizeRevueltaTeams'
  | 'finalizeMatchOpportunity'
  | 'submitRivalCaptainVote'
  | 'finalizeRivalOrganizerOverride'
  | 'suspendMatchOpportunity'
  | 'leaveMatchOpportunityWithReason'
  | 'rescheduleMatchOpportunityWithReason'
  | 'submitMatchRating'
  | 'users'
  | 'getFilteredMatches'
  | 'getFilteredUsers'
  | 'participatingOpportunityIds'
  | 'rivalChallenges'
>

export type TeamContextValue = Pick<
  AppContextType,
  | 'teams'
  | 'teamInvites'
  | 'teamJoinRequests'
  | 'createTeam'
  | 'updateTeam'
  | 'deleteTeam'
  | 'leaveTeam'
  | 'updateTeamPrivateSettings'
  | 'createRivalChallenge'
  | 'respondToRivalChallenge'
  | 'acceptRivalOpportunityWithTeam'
  | 'inviteToTeam'
  | 'respondToInvite'
  | 'requestToJoinTeam'
  | 'respondToJoinRequest'
  | 'cancelJoinRequest'
  | 'setTeamViceCaptain'
  | 'removeTeamMember'
  | 'getUserTeams'
  | 'getFilteredTeams'
>

const UIAppContext = createContext<UIContextValue | undefined>(undefined)
const AuthAppContext = createContext<AuthContextValue | undefined>(undefined)
const MatchAppContext = createContext<MatchContextValue | undefined>(undefined)
const TeamAppContext = createContext<TeamContextValue | undefined>(undefined)

export function AppDomainProviders({
  ui,
  auth,
  match,
  team,
  children,
}: {
  ui: UIContextValue
  auth: AuthContextValue
  match: MatchContextValue
  team: TeamContextValue
  children: ReactNode
}) {
  return (
    <UIAppContext.Provider value={ui}>
      <AuthAppContext.Provider value={auth}>
        <MatchAppContext.Provider value={match}>
          <TeamAppContext.Provider value={team}>{children}</TeamAppContext.Provider>
        </MatchAppContext.Provider>
      </AuthAppContext.Provider>
    </UIAppContext.Provider>
  )
}

export function useAppUI(): UIContextValue {
  const v = useContext(UIAppContext)
  if (!v) throw new Error('useAppUI must be used within AppProvider')
  return v
}

export function useAppAuth(): AuthContextValue {
  const v = useContext(AuthAppContext)
  if (!v) throw new Error('useAppAuth must be used within AppProvider')
  return v
}

export function useAppMatch(): MatchContextValue {
  const v = useContext(MatchAppContext)
  if (!v) throw new Error('useAppMatch must be used within AppProvider')
  return v
}

export function useAppTeam(): TeamContextValue {
  const v = useContext(TeamAppContext)
  if (!v) throw new Error('useAppTeam must be used within AppProvider')
  return v
}

/** Compone los cuatro dominios en el objeto plano histórico (misma forma que antes). */
export function useComposedAppContext(): AppContextType {
  const ui = useAppUI()
  const auth = useAppAuth()
  const match = useAppMatch()
  const team = useAppTeam()
  return useMemo(
    () => ({
      ...ui,
      ...auth,
      ...match,
      ...team,
    }),
    [ui, auth, match, team]
  )
}
