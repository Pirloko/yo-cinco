'use client'

import { useAppAuth, useAppMatch } from '@/lib/contexts/domain-contexts'

/**
 * Lectura del bundle de partidos desde Context (fuente principal).
 * Evita usar `queryKeys.playerSession.matchBundle` como fuente de verdad en UI.
 */
export function usePlayerMatchBundleSafe(expectedUserId: string) {
  const { currentUser } = useAppAuth()
  const match = useAppMatch()

  if (
    process.env.NODE_ENV === 'development' &&
    currentUser?.id &&
    currentUser.id !== expectedUserId
  ) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[usePlayerMatchBundleSafe] userId no coincide con la sesión; el Context refleja al usuario autenticado actual.'
      )
    }
  }

  return {
    matchOpportunities: match.matchOpportunities,
    rivalChallenges: match.rivalChallenges,
    participatingOpportunityIds: match.participatingOpportunityIds,
  }
}
