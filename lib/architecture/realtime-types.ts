/**
 * Tipos compartidos — señales WAL Realtime (tablas base).
 * La UI no debe interpretar payload como fuente de verdad; solo como “algo cambió”.
 */

export type MatchRealtimeRowEvent = {
  table:
    | 'match_opportunities'
    | 'match_opportunity_participants'
    | 'rival_challenges'
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  old: Record<string, unknown> | null
  new: Record<string, unknown> | null
}
