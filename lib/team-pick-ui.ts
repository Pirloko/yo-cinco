import type {
  EncounterLineupRole,
  Gender,
  Level,
  MatchOpportunity,
  MatchType,
  PickTeamSide,
} from '@/lib/types'

/** Valores por defecto al crear selección de equipos (rojo / azul). */
export const DEFAULT_TEAM_PICK_COLOR_A = '#dc2626'
export const DEFAULT_TEAM_PICK_COLOR_B = '#2563eb'

/** Camisetas: solo estos colores en creación/edición desde la app. */
export const TEAM_PICK_JERSEY_PRESETS: ReadonlyArray<{ label: string; hex: string }> =
  [
    { label: 'Negro', hex: '#000000' },
    { label: 'Blanco', hex: '#ffffff' },
    { label: 'Rojo', hex: '#dc2626' },
    { label: 'Azul', hex: '#2563eb' },
  ]

const PRESET_HEX_SET = new Set(
  TEAM_PICK_JERSEY_PRESETS.map((p) => p.hex.toLowerCase())
)

const HEX6 = /^#[0-9A-Fa-f]{6}$/

export function normalizeTeamPickHexColor(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!HEX6.test(s)) return null
  return s.toLowerCase()
}

/** Solo acepta uno de los 4 presets; útil para persistir desde el formulario de creación. */
export function coerceTeamPickJerseyPresetHex(
  raw: string | null | undefined
): string | null {
  const n = normalizeTeamPickHexColor(raw ?? undefined)
  if (!n || !PRESET_HEX_SET.has(n)) return null
  return n
}

/**
 * Color de primer plano legible sobre un fondo de color de equipo (#RRGGBB).
 * Corrige texto casi blanco sobre camiseta blanca (p. ej. Equipo B).
 */
export function teamPickContrastForeground(bgHex: string): string {
  const n = normalizeTeamPickHexColor(bgHex)
  if (!n) return '#fafafa'
  const r = parseInt(n.slice(1, 3), 16) / 255
  const g = parseInt(n.slice(3, 5), 16) / 255
  const b = parseInt(n.slice(5, 7), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55 ? '#0f172a' : '#f8fafc'
}

/**
 * Borde del botón “outline” cuando el color del equipo es muy claro (p. ej. blanco sobre fondo claro del diálogo).
 */
export function teamPickAccentBorderForOutline(teamHex: string): string {
  const n = normalizeTeamPickHexColor(teamHex)?.toLowerCase()
  if (n === '#ffffff') return '#64748b'
  return teamHex
}

/** Nombre legible del color de camiseta (presets de la app o hex en mayúsculas). */
export function teamPickJerseyPresetLabel(hex: string): string {
  const n = normalizeTeamPickHexColor(hex)?.toLowerCase()
  if (!n) return '—'
  const preset = TEAM_PICK_JERSEY_PRESETS.find((p) => p.hex.toLowerCase() === n)
  return preset?.label ?? n.toUpperCase()
}

export function teamPickColorsForUi(opp: {
  type: MatchType
  teamPickColorA?: string | null
  teamPickColorB?: string | null
}): { colorA: string; colorB: string } {
  const a = normalizeTeamPickHexColor(opp.teamPickColorA ?? undefined)
  const b = normalizeTeamPickHexColor(opp.teamPickColorB ?? undefined)
  if (opp.type !== 'team_pick_public' && opp.type !== 'team_pick_private') {
    return { colorA: DEFAULT_TEAM_PICK_COLOR_A, colorB: DEFAULT_TEAM_PICK_COLOR_B }
  }
  return {
    colorA: a ?? DEFAULT_TEAM_PICK_COLOR_A,
    colorB: b ?? DEFAULT_TEAM_PICK_COLOR_B,
  }
}

/** Cupos fijos por bando (6vs6). */
export const TEAM_PICK_MAX_GK_PER_SIDE = 1
export const TEAM_PICK_MAX_FIELD_PER_SIDE = 5

export type TeamPickSideSlots = { gk: number; field: number }

export type TeamPickSlotsBySide = Record<PickTeamSide, TeamPickSideSlots>

/**
 * Cuenta arqueros y jugadores de campo por equipo a partir de participantes activos
 * (creator / confirmed / pending con pick_team).
 */
export function teamPickSlotsFromParticipants(
  rows: ReadonlyArray<{
    status: string
    pickTeam?: PickTeamSide | null
    encounterLineupRole?: EncounterLineupRole | null
    isGoalkeeper?: boolean
  }>
): TeamPickSlotsBySide {
  const empty = (): TeamPickSideSlots => ({ gk: 0, field: 0 })
  const out: TeamPickSlotsBySide = { A: empty(), B: empty() }
  const fieldRoles: EncounterLineupRole[] = ['defensa', 'mediocampista', 'delantero']
  for (const p of rows) {
    if (p.status === 'cancelled' || p.status === 'invited') continue
    const side = p.pickTeam
    if (side !== 'A' && side !== 'B') continue
    const isGk =
      p.encounterLineupRole === 'gk' || p.isGoalkeeper === true
    if (isGk) {
      out[side].gk += 1
    } else if (
      p.encounterLineupRole &&
      fieldRoles.includes(p.encounterLineupRole)
    ) {
      out[side].field += 1
    }
  }
  return out
}

/** Equipo completo: 1 arquero y 5 de campo. */
export function teamPickSideIsFull(slots: TeamPickSideSlots): boolean {
  return (
    slots.gk >= TEAM_PICK_MAX_GK_PER_SIDE &&
    slots.field >= TEAM_PICK_MAX_FIELD_PER_SIDE
  )
}

/**
 * Igual que `teamPickSlotsFromParticipants` pero excluye a un jugador (p. ej. al
 * editar su alineación, para ver cupos “libres” sin contar su asignación actual).
 */
export function teamPickSlotsFromParticipantsExcluding(
  rows: ReadonlyArray<{
    id: string
    status: string
    pickTeam?: PickTeamSide | null
    encounterLineupRole?: EncounterLineupRole | null
    isGoalkeeper?: boolean
  }>,
  excludeUserId: string | null | undefined
): TeamPickSlotsBySide {
  if (!excludeUserId) return teamPickSlotsFromParticipants(rows)
  return teamPickSlotsFromParticipants(
    rows.filter((p) => p.id !== excludeUserId)
  )
}

const ROLE_LABELS: Record<EncounterLineupRole, string> = {
  gk: 'Arquero',
  defensa: 'Defensa',
  mediocampista: 'Mediocampista',
  delantero: 'Delantero',
}

export function encounterLineupRoleLabel(role?: EncounterLineupRole | null): string {
  if (!role) return '—'
  return ROLE_LABELS[role] ?? role
}

export function teamPickLineupSummary(
  pickTeam?: 'A' | 'B' | null,
  role?: EncounterLineupRole | null
): string {
  if (!pickTeam && !role) return ''
  const t = pickTeam ? `Equipo ${pickTeam}` : ''
  const r = role ? encounterLineupRoleLabel(role) : ''
  if (t && r) return `${t} · ${r}`
  return t || r
}

/** Partido mínimo para diálogos (p. ej. union por código antes de cargar el bundle). */
/** Misma ventana que RPC `set_team_pick_participant_lineup` (2 h antes del partido). */
export function canEditTeamPickLineupBeforeDeadline(dateTime: Date): boolean {
  const deadline = new Date(dateTime.getTime() - 2 * 60 * 60 * 1000)
  return Date.now() <= deadline.getTime()
}

export function minimalMatchOpportunityForTeamPickPreview(input: {
  id: string
  title: string
  venue: string
  location: string
  dateTime: Date
  level: Level
  gender: Gender
  type: 'team_pick_public' | 'team_pick_private'
  playersNeeded?: number
  playersJoined?: number
  teamPickColorA?: string
  teamPickColorB?: string
}): MatchOpportunity {
  const now = new Date()
  return {
    id: input.id,
    type: input.type,
    title: input.title,
    cityId: '',
    location: input.location,
    venue: input.venue,
    dateTime: input.dateTime,
    level: input.level,
    creatorId: '',
    creatorName: '',
    creatorPhoto: '',
    gender: input.gender,
    status: 'pending',
    createdAt: now,
    playersNeeded: input.playersNeeded ?? 12,
    playersJoined: input.playersJoined ?? 0,
    teamPickColorA: input.teamPickColorA,
    teamPickColorB: input.teamPickColorB,
  }
}
