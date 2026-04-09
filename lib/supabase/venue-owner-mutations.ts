import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { VenueWeeklyHour } from '@/lib/types'

function toPgTime(hhmm: string): string {
  const x = hhmm.trim()
  if (/^\d{1,2}:\d{2}$/.test(x)) {
    const [h, m] = x.split(':')
    return `${h.padStart(2, '0')}:${m}:00`
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(x)) return x
  return `${x}:00`
}

export type DayHoursConfig = Record<number, { open: string; close: string } | null>

export async function updateSportsVenueNameAndPhone(
  supabase: SupabaseClient,
  venueId: string,
  name: string,
  phone: string
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from('sports_venues')
    .update({ name, phone })
    .eq('id', venueId)
  return { error }
}

export async function insertVenueCourtRow(
  supabase: SupabaseClient,
  venueId: string,
  name: string,
  sortOrder: number
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('venue_courts').insert({
    venue_id: venueId,
    name,
    sort_order: sortOrder,
  })
  return { error }
}

export async function updateVenueCourtPrice(
  supabase: SupabaseClient,
  courtId: string,
  venueId: string,
  pricePerHour: number | null
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from('venue_courts')
    .update({ price_per_hour: pricePerHour })
    .eq('id', courtId)
    .eq('venue_id', venueId)
  return { error }
}

export async function deleteVenueCourtById(
  supabase: SupabaseClient,
  courtId: string
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('venue_courts').delete().eq('id', courtId)
  return { error }
}

/**
 * Persiste el horario semanal según el estado de UI del panel dueño.
 * Devuelve el primer mensaje de error de Postgrest o null si todo OK.
 */
export async function syncVenueWeeklyHoursFromOwnerUi(
  supabase: SupabaseClient,
  venueId: string,
  hoursByDay: DayHoursConfig,
  weeklyLoaded: VenueWeeklyHour[]
): Promise<{ error: PostgrestError | null }> {
  for (let d = 0; d <= 6; d++) {
    const cfg = hoursByDay[d]
    const existing = weeklyLoaded.find((h) => h.dayOfWeek === d)
    if (!cfg) {
      if (existing) {
        const { error } = await supabase
          .from('venue_weekly_hours')
          .delete()
          .eq('id', existing.id)
        if (error) return { error }
      }
    } else {
      const ot = toPgTime(cfg.open)
      const ct = toPgTime(cfg.close)
      if (existing) {
        const { error } = await supabase
          .from('venue_weekly_hours')
          .update({
            open_time: ot,
            close_time: ct,
          })
          .eq('id', existing.id)
        if (error) return { error }
      } else {
        const { error } = await supabase.from('venue_weekly_hours').insert({
          venue_id: venueId,
          day_of_week: d,
          open_time: ot,
          close_time: ct,
        })
        if (error) return { error }
      }
    }
  }
  return { error: null }
}
