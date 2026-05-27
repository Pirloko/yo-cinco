import type { MatchOpportunity, RivalChallenge, Team } from '@/lib/types'
import { userIsConfirmedMemberOfTeam } from '@/lib/team-membership'

export function findRivalChallengeForOpportunity(
  rivalChallenges: RivalChallenge[],
  opportunityId: string
): RivalChallenge | undefined {
  return rivalChallenges.find((c) => c.opportunityId === opportunityId)
}

/** Miembro confirmado (o capitán) de retador o rival aceptado. */
export function userIsMemberOfRivalDuelTeam(
  challenge: RivalChallenge | null | undefined,
  teams: Team[],
  userId: string
): boolean {
  if (!challenge || !userId) return false
  const challenger = teams.find((t) => t.id === challenge.challengerTeamId)
  if (userIsConfirmedMemberOfTeam(challenger, userId)) return true
  if (!challenge.acceptedTeamId) return false
  const accepted = teams.find((t) => t.id === challenge.acceptedTeamId)
  return userIsConfirmedMemberOfTeam(accepted, userId)
}

/** Duelo cerrado entre dos equipos (rival ya aceptó; no es búsqueda abierta pendiente). */
export function isScheduledRivalDuel(
  opportunity: MatchOpportunity | null | undefined,
  challenge: RivalChallenge | null | undefined
): boolean {
  if (!opportunity || !challenge) return false
  if (challenge.opportunityId !== opportunity.id) return false
  return challenge.status === 'accepted' && !!challenge.acceptedTeamId
}

/** Usuario ajeno a ambos equipos: solo puede ver detalle, no unirse ni aceptar desafío. */
export function isRivalDuelSpectator(
  opportunity: MatchOpportunity,
  challenge: RivalChallenge | null | undefined,
  teams: Team[],
  userId: string,
  opts?: { isCreator?: boolean; isParticipant?: boolean }
): boolean {
  if (!isScheduledRivalDuel(opportunity, challenge)) return false
  if (opts?.isCreator || opts?.isParticipant) return false
  return !userIsMemberOfRivalDuelTeam(challenge, teams, userId)
}
