import type { OpportunityParticipantRow } from '@/lib/supabase/message-queries'
import type { EncounterLineupRole, Position } from '@/lib/types'

/** Plazo tras `finalized_at` para reseñas, votos MVP y chat activo. */
export const MATCH_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000
export const MATCH_POST_FINALIZE_WINDOW_MS = MATCH_REVIEW_WINDOW_MS

const POSITION_LABELS: Record<Position, string> = {
  portero: 'Arquero',
  defensa: 'Defensa',
  mediocampista: 'Mediocampista',
  delantero: 'Delantero',
}

const ENCOUNTER_ROLE_LABELS: Record<EncounterLineupRole, string> = {
  gk: 'Arquero',
  defensa: 'Defensa',
  mediocampista: 'Mediocampista',
  delantero: 'Delantero',
}

/** Participantes que pueden enviar reseña o ser elegidos como MVP. */
export function matchReviewEligibleParticipants(
  participants: OpportunityParticipantRow[]
): OpportunityParticipantRow[] {
  return participants.filter(
    (p) => p.status === 'creator' || p.status === 'confirmed'
  )
}

export function getMatchReviewDeadline(finalizedAt: Date): Date {
  return new Date(finalizedAt.getTime() + MATCH_REVIEW_WINDOW_MS)
}

export function isMatchReviewWindowOpen(
  finalizedAt: Date | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!finalizedAt) return false
  return nowMs <= getMatchReviewDeadline(finalizedAt).getTime()
}

export function userCanSubmitMatchReview(
  userId: string,
  participants: OpportunityParticipantRow[],
  finalizedAt?: Date | null
): boolean {
  if (finalizedAt != null && !isMatchReviewWindowOpen(finalizedAt)) {
    return false
  }
  return matchReviewEligibleParticipants(participants).some((p) => p.id === userId)
}

/** Rol visible en el selector MVP (arquero vs campo). */
export function participantMvpRoleLabel(
  p: OpportunityParticipantRow
): string | null {
  if (
    p.isGoalkeeper ||
    p.encounterLineupRole === 'gk' ||
    p.lineupSlot === 'gk'
  ) {
    return 'Arquero'
  }
  if (p.encounterLineupRole) {
    return ENCOUNTER_ROLE_LABELS[p.encounterLineupRole]
  }
  if (p.position) {
    return POSITION_LABELS[p.position]
  }
  return null
}

export function isParticipantGoalkeeperForMvp(
  p: OpportunityParticipantRow
): boolean {
  return participantMvpRoleLabel(p) === 'Arquero'
}

/** Etiqueta del selector: «Nombre · Posición». */
export function formatMvpParticipantOption(
  p: OpportunityParticipantRow
): string {
  const role = participantMvpRoleLabel(p)
  return role ? `${p.name} · ${role}` : p.name
}

export function sortMvpVoteCandidates(
  candidates: OpportunityParticipantRow[]
): OpportunityParticipantRow[] {
  return [...candidates].sort((a, b) => {
    const gkDiff =
      Number(isParticipantGoalkeeperForMvp(b)) -
      Number(isParticipantGoalkeeperForMvp(a))
    if (gkDiff !== 0) return gkDiff
    return a.name.localeCompare(b.name, 'es')
  })
}

/** Candidatos MVP en el selector (excluye al reseñador; no auto-voto). */
export function filterMvpVoteCandidates(
  participants: OpportunityParticipantRow[],
  raterUserId: string
): OpportunityParticipantRow[] {
  return matchReviewEligibleParticipants(participants).filter(
    (p) => p.id !== raterUserId
  )
}

export type MvpVoteTally = { userId: string; votes: number }

export function tallyMvpVotes(
  mvpUserIds: Array<string | null | undefined>
): MvpVoteTally[] {
  const counts = new Map<string, number>()
  for (const id of mvpUserIds) {
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([userId, votes]) => ({ userId, votes }))
    .sort((a, b) => b.votes - a.votes)
}

/** Ganadores MVP: todos los que empatan en el máximo de votos (sin desempate). */
export function resolveMvpWinnersFromTally(
  tally: MvpVoteTally[]
): MvpVoteTally[] {
  if (tally.length === 0) return []
  const maxVotes = tally[0]!.votes
  return tally.filter((row) => row.votes === maxVotes)
}
