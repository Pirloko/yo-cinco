'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchGeoCitiesWithVenuesInRegion } from '@/lib/supabase/venue-queries'

export function useGeoCitiesWithVenuesInRegion(regionId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.geo.citiesWithVenuesInRegion(regionId),
    enabled: Boolean(regionId && isSupabaseConfigured()),
    queryFn: async () => {
      const sb = getBrowserSupabase()
      if (!sb || !regionId) return []
      return await fetchGeoCitiesWithVenuesInRegion(sb, regionId)
    },
  })
}

