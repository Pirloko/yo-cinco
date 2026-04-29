'use client'

import { useMemo, useState } from 'react'
import type { VenueBiPresetRange } from '@/lib/venue-bi/types'
import {
  toInputDateValue,
  venueBiRangeFromPreset,
  type VenueBiDateRange,
} from '@/lib/venue-bi/date-range'

export function useVenueBiFilters(initialPreset: VenueBiPresetRange = '7d') {
  const [preset, setPreset] = useState<VenueBiPresetRange>(initialPreset)
  const initialRange = venueBiRangeFromPreset(initialPreset)
  const [customFrom, setCustomFrom] = useState(toInputDateValue(initialRange.from))
  const [customTo, setCustomTo] = useState(toInputDateValue(initialRange.to))

  const range: VenueBiDateRange = useMemo(() => {
    if (preset !== 'custom') {
      return venueBiRangeFromPreset(preset)
    }
    const from = new Date(`${customFrom}T00:00:00`)
    const to = new Date(`${customTo}T23:59:59.999`)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return venueBiRangeFromPreset('7d')
    }
    return { from, to }
  }, [preset, customFrom, customTo])

  return {
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    range,
    from: range.from,
    to: range.to,
    fromIso: range.from.toISOString(),
    toIso: range.to.toISOString(),
  }
}
