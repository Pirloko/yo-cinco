const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidTeamInviteId(id: string): boolean {
  return UUID_RE.test(id.trim())
}

export function teamInvitePagePath(teamId: string): string {
  return `/equipo/${teamId}`
}

/** URL pública para compartir (WhatsApp, etc.). */
export function teamInviteAbsoluteUrl(teamId: string, origin: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}${teamInvitePagePath(teamId)}`
}

export const JOIN_TEAM_STORAGE_KEY = 'pichanga_join_team'
export const JOIN_REGISTER_STORAGE_KEY = 'pichanga_join_register'
