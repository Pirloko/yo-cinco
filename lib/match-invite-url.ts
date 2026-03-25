import { isValidTeamInviteId } from '@/lib/team-invite-url'

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
