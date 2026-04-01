import type { Team } from '@/lib/types'

/** Dueño del equipo (capitán principal). Puede editar datos sensibles y coordinación privada. */
export function userIsTeamPrimaryCaptain(
  team: Team | null | undefined,
  userId: string
): boolean {
  if (!team || !userId) return false
  return team.captainId === userId
}

/** Capitán principal o vicecapitán: plantilla, solicitudes, desafíos. */
export function userIsTeamStaffCaptain(
  team: Team | null | undefined,
  userId: string
): boolean {
  if (!team || !userId) return false
  if (team.captainId === userId) return true
  if (team.viceCaptainId && team.viceCaptainId === userId) return true
  return false
}

/** Alineado con `is_confirmed_team_member` en BD: capitán o miembro confirmado en plantel. */
export function userIsConfirmedMemberOfTeam(
  team: Team | null | undefined,
  userId: string
): boolean {
  if (!team || !userId) return false
  if (team.captainId === userId) return true
  return team.members.some(
    (m) => m.id === userId && m.status === 'confirmed'
  )
}
