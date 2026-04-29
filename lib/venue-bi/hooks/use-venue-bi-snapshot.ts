'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchVenueBiSnapshot } from '@/lib/supabase/venue-bi-queries'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'
import { VENUE_BI_DEFAULT_TIMEZONE } from '@/lib/venue-bi/date-range'

export function useVenueBiSnapshot(params: {
  venueId: string | null | undefined
  userId: string | null | undefined
  fromIso: string
  toIso: string
  timezone?: string
  enabled?: boolean
}) {
  const timezone = params.timezone ?? VENUE_BI_DEFAULT_TIMEZONE
  return useQuery({
    queryKey: queryKeys.venueBi.snapshot(
      params.venueId,
      params.fromIso,
      params.toIso,
      timezone
    ),
    enabled:
      Boolean(params.venueId) &&
      (params.enabled ?? true) &&
      sessionQueryEnabled(params.userId) &&
      isSupabaseConfigured(),
    queryFn: async () => {
      const supabase = getBrowserSupabase()
      if (!supabase || !params.venueId) return null
      return fetchVenueBiSnapshot(supabase, params.venueId, params.fromIso, params.toIso, timezone)
    },
  })
}
