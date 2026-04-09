'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { QUERY_STALE_TIME_STATIC_MS } from '@/lib/query-defaults'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { fetchGeoCitiesWithVenuesInRegion } from '@/lib/supabase/venue-queries'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'

export function useGeoCitiesWithVenuesInRegion(
  regionId: string | null | undefined,
  userId: string | null | undefined
) {
  return useQuery({
    queryKey: queryKeys.geo.citiesWithVenuesInRegion(regionId),
    staleTime: QUERY_STALE_TIME_STATIC_MS,
    enabled: Boolean(regionId && sessionQueryEnabled(userId)),
    queryFn: async () => {
      const sb = getBrowserSupabase()
      if (!sb || !regionId) return []
      return await fetchGeoCitiesWithVenuesInRegion(sb, regionId)
    },
  })
}

