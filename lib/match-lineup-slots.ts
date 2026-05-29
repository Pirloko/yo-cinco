import type { OpportunityParticipantRow } from '@/lib/supabase/message-queries'
import {
  perSideMaxFromPlayersNeeded,
  RIVAL_BENCH_SLOT_IDS,
  RIVAL_FIELD_SLOT_IDS,
  type RivalLineupSlotId,
} from '@/lib/rival-lineup-slot'
import type { EncounterLineupRole, PickTeamSide } from '@/lib/types'

/** Contexto para inferir bando A/B cuando `pick_team` falta (organizador, legacy). */
export type RivalLineupRosterContext = {
  challengerCaptainId?: string
  acceptedCaptainId?: string | null
  resolvePickTeam?: (userId: string) => PickTeamSide | null
}

const FIELD_SLOT_FILL_ORDER: RivalLineupSlotId[] = [
  'gk',
  'def_0',
  'def_1',
  'med_0',
  'med_1',
  'del',
]

export type RivalLineupSlotCell = {
  slotId: RivalLineupSlotId
  /** Porcentaje 0–100 dentro del semicampo del bando. */
  x: number
  y: number
  shortLabel: string
}

export type RivalLineupOccupant = {
  userId: string
  name: string
  photo: string
  slotId: RivalLineupSlotId | null
  isMe: boolean
}

export type RivalSideLineup = {
  pickTeam: PickTeamSide
  benchSlots: RivalLineupSlotCell[]
  fieldSlots: RivalLineupSlotCell[]
  occupantsBySlot: Map<string, RivalLineupOccupant>
  unslotted: RivalLineupOccupant[]
}

export type RivalMatchLineupLayout = {
  mode: 'standard6' | 'rival6Bench'
  perSideMax: number
  sideA: RivalSideLineup
  sideB: RivalSideLineup
}

/**
 * Cancha vertical: portería arriba = equipo A, portería abajo = equipo B.
 * Cada bando: ARQ en su arco, líneas hacia la mitad rival (DEL junto a la línea central).
 */
const FIELD_POSITIONS_A: Array<{ slotId: RivalLineupSlotId; x: number; y: number }> = [
  { slotId: 'gk', x: 50, y: 8 },
  { slotId: 'def_0', x: 16, y: 20 },
  { slotId: 'def_1', x: 84, y: 20 },
  { slotId: 'med_0', x: 16, y: 32 },
  { slotId: 'med_1', x: 84, y: 32 },
  { slotId: 'del', x: 50, y: 44 },
]

const FIELD_POSITIONS_B: Array<{ slotId: RivalLineupSlotId; x: number; y: number }> = [
  { slotId: 'del', x: 50, y: 56 },
  { slotId: 'med_0', x: 16, y: 68 },
  { slotId: 'med_1', x: 84, y: 68 },
  { slotId: 'def_0', x: 16, y: 80 },
  { slotId: 'def_1', x: 84, y: 80 },
  { slotId: 'gk', x: 50, y: 92 },
]

function benchCells(): RivalLineupSlotCell[] {
  return RIVAL_BENCH_SLOT_IDS.map((slotId, i) => ({
    slotId,
    x: 16 + i * 34,
    y: 50,
    shortLabel: 'SUP',
  }))
}

/** Posiciones 1-2-2-1 en cancha vertical (reutilizable en revuelta sorteada). */
export function rivalFieldSlotCells(side: PickTeamSide): RivalLineupSlotCell[] {
  return fieldCells(side)
}

function fieldCells(side: PickTeamSide): RivalLineupSlotCell[] {
  const positions = side === 'A' ? FIELD_POSITIONS_A : FIELD_POSITIONS_B
  return positions.map(({ slotId, x, y }) => ({
    slotId,
    x,
    y,
    shortLabel:
      slotId === 'gk'
        ? 'ARQ'
        : slotId.startsWith('def')
          ? 'DEF'
          : slotId.startsWith('med')
            ? 'MED'
            : 'DEL',
  }))
}

function activeParticipants(
  rows: OpportunityParticipantRow[]
): OpportunityParticipantRow[] {
  return rows.filter(
    (p) =>
      p.status === 'creator' ||
      p.status === 'confirmed' ||
      p.status === 'pending'
  )
}

function parseLineupSlotId(raw: string | null | undefined): RivalLineupSlotId | null {
  if (!raw) return null
  if (RIVAL_FIELD_SLOT_IDS.includes(raw as RivalLineupSlotId)) {
    return raw as RivalLineupSlotId
  }
  if (RIVAL_BENCH_SLOT_IDS.includes(raw as RivalLineupSlotId)) {
    return raw as RivalLineupSlotId
  }
  return null
}

export function effectiveRivalPickTeam(
  p: OpportunityParticipantRow,
  ctx?: RivalLineupRosterContext
): PickTeamSide | null {
  if (p.pickTeam === 'A' || p.pickTeam === 'B') return p.pickTeam
  if (!ctx) return null
  if (ctx.challengerCaptainId && p.id === ctx.challengerCaptainId) return 'A'
  if (ctx.acceptedCaptainId && p.id === ctx.acceptedCaptainId) return 'B'
  return ctx.resolvePickTeam?.(p.id) ?? null
}

function preferredSlotsForParticipant(
  p: OpportunityParticipantRow
): RivalLineupSlotId[] {
  const rest = FIELD_SLOT_FILL_ORDER
  if (p.encounterLineupRole === 'gk' || p.isGoalkeeper) {
    return ['gk', ...rest.filter((s) => s !== 'gk')]
  }
  if (p.encounterLineupRole === 'defensa') {
    return ['def_0', 'def_1', ...rest.filter((s) => !s.startsWith('def'))]
  }
  if (p.encounterLineupRole === 'mediocampista') {
    return ['med_0', 'med_1', ...rest.filter((s) => !s.startsWith('med'))]
  }
  if (p.encounterLineupRole === 'delantero') {
    return ['del', ...rest.filter((s) => s !== 'del')]
  }
  return [...FIELD_SLOT_FILL_ORDER]
}

function placeLegacyParticipantsOnPitch(
  pending: Array<{
    occupant: RivalLineupOccupant
    participant: OpportunityParticipantRow
  }>,
  occupantsBySlot: Map<string, RivalLineupOccupant>,
  includeBench: boolean
) {
  const slotOrder: RivalLineupSlotId[] = includeBench
    ? [...FIELD_SLOT_FILL_ORDER, ...RIVAL_BENCH_SLOT_IDS]
    : [...FIELD_SLOT_FILL_ORDER]

  for (const { occupant, participant } of pending) {
    const candidates = preferredSlotsForParticipant(participant)
    let placed = false
    for (const slotId of candidates) {
      if (!slotOrder.includes(slotId)) continue
      if (!occupantsBySlot.has(slotId)) {
        occupantsBySlot.set(slotId, { ...occupant, slotId })
        placed = true
        break
      }
    }
    if (placed) continue
    for (const slotId of slotOrder) {
      if (!occupantsBySlot.has(slotId)) {
        occupantsBySlot.set(slotId, { ...occupant, slotId })
        break
      }
    }
  }
}

function buildSide(
  pickTeam: PickTeamSide,
  rows: OpportunityParticipantRow[],
  currentUserId: string | undefined,
  includeBench: boolean,
  rosterContext?: RivalLineupRosterContext
): RivalSideLineup {
  const sideRows = activeParticipants(rows).filter(
    (p) => effectiveRivalPickTeam(p, rosterContext) === pickTeam
  )
  const occupantsBySlot = new Map<string, RivalLineupOccupant>()
  const pendingPlacement: Array<{
    occupant: RivalLineupOccupant
    participant: OpportunityParticipantRow
  }> = []

  for (const p of sideRows) {
    const slotId = parseLineupSlotId(p.lineupSlot)
    const occupant: RivalLineupOccupant = {
      userId: p.id,
      name: p.name,
      photo: p.photo,
      slotId,
      isMe: currentUserId === p.id,
    }
    if (slotId) {
      const existing = occupantsBySlot.get(slotId)
      if (!existing) {
        occupantsBySlot.set(slotId, occupant)
      } else {
        pendingPlacement.push({ occupant, participant: p })
      }
    } else {
      pendingPlacement.push({ occupant, participant: p })
    }
  }

  placeLegacyParticipantsOnPitch(pendingPlacement, occupantsBySlot, includeBench)

  return {
    pickTeam,
    benchSlots: includeBench ? benchCells() : [],
    fieldSlots: fieldCells(pickTeam),
    occupantsBySlot,
    unslotted: [],
  }
}

export function buildRivalMatchLineupLayout(args: {
  playersNeeded: number | null | undefined
  participants: OpportunityParticipantRow[]
  currentUserId?: string
  rosterContext?: RivalLineupRosterContext
}): RivalMatchLineupLayout {
  const perSideMax = perSideMaxFromPlayersNeeded(args.playersNeeded)
  const includeBench = perSideMax > 6
  const mode = includeBench ? 'rival6Bench' : 'standard6'
  const active = activeParticipants(args.participants)

  return {
    mode,
    perSideMax,
    sideA: buildSide(
      'A',
      active,
      args.currentUserId,
      includeBench,
      args.rosterContext
    ),
    sideB: buildSide(
      'B',
      active,
      args.currentUserId,
      includeBench,
      args.rosterContext
    ),
  }
}
