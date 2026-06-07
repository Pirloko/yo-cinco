import type { MatchStatus, MatchType, RevueltaResult, RivalResult } from '@/lib/types'

export type AdminMatchDisplayStatus =
  | 'programado'
  | 'confirmado'
  | 'finalizado'
  | 'suspendido'
  | 'cancelado'

export type AdminMatchOutcomeTone = 'neutral' | 'success' | 'warning' | 'muted'

export type AdminMatchListItem = {
  id: string
  type: MatchType
  typeLabel: string
  title: string
  status: MatchStatus
  displayStatus: AdminMatchDisplayStatus
  outcomeLabel: string | null
  outcomeTone: AdminMatchOutcomeTone
  dateTime: string
  level: string
  location: string
  venue: string
  cityId: string
  cityName: string | null
  regionId: string | null
  regionName: string | null
  creatorId: string
  creatorName: string
  creatorAccountType: string | null
  playersJoined: number
  playersNeeded: number
  suspendedReason: string | null
  finalizedAt: string | null
  isMine: boolean
}

export type AdminMatchListSummary = {
  total: number
  upcoming: number
  completed: number
  suspended: number
  active: number
}

export function adminMatchTypeLabel(type: string): string {
  switch (type) {
    case 'open':
      return 'Revuelta'
    case 'team_pick_public':
      return 'Selección pública'
    case 'team_pick_private':
      return 'Selección privada'
    case 'rival':
      return 'Rival'
    case 'players':
      return 'Yo + cinco'
    default:
      return type
  }
}

export function adminMatchDisplayStatus(row: {
  status: string
  suspended_at?: string | null
}): AdminMatchDisplayStatus {
  if (row.status === 'completed') return 'finalizado'
  if (row.status === 'cancelled') {
    return row.suspended_at ? 'suspendido' : 'cancelado'
  }
  if (row.status === 'confirmed') return 'confirmado'
  return 'programado'
}

export function adminMatchOutcomeLabel(row: {
  type: string
  status: string
  suspended_at?: string | null
  casual_completed?: boolean | null
  revuelta_result?: string | null
  rival_result?: string | null
  rival_outcome_disputed?: boolean | null
}): { label: string | null; tone: AdminMatchOutcomeTone } {
  if (row.status === 'cancelled' && row.suspended_at) {
    return { label: 'Partido suspendido', tone: 'warning' }
  }
  if (row.status === 'cancelled') {
    return { label: 'Sin resultado', tone: 'muted' }
  }
  if (row.status !== 'completed') {
    return { label: null, tone: 'neutral' }
  }

  if (row.type === 'rival') {
    if (row.rival_outcome_disputed) {
      return { label: 'Resultado en disputa', tone: 'warning' }
    }
    const map: Record<RivalResult, string> = {
      creator_team: 'Ganó equipo organizador',
      rival_team: 'Ganó equipo rival',
      draw: 'Empate',
    }
    const r = row.rival_result as RivalResult | null
    return r ? { label: map[r], tone: r === 'draw' ? 'neutral' : 'success' } : { label: 'Sin marcador', tone: 'muted' }
  }

  if (
    row.type === 'open' ||
    row.type === 'team_pick_public' ||
    row.type === 'team_pick_private'
  ) {
    const map: Record<RevueltaResult, string> = {
      team_a: 'Ganó equipo A',
      team_b: 'Ganó equipo B',
      draw: 'Empate',
    }
    const r = row.revuelta_result as RevueltaResult | null
    return r ? { label: map[r], tone: r === 'draw' ? 'neutral' : 'success' } : { label: 'Sin marcador', tone: 'muted' }
  }

  if (row.type === 'players') {
    if (row.casual_completed) {
      return { label: 'Jugado (sin marcador)', tone: 'success' }
    }
    return { label: 'Finalizado', tone: 'success' }
  }

  return { label: null, tone: 'neutral' }
}

type DbMatchRow = Record<string, unknown>

export function mapAdminMatchListItem(
  row: DbMatchRow,
  meta: {
    cityName: string | null
    regionId: string | null
    regionName: string | null
    creatorName: string
    creatorAccountType: string | null
    adminUserId: string
  }
): AdminMatchListItem {
  const type = row.type as MatchType
  const status = row.status as MatchStatus
  const displayStatus = adminMatchDisplayStatus({
    status,
    suspended_at: row.suspended_at as string | null,
  })
  const outcome = adminMatchOutcomeLabel({
    type,
    status,
    suspended_at: row.suspended_at as string | null,
    casual_completed: row.casual_completed as boolean | null,
    revuelta_result: row.revuelta_result as string | null,
    rival_result: row.rival_result as string | null,
    rival_outcome_disputed: row.rival_outcome_disputed as boolean | null,
  })

  return {
    id: row.id as string,
    type,
    typeLabel: adminMatchTypeLabel(type),
    title: (row.title as string) ?? 'Partido',
    status,
    displayStatus,
    outcomeLabel: outcome.label,
    outcomeTone: outcome.tone,
    dateTime: row.date_time as string,
    level: (row.level as string) ?? '',
    location: (row.location as string) ?? '',
    venue: (row.venue as string) ?? '',
    cityId: (row.city_id as string) ?? '',
    cityName: meta.cityName,
    regionId: meta.regionId,
    regionName: meta.regionName,
    creatorId: row.creator_id as string,
    creatorName: meta.creatorName,
    creatorAccountType: meta.creatorAccountType,
    playersJoined: (row.players_joined as number) ?? 0,
    playersNeeded: (row.players_needed as number) ?? 0,
    suspendedReason: (row.suspended_reason as string | null) ?? null,
    finalizedAt: (row.finalized_at as string | null) ?? null,
    isMine: row.creator_id === meta.adminUserId,
  }
}
