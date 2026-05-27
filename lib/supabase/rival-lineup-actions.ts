import type { SupabaseClient } from '@supabase/supabase-js'
import type { EncounterLineupRole, PickTeamSide } from '@/lib/types'
import type { RivalLineupSlotId } from '@/lib/rival-lineup-slot'

type RpcResult = { ok?: boolean; error?: string; message?: string }

const ERROR_MESSAGES: Record<string, string> = {
  not_team_member: 'Solo puedes usar cupos de tu equipo.',
  slot_taken: 'Ese cupo ya está ocupado.',
  side_full: 'Tu equipo ya no tiene cupos libres.',
  team_needs_goalkeeper:
    'Tu equipo debe tener siempre un arquero. Ocupa el arco o deja a otro jugador como arquero antes de cambiar.',
  not_participant: 'No estás inscrito en este encuentro.',
  not_open: 'Este encuentro ya no admite cambios.',
  past: 'Este partido ya pasó.',
  invalid_lineup_slot: 'Cupo no válido.',
  not_rival: 'Este partido no es un duelo de equipos.',
  already_participant: 'Ya estás inscrito en este encuentro.',
}

function mapRpcError(payload: RpcResult | null, err: { message?: string } | null): string {
  if (payload?.error) {
    return ERROR_MESSAGES[payload.error] ?? payload.message ?? payload.error
  }
  if (err?.message?.includes('join_rival_match_opportunity')) {
    return 'Falta aplicar la migración de plantilla rival en Supabase.'
  }
  return err?.message ?? 'No se pudo completar la acción.'
}

export async function joinRivalMatchLineupSlot(
  supabase: SupabaseClient,
  opportunityId: string,
  pickTeam: PickTeamSide,
  lineupSlot: RivalLineupSlotId,
  encounterRole: EncounterLineupRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('join_rival_match_opportunity', {
    p_opportunity_id: opportunityId,
    p_pick_team: pickTeam,
    p_lineup_slot: lineupSlot,
    p_encounter_lineup_role: encounterRole,
  })
  const payload = data as RpcResult | null
  if (error || !payload?.ok) {
    return { ok: false, error: mapRpcError(payload, error) }
  }
  return { ok: true }
}

export async function moveRivalMatchLineupSlot(
  supabase: SupabaseClient,
  opportunityId: string,
  lineupSlot: RivalLineupSlotId,
  encounterRole: EncounterLineupRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('move_rival_match_lineup_slot', {
    p_opportunity_id: opportunityId,
    p_lineup_slot: lineupSlot,
    p_encounter_lineup_role: encounterRole,
  })
  const payload = data as RpcResult | null
  if (error || !payload?.ok) {
    return { ok: false, error: mapRpcError(payload, error) }
  }
  return { ok: true }
}

export async function leaveRivalMatchOpportunityRpc(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('leave_rival_match_opportunity', {
    p_opportunity_id: opportunityId,
  })
  const payload = data as RpcResult | null
  if (error || !payload?.ok) {
    return { ok: false, error: mapRpcError(payload, error) }
  }
  return { ok: true }
}
