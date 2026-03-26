import type { VenueReservationRow, VenueWeeklyHour } from '@/lib/types'

export type ComputedSlot = {
  start: Date
  end: Date
  freeCourtIds: string[]
  /** Total canchas del centro (para UI). */
  totalCourts: number
}

function atLocalDayTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const x = new Date(day)
  x.setHours(h, m, 0, 0)
  return x
}

/** Huecos del día `day` según horario semanal, duración y reservas confirmadas. */
export function computeDaySlots(
  day: Date,
  weekly: VenueWeeklyHour[],
  courtIds: string[],
  reservations: VenueReservationRow[],
  slotMinutes: number
): ComputedSlot[] {
  if (!courtIds.length || !weekly.length) return []

  const dow = day.getDay()
  const wh = weekly.find((w) => w.dayOfWeek === dow)
  if (!wh) return []

  const open = atLocalDayTime(day, wh.openTime)
  const close = atLocalDayTime(day, wh.closeTime)
  if (!(open < close)) return []

  const slots: ComputedSlot[] = []
  let cursor = open.getTime()
  const closeMs = close.getTime()
  const step = slotMinutes * 60 * 1000

  const activeRes = reservations.filter((r) => r.status === 'confirmed')

  while (cursor + step <= closeMs) {
    const start = new Date(cursor)
    const end = new Date(cursor + step)
    const busyCourts = new Set<string>()
    for (const r of activeRes) {
      if (r.startsAt < end && r.endsAt > start) {
        busyCourts.add(r.courtId)
      }
    }
    const freeCourtIds = courtIds.filter((id) => !busyCourts.has(id))
    slots.push({
      start,
      end,
      freeCourtIds,
      totalCourts: courtIds.length,
    })
    cursor += step
  }

  return slots
}

export const WEEKDAY_SHORT_ES = [
  'Dom',
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
]
