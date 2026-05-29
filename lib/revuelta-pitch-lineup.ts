import type { OpportunityParticipantRow } from '@/lib/supabase/message-queries'
import { rivalFieldSlotCells, type RivalLineupSlotCell } from '@/lib/match-lineup-slots'
import type { RivalLineupSlotId } from '@/lib/rival-lineup-slot'
import { rivalSlotShortLabel } from '@/lib/rival-lineup-slot'
import type { RevueltaLineup } from '@/lib/revuelta-lineup'

const REVUELTA_FIELD_SLOTS: RivalLineupSlotId[] = [
  'gk',
  'def_0',
  'def_1',
  'med_0',
  'med_1',
  'del',
]

export type RevueltaPitchOccupant = {
  userId: string
  name: string
  photo: string
  isMe: boolean
  slotId: RivalLineupSlotId
  shortLabel: string
}

export type RevueltaPitchSideLayout = {
  colorHex: string
  fieldSlots: RivalLineupSlotCell[]
  occupantsBySlot: Map<string, RevueltaPitchOccupant>
}

export type RevueltaPitchLayout = {
  sideA: RevueltaPitchSideLayout
  sideB: RevueltaPitchSideLayout
}

function profileFor(
  userId: string,
  participants: OpportunityParticipantRow[]
): { name: string; photo: string; isGoalkeeper: boolean } {
  const p = participants.find((x) => x.id === userId)
  return {
    name: p?.name ?? 'Jugador',
    photo: p?.photo ?? '/sportmatch-logo.png',
    isGoalkeeper: p?.isGoalkeeper === true,
  }
}

/** Ordena jugadores del bando: arquero primero, luego el resto (máx. 6 titulares en cancha). */
function orderedUserIdsForSide(
  userIds: string[],
  participants: OpportunityParticipantRow[]
): string[] {
  const gks: string[] = []
  const field: string[] = []
  for (const id of userIds) {
    if (profileFor(id, participants).isGoalkeeper) {
      gks.push(id)
    } else {
      field.push(id)
    }
  }
  const ordered: string[] = []
  if (gks[0]) ordered.push(gks[0])
  for (const id of field) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  for (let i = 1; i < gks.length; i++) {
    if (!ordered.includes(gks[i])) ordered.push(gks[i])
  }
  return ordered.slice(0, REVUELTA_FIELD_SLOTS.length)
}

function buildSide(
  userIds: string[],
  colorHex: string,
  side: 'A' | 'B',
  participants: OpportunityParticipantRow[],
  currentUserId?: string
): RevueltaPitchSideLayout {
  const occupantsBySlot = new Map<string, RevueltaPitchOccupant>()
  const ordered = orderedUserIdsForSide(userIds, participants)
  REVUELTA_FIELD_SLOTS.forEach((slotId, index) => {
    const userId = ordered[index]
    if (!userId) return
    const prof = profileFor(userId, participants)
    occupantsBySlot.set(slotId, {
      userId,
      name: prof.name,
      photo: prof.photo,
      isMe: currentUserId === userId,
      slotId,
      shortLabel: rivalSlotShortLabel(slotId),
    })
  })
  return {
    colorHex,
    fieldSlots: rivalFieldSlotCells(side),
    occupantsBySlot,
  }
}

export function buildRevueltaPitchLayout(
  lineup: RevueltaLineup,
  participants: OpportunityParticipantRow[],
  currentUserId?: string
): RevueltaPitchLayout {
  return {
    sideA: buildSide(
      lineup.teamA.userIds,
      lineup.teamA.colorHex,
      'A',
      participants,
      currentUserId
    ),
    sideB: buildSide(
      lineup.teamB.userIds,
      lineup.teamB.colorHex,
      'B',
      participants,
      currentUserId
    ),
  }
}
