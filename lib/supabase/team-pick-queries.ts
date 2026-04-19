import type { SupabaseClient } from '@supabase/supabase-js'
import type { Gender, Level } from '@/lib/types'

export type TeamPickPrivateResolveSuccess = {
  ok: true
  matchId: string
  title: string
  venue: string
  location: string
  dateTime: string
  level: Level
  gender: Gender
  playersNeeded: number
  playersJoined: number
}

export type TeamPickPrivateResolveResult =
  | TeamPickPrivateResolveSuccess
  | { ok: false; error: string }

export async function resolveTeamPickPrivateJoinCode(
  supabase: SupabaseClient,
  joinCode: string
): Promise<TeamPickPrivateResolveResult> {
  const code = joinCode.replace(/\D/g, '').slice(0, 4)
  const { data, error } = await supabase.rpc('resolve_team_pick_private_join_code', {
    p_join_code: code,
  })
  if (error) {
    return { ok: false, error: error.message }
  }
  const p = data as
    | {
        ok?: boolean
        error?: string
        matchId?: string
        title?: string
        venue?: string
        location?: string
        dateTime?: string
        level?: string
        gender?: string
        playersNeeded?: number
        playersJoined?: number
      }
    | null
    | undefined
  if (!p?.ok) {
    const err = p?.error ?? 'not_found'
    if (err === 'not_found') {
      return { ok: false, error: 'No hay un partido activo con ese código.' }
    }
    if (err === 'past') {
      return { ok: false, error: 'Este partido ya no admite nuevas uniones.' }
    }
    if (err === 'invalid_code_format') {
      return { ok: false, error: 'El código debe tener 4 dígitos.' }
    }
    return { ok: false, error: 'No se pudo buscar el partido.' }
  }
  const matchId = p.matchId
  if (typeof matchId !== 'string' || !matchId) {
    return { ok: false, error: 'Respuesta inválida del servidor.' }
  }
  return {
    ok: true,
    matchId,
    title: typeof p.title === 'string' ? p.title : '6vs6',
    venue: typeof p.venue === 'string' ? p.venue : '',
    location: typeof p.location === 'string' ? p.location : '',
    dateTime: typeof p.dateTime === 'string' ? p.dateTime : new Date().toISOString(),
    level: (p.level as Level) ?? 'intermedio',
    gender: (p.gender as Gender) ?? 'male',
    playersNeeded: typeof p.playersNeeded === 'number' ? p.playersNeeded : 12,
    playersJoined: typeof p.playersJoined === 'number' ? p.playersJoined : 0,
  }
}
