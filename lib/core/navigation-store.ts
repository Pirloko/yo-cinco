import {
  JOIN_REGISTER_STORAGE_KEY,
  JOIN_TEAM_STORAGE_KEY,
  isValidTeamInviteId,
} from '@/lib/team-invite-url'
import { JOIN_MATCH_STORAGE_KEY } from '@/lib/match-invite-url'
import { OPEN_CREATE_AFTER_AUTH_KEY } from '@/lib/create-prefill'
import type { AppScreen } from '@/lib/app-context-contract'

export function clearSessionNavigationState() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(JOIN_TEAM_STORAGE_KEY)
    sessionStorage.removeItem(JOIN_MATCH_STORAGE_KEY)
    sessionStorage.removeItem(JOIN_REGISTER_STORAGE_KEY)
    sessionStorage.removeItem(OPEN_CREATE_AFTER_AUTH_KEY)
  } catch {
    // ignore
  }
}

export function captureInviteParamsFromUrl() {
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
    // ignore
  }
}

export function shouldOpenAuthFromRegisterInvite(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(JOIN_REGISTER_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function consumePendingPlayerDeepLink(): {
  teamId: string | null
  matchId: string | null
} {
  if (typeof window === 'undefined') return { teamId: null, matchId: null }
  try {
    const teamIdRaw = sessionStorage.getItem(JOIN_TEAM_STORAGE_KEY)
    const matchIdRaw = sessionStorage.getItem(JOIN_MATCH_STORAGE_KEY)
    const teamId = teamIdRaw && isValidTeamInviteId(teamIdRaw) ? teamIdRaw : null
    const matchId = matchIdRaw && isValidTeamInviteId(matchIdRaw) ? matchIdRaw : null
    if (teamId) sessionStorage.removeItem(JOIN_TEAM_STORAGE_KEY)
    if (matchId) sessionStorage.removeItem(JOIN_MATCH_STORAGE_KEY)
    return { teamId, matchId }
  } catch {
    return { teamId: null, matchId: null }
  }
}

export function consumeScreenQueryParam(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const sp = new URLSearchParams(window.location.search)
    const screen = sp.get('screen')
    if (screen) {
      window.history.replaceState({}, '', '/')
    }
    return screen
  } catch {
    return null
  }
}

export function resolvePlayerScreenFromQuery(
  screen: string | null,
  allowedScreens: ReadonlySet<string>
): AppScreen | null {
  if (!screen) return null
  if (!allowedScreens.has(screen)) return null
  return screen as AppScreen
}
