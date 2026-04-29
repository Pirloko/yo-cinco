'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchVenueBiCourtsBreakdown } from '@/lib/supabase/venue-bi-queries'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'

export function useVenueBiCourtsBreakdown(params: {
  venueId: string | null | undefined
  userId: string | null | undefined
  fromIso: string
  toIso: string
  enabled?: boolean
}) {
  return useQuery({
    queryKey: queryKeys.venueBi.courtsBreakdown(
      params.venueId,
      params.fromIso,
      params.toIso
    ),
    enabled:
      Boolean(params.venueId) &&
      (params.enabled ?? true) &&
      sessionQueryEnabled(params.userId) &&
      isSupabaseConfigured(),
    queryFn: async () => {
      const sb = getBrowserSupabase()
      if (!sb || !params.venueId) return []
      return fetchVenueBiCourtsBreakdown(sb, params.venueId, params.fromIso, params.toIso)
    },
  })
}

