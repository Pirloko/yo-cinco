import type { SupabaseClient } from '@supabase/supabase-js'
import type { SportsVenue } from '@/lib/types'
import { fetchExploreVenueAvailabilityInputsBatch } from '@/lib/supabase/venue-queries'
import { computeVenueAvailableSlots } from '@/lib/venue-slots'

/**
 * Fase 4 (cierre): centros alternativos que tienen el mismo hueco horario (`targetTimeValue`)
 * en la fecha dada. Antes: 3×N peticiones; ahora: 3 peticiones batch + cálculo local.
 */
export async function fetchAlternativeVenuesWithSlotAtTime(
  supabase: SupabaseClient,
  params: {
    allVenues: SportsVenue[]
    linkedVenueId: string
    dateYmd: string
    targetTimeValue: string
    locationForSort: string
    maxResults?: number
  }
): Promise<SportsVenue[]> {
  const {
    allVenues,
    linkedVenueId,
    dateYmd,
    targetTimeValue,
    locationForSort,
    maxResults = 5,
  } = params

  const candidates = allVenues.filter((v) => v.id !== linkedVenueId)
  if (candidates.length === 0) return []

  const dayStart = new Date(`${dateYmd}T00:00:00`)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const dow = dayStart.getDay()

  const { courtsByVenue, hoursByVenue, reservationsByVenue } =
    await fetchExploreVenueAvailabilityInputsBatch(
      supabase,
      candidates.map((v) => v.id),
      dayStart.toISOString(),
      dayEnd.toISOString()
    )

  const valid: SportsVenue[] = []
  for (const venue of candidates) {
    const courts = courtsByVenue.get(venue.id) ?? []
    if (!courts.length) continue
    const weeklyHours = hoursByVenue.get(venue.id) ?? []
    const dayHours = weeklyHours.find((h) => h.dayOfWeek === dow)
    if (!dayHours) continue
    const reservations = (reservationsByVenue.get(venue.id) ?? []).filter(
      (r) => r.status !== 'cancelled'
    )
    const options = computeVenueAvailableSlots({
      dayStart,
      openTime: dayHours.openTime,
      closeTime: dayHours.closeTime,
      slotDurationMinutes: venue.slotDurationMinutes,
      courtsCount: courts.length,
      reservations,
    })
    if (options.some((o) => o.value === targetTimeValue)) {
      valid.push(venue)
    }
  }

  const sameCity = valid.filter((v) => v.city === locationForSort)
  const otherCities = valid.filter((v) => v.city !== locationForSort)
  return [...sameCity, ...otherCities].slice(0, maxResults)
}
