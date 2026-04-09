import type { SupabaseClient } from '@supabase/supabase-js'
import type { SportsVenue } from '@/lib/types'
import { fetchExploreVenueAvailabilityInputsBatch } from '@/lib/supabase/venue-queries'
import { findNextVenueSlot } from '@/lib/venue-slots'

/** Misma forma que la grilla en `explore-screen` (Fase 4: batch de lecturas). */
export type ExploreAvailabilityRow = {
  venueId: string
  venueName: string
  city: string
  totalCourts: number
  nextSlotAt: Date | null
  freeCourtsAtNextSlot: number
}

/**
 * Próximo slot libre por centro: 3 queries Supabase en total (canchas + horarios +
 * reservas) en lugar de 3×N.
 */
export async function fetchExploreVenuesAvailabilityGrid(
  supabase: SupabaseClient,
  venues: Pick<SportsVenue, 'id' | 'name' | 'city' | 'slotDurationMinutes'>[],
  horizonDays: number,
  now: Date
): Promise<ExploreAvailabilityRow[]> {
  if (venues.length === 0) return []
  const to = new Date(now)
  to.setDate(to.getDate() + horizonDays)
  const fromIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const toIso = to.toISOString()

  const { courtsByVenue, hoursByVenue, reservationsByVenue } =
    await fetchExploreVenueAvailabilityInputsBatch(
      supabase,
      venues.map((v) => v.id),
      fromIso,
      toIso
    )

  const results: ExploreAvailabilityRow[] = []
  for (const venue of venues) {
    const courts = courtsByVenue.get(venue.id) ?? []
    const weeklyHours = hoursByVenue.get(venue.id) ?? []
    const reservations = reservationsByVenue.get(venue.id) ?? []
    const next = findNextVenueSlot({
      slotDurationMinutes: venue.slotDurationMinutes,
      courtsCount: courts.length,
      weeklyHours,
      reservations,
      horizonDays,
      now,
    })
    results.push({
      venueId: venue.id,
      venueName: venue.name,
      city: venue.city,
      totalCourts: courts.length,
      nextSlotAt: next.nextSlotAt,
      freeCourtsAtNextSlot: next.freeCourtsAtNextSlot,
    })
  }

  const withSlot = results.filter(
    (r): r is ExploreAvailabilityRow & { nextSlotAt: Date } =>
      r.nextSlotAt != null
  )
  const withoutSlot = results.filter((r) => r.nextSlotAt == null)
  withSlot.sort((a, b) => a.nextSlotAt.getTime() - b.nextSlotAt.getTime())
  return [...withSlot, ...withoutSlot]
}
