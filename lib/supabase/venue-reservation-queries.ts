import type { SupabaseClient } from '@supabase/supabase-js'

export type MatchDetailReservationState = {
  id: string
  status: 'pending' | 'confirmed' | 'cancelled'
  paymentStatus: 'unpaid' | 'deposit_paid' | 'paid' | null
  confirmationSource: 'venue_owner' | 'booker_self' | 'admin' | null
  confirmedAt: Date | null
  bookerUserId: string | null
}

export async function fetchVenueReservationForMatchDetail(
  supabase: SupabaseClient,
  reservationId: string
): Promise<MatchDetailReservationState | null> {
  const { data, error } = await supabase
    .from('venue_reservations')
    .select(
      'id, status, payment_status, confirmation_source, confirmed_at, booker_user_id'
    )
    .eq('id', reservationId)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id as string,
    status: data.status as 'pending' | 'confirmed' | 'cancelled',
    paymentStatus:
      (data.payment_status as 'unpaid' | 'deposit_paid' | 'paid' | null) ?? null,
    confirmationSource:
      (data.confirmation_source as
        | 'venue_owner'
        | 'booker_self'
        | 'admin'
        | null) ?? null,
    confirmedAt: data.confirmed_at
      ? new Date(data.confirmed_at as string)
      : null,
    bookerUserId: (data.booker_user_id as string | null) ?? null,
  }
}
