import type { SupabaseClient } from '@supabase/supabase-js'
import type { SportsVenue } from '@/lib/types'
import { fetchVenueForOwner } from '@/lib/supabase/venue-queries'

export async function loadVenueForOwner(
  supabase: SupabaseClient,
  ownerId: string
): Promise<SportsVenue | null> {
  return fetchVenueForOwner(supabase, ownerId)
}
