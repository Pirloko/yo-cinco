import { isValidTeamInviteId } from '@/lib/team-invite-url'
import type { MatchType } from '@/lib/types'

export { isValidTeamInviteId as isValidOpportunityInviteId }

export const JOIN_MATCH_STORAGE_KEY = 'pichanga_join_match'

export function revueltaPublicPagePath(opportunityId: string): string {
  return `/revuelta/${opportunityId}`
}

export function revueltaInviteAbsoluteUrl(
  opportunityId: string,
  origin: string
): string {
  const base = origin.replace(/\/$/, '')
  return `${base}${revueltaPublicPagePath(opportunityId)}`
}

/** Deep link que abre la app en el flujo de unirse al partido (todos los `match_type`). */
export function matchAppJoinAbsoluteUrl(
  opportunityId: string,
  origin: string
): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/?joinMatch=${encodeURIComponent(opportunityId)}`
}

/** Página pública `/revuelta/[id]` solo existe para estos tipos. */
export function matchHasPublicInvitePage(type: MatchType): boolean {
  return type === 'open' || type === 'team_pick_public'
}
