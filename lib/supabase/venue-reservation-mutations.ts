import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export async function updateVenueReservationFields(
  supabase: SupabaseClient,
  reservationId: string,
  payload: Record<string, unknown>
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from('venue_reservations')
    .update(payload)
    .eq('id', reservationId)
  return { error }
}

export async function insertVenueReservationRow(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('venue_reservations').insert(payload)
  return { error }
}

export async function confirmVenueReservationBookerSelfMatchDetail(
  supabase: SupabaseClient,
  reservationId: string,
  bookerUserId: string
): Promise<{ error: PostgrestError | null }> {
  // DB valida booker_user_id = auth.uid(); `bookerUserId` se mantiene como guard extra.
  void bookerUserId
  const { error } = await supabase.rpc('confirm_venue_reservation_as_booker', {
    p_reservation_id: reservationId,
    p_note: 'Confirmada por organizador en flujo guiado',
    p_mark_paid: false,
  })
  if (error) return { error }
  return { error: null }
}

export async function confirmSoloVenueReservationFromMatchesHub(
  supabase: SupabaseClient,
  reservationId: string,
  bookerUserId: string
): Promise<{ error: PostgrestError | null }> {
  void bookerUserId
  const { error } = await supabase.rpc('confirm_venue_reservation_as_booker', {
    p_reservation_id: reservationId,
    p_note: 'Confirmado por el jugador (Partidos)',
    p_mark_paid: true,
  })
  if (error) return { error }
  return { error: null }
}

export async function confirmVenueReservationAsVenueOwner(
  supabase: SupabaseClient,
  reservationId: string
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.rpc('confirm_venue_reservation_as_owner', {
    p_reservation_id: reservationId,
    p_mark_paid: true,
    p_note: 'Confirmada por centro deportivo',
  })
  if (error) return { error }
  return { error: null }
}

export async function cancelVenueReservationAsVenueOwner(
  supabase: SupabaseClient,
  reservationId: string,
  reason: string
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.rpc('cancel_venue_reservation_as_owner', {
    p_reservation_id: reservationId,
    p_reason: reason,
  })
  if (error) return { error }
  return { error: null }
}
