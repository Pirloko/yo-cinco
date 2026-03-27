const RIVAL_TARGET_TEAM_KEY = 'pichanga_rival_target_team_id'

export function saveRivalTargetTeamId(teamId: string) {
  try {
    sessionStorage.setItem(RIVAL_TARGET_TEAM_KEY, teamId)
  } catch {
    // ignore
  }
}

export function consumeRivalTargetTeamId(): string | null {
  try {
    const id = sessionStorage.getItem(RIVAL_TARGET_TEAM_KEY)
    if (id) sessionStorage.removeItem(RIVAL_TARGET_TEAM_KEY)
    return id
  } catch {
    return null
  }
}
