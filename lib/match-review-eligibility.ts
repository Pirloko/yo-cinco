import type { OpportunityParticipantRow } from '@/lib/supabase/message-queries'

/** Participantes que pueden enviar reseña o ser elegidos como MVP. */
export function matchReviewEligibleParticipants(
  participants: OpportunityParticipantRow[]
): OpportunityParticipantRow[] {
  return participants.filter(
    (p) => p.status === 'creator' || p.status === 'confirmed'
  )
}

export function userCanSubmitMatchReview(
  userId: string,
  participants: OpportunityParticipantRow[]
): boolean {
  return matchReviewEligibleParticipants(participants).some((p) => p.id === userId)
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
