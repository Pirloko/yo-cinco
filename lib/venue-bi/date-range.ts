import type { VenueBiPresetRange } from '@/lib/venue-bi/types'

export type VenueBiDateRange = {
  from: Date
  to: Date
}

export const VENUE_BI_DEFAULT_TIMEZONE = 'America/Santiago'

export function venueBiRangeFromPreset(preset: VenueBiPresetRange): VenueBiDateRange {
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  if (preset === 'today' || preset === 'custom') return { from, to }
  if (preset === '7d') {
    from.setDate(from.getDate() - 6)
    return { from, to }
  }
  from.setDate(from.getDate() - 29)
  return { from, to }
}

export function toInputDateValue(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function shiftRangeToPrevious(from: Date, to: Date): VenueBiDateRange {
  const diff = to.getTime() - from.getTime()
  return {
    from: new Date(from.getTime() - diff),
    to: new Date(to.getTime() - diff),
  }
}
