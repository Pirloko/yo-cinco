'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { DiscoverTeamsCarousel } from '@/components/discover-teams-carousel'
import { RegionCityFilterSelect } from '@/components/region-city-filter'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchGeoCitiesWithVenuesInRegion } from '@/lib/supabase/venue-queries'
import { useDiscoverTeams } from '@/hooks/use-discover-teams'
import { saveRivalTargetTeamId } from '@/lib/rival-prefill'
import type { Team } from '@/lib/types'
import { userIsTeamStaffCaptain } from '@/lib/team-membership'

export function SwipeScreen() {
  const router = useRouter()
  const {
    currentUser,
    requestToJoinTeam,
    teamJoinRequests,
    setCurrentScreen,
    getUserTeams,
  } = useApp()
  const [cityFilter, setCityFilter] = useState('')
  const [cityFilterOptions, setCityFilterOptions] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [joiningDiscoverTeamId, setJoiningDiscoverTeamId] = useState<
    string | null
  >(null)

  const { discoverTeams, discoverMatchCounts, loadingDiscoverCounts } =
    useDiscoverTeams({
      cityFilter,
      fetchCountsEnabled: Boolean(currentUser),
    })

  const canChallengeRival = Boolean(
    currentUser &&
      getUserTeams().some((t) => userIsTeamStaffCaptain(t, currentUser.id))
  )

  useEffect(() => {
    if (!currentUser?.regionId || !isSupabaseConfigured()) {
      setCityFilterOptions([])
      setCityFilter('')
      return
    }
    setCityFilter('')
    void fetchGeoCitiesWithVenuesInRegion(
      createClient(),
      currentUser.regionId
    ).then(setCityFilterOptions)
  }, [currentUser?.regionId, currentUser?.cityId])

  const goHome = () => {
    router.push('/')
    setCurrentScreen('home')
  }

  const goTeamsList = () => {
    router.push('/')
    setCurrentScreen('teams')
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 pb-24">
        <p className="text-muted-foreground text-center mb-4">
          Inicia sesión para descubrir equipos y desafiar.
        </p>
        <Button
          className="bg-primary text-primary-foreground"
          onClick={() => {
            router.push('/')
            setCurrentScreen('auth')
          }}
        >
          Ir a iniciar sesión
        </Button>
        <Button variant="ghost" className="mt-2" onClick={goHome}>
          Volver al inicio
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={goHome}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Volver al inicio"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground truncate">
              Descubre equipos
            </h1>
            <p className="text-sm text-muted-foreground">
              Solicita unirte o desafía · usa las flechas para cambiar de equipo
            </p>
          </div>
        </div>
        <div className="px-4 pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <RegionCityFilterSelect
            cities={cityFilterOptions}
            value={cityFilter}
            onChange={setCityFilter}
          />
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline shrink-0 text-left sm:text-right"
            onClick={goTeamsList}
          >
            Ver todos los equipos
          </button>
        </div>
      </header>

      <main className="p-4 pt-2">
        <DiscoverTeamsCarousel
          teams={discoverTeams}
          matchCounts={discoverMatchCounts}
          loadingCounts={loadingDiscoverCounts}
          currentUserId={currentUser.id}
          joinRequests={teamJoinRequests}
          joiningTeamId={joiningDiscoverTeamId}
          canChallengeRival={canChallengeRival}
          onRequestJoin={async (teamId) => {
            setJoiningDiscoverTeamId(teamId)
            try {
              await requestToJoinTeam(teamId)
            } finally {
              setJoiningDiscoverTeamId(null)
            }
          }}
          onChallenge={(team: Team) => {
            saveRivalTargetTeamId(team.id)
            router.push('/')
            setCurrentScreen('create')
          }}
        />
      </main>

      <BottomNav />
    </div>
  )
}
