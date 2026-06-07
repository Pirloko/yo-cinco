import type { SupabaseClient } from '@supabase/supabase-js'

/** Partidos donde el jugador fue MVP ganador (más votos en reseñas del partido). */
export async function fetchPlayerMvpWinsCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('player_mvp_wins_count', {
    p_user_id: userId,
  })
  if (error || data == null) return 0
  const n = Number(data)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}
