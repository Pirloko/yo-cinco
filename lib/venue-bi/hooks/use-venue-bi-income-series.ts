'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchVenueBiIncomeSeries } from '@/lib/supabase/venue-bi-queries'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'

export function useVenueBiIncomeSeries(params: {
  venueId: string | null | undefined
  userId: string | null | undefined
  fromIso: string
  toIso: string
  timezone?: string
  enabled?: boolean
}) {
  const tz = params.timezone ?? 'America/Santiago'
  return useQuery({
    queryKey: queryKeys.venueBi.incomeSeries(params.venueId, params.fromIso, params.toIso, tz),
    enabled:
      Boolean(params.venueId) &&
      (params.enabled ?? true) &&
      sessionQueryEnabled(params.userId) &&
      isSupabaseConfigured(),
    queryFn: async () => {
      const sb = getBrowserSupabase()
      if (!sb || !params.venueId) return []
      return fetchVenueBiIncomeSeries(sb, params.venueId, params.fromIso, params.toIso, tz)
    },
  })
}

