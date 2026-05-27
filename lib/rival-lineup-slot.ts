import type { EncounterLineupRole, PickTeamSide, RivalChallenge, Team } from '@/lib/types'
import { userIsConfirmedMemberOfTeam } from '@/lib/team-membership'

export const RIVAL_LINEUP_SLOT_IDS = [
  'gk',
  'def_0',
  'def_1',
  'med_0',
  'med_1',
  'del',
  'bench_0',
  'bench_1',
  'bench_2',
] as const

export type RivalLineupSlotId = (typeof RIVAL_LINEUP_SLOT_IDS)[number]

export const RIVAL_FIELD_SLOT_IDS: RivalLineupSlotId[] = [
  'gk',
  'def_0',
  'def_1',
  'med_0',
  'med_1',
  'del',
]

export const RIVAL_BENCH_SLOT_IDS: RivalLineupSlotId[] = [
  'bench_0',
  'bench_1',
  'bench_2',
]

export function rivalSlotEncounterRole(slotId: RivalLineupSlotId): EncounterLineupRole {
  if (slotId === 'gk') return 'gk'
  if (slotId.startsWith('def')) return 'defensa'
  if (slotId === 'del') return 'delantero'
  return 'mediocampista'
}

export function rivalSlotShortLabel(slotId: RivalLineupSlotId): string {
  switch (slotId) {
    case 'gk':
      return 'ARQ'
    case 'def_0':
    case 'def_1':
      return 'DEF'
    case 'med_0':
    case 'med_1':
      return 'MED'
    case 'del':
      return 'DEL'
    default:
      return 'SUP'
  }
}

export function resolveUserRivalPickTeam(
  challenge: RivalChallenge,
  teams: Team[],
  userId: string
): PickTeamSide | null {
  const challenger = teams.find((t) => t.id === challenge.challengerTeamId)
  const accepted = challenge.acceptedTeamId
    ? teams.find((t) => t.id === challenge.acceptedTeamId)
    : undefined
  const inCh = userIsConfirmedMemberOfTeam(challenger, userId)
  const inAcc = userIsConfirmedMemberOfTeam(accepted, userId)
  if (inCh && !inAcc) return 'A'
  if (inAcc && !inCh) return 'B'
  return null
}

export function perSideMaxFromPlayersNeeded(playersNeeded: number | null | undefined): number {
  const total = Math.max(2, playersNeeded ?? 18)
  return Math.max(1, Math.floor(total / 2))
}
