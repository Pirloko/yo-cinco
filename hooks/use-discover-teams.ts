'use client'

import { useEffect, useMemo, useState } from 'react'

import { useApp } from '@/lib/app-context'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchTeamMatchCounts } from '@/lib/supabase/team-stats-queries'
import type { Team } from '@/lib/types'

type Options = {
  cityFilter: string
  /** Si es false no se piden conteos RPC (ahorra llamadas en vistas colapsadas). */
  fetchCountsEnabled: boolean
}

export function useDiscoverTeams({
  cityFilter,
  fetchCountsEnabled,
}: Options): {
  discoverTeams: Team[]
  discoverMatchCounts: Record<string, number>
  loadingDiscoverCounts: boolean
} {
  const { currentUser, teams } = useApp()

  const discoverTeams = useMemo(() => {
    if (!currentUser) return []
    const userTeamIds = new Set(
      teams
        .filter((t) => t.members.some((m) => m.id === currentUser.id))
        .map((t) => t.id)
    )
    let list = teams.filter((t) => {
      if (t.gender !== currentUser.gender) return false
      if (userTeamIds.has(t.id)) return false
      if (t.members.some((m) => m.id === currentUser.id)) return false
      return true
    })
    if (currentUser.regionId) {
      list = list.filter(
        (t) => !t.cityRegionId || t.cityRegionId === currentUser.regionId
      )
    }
    if (cityFilter) {
      list = list.filter((t) => t.cityId === cityFilter)
    }
    return list.slice(0, 40)
  }, [currentUser, teams, cityFilter])

  const discoverTeamIdsKey = discoverTeams.map((t) => t.id).join(',')

  const [discoverMatchCounts, setDiscoverMatchCounts] = useState<
    Record<string, number>
  >({})
  const [loadingDiscoverCounts, setLoadingDiscoverCounts] = useState(false)

  useEffect(() => {
    if (!fetchCountsEnabled) {
      setLoadingDiscoverCounts(false)
      return
    }
    if (!isSupabaseConfigured() || discoverTeams.length === 0) {
      setDiscoverMatchCounts({})
      setLoadingDiscoverCounts(false)
      return
    }
    const ids = discoverTeams.map((t) => t.id)
    let cancelled = false
    setLoadingDiscoverCounts(true)
    void fetchTeamMatchCounts(createClient(), ids)
      .then((map) => {
        if (!cancelled) setDiscoverMatchCounts(map)
      })
      .finally(() => {
        if (!cancelled) setLoadingDiscoverCounts(false)
      })
    return () => {
      cancelled = true
    }
  }, [discoverTeamIdsKey, fetchCountsEnabled, discoverTeams.length])

  return {
    discoverTeams,
    discoverMatchCounts,
    loadingDiscoverCounts,
  }
}
