/**
 * Evita mostrar filas derivadas incompletas tras fetch parcial.
 */
import type { MatchOpportunity } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchMatchOpportunitiesByIds } from '@/lib/architecture/derived-entity-fetches'

function rtDevLog(tag: string, msg: string, data?: unknown) {
  if (process.env.NODE_ENV !== 'development') return
  console.debug(`[${tag}]`, msg, data ?? '')
}

/** Heurística mínima: sin creador o sin fecha, la tarjeta no es confiable. */
export function matchOpportunityRowLooksIncomplete(m: MatchOpportunity): boolean {
  return (
    !m.creatorName?.trim() ||
    !(m.dateTime instanceof Date) ||
    Number.isNaN(m.dateTime.getTime())
  )
}

/**
 * Devuelve ids que siguen mal tras un primer fetch; vacío = OK.
 */
export function findIncompleteMatchOpportunityIds(rows: MatchOpportunity[]): string[] {
  const bad: string[] = []
  for (const m of rows) {
    if (matchOpportunityRowLooksIncomplete(m)) bad.push(m.id)
  }
  return bad
}

/**
 * Reintento único: refetch solo ids defectuosos (RLS intermitente / race).
 */
export async function repairMatchOpportunitiesIfNeeded(
  supabase: SupabaseClient,
  candidates: MatchOpportunity[]
): Promise<MatchOpportunity[]> {
  const badIds = findIncompleteMatchOpportunityIds(candidates)
  if (badIds.length === 0) return candidates

  rtDevLog(
    'CONSISTENCY_GUARD',
    'refetch incompletos',
    badIds
  )

  const repaired = await fetchMatchOpportunitiesByIds(supabase, badIds)
  const byId = new Map(repaired.map((r) => [r.id, r] as const))
  return candidates.map((m) => {
    const r = byId.get(m.id)
    return r && !matchOpportunityRowLooksIncomplete(r) ? r : m
  })
}
