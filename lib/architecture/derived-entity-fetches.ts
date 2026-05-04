/**
 * Punto único de referencia para refrescar entidades derivadas (vista + joins).
 * Nuevas features deben importar desde aquí para no introducir selects paralelos inconsistentes.
 */
export { fetchMatchOpportunitiesByIds } from '@/lib/supabase/queries'
export { fetchRivalChallengesByIds } from '@/lib/supabase/rival-challenge-queries'
export { fetchParticipantsForOpportunity } from '@/lib/supabase/message-queries'
