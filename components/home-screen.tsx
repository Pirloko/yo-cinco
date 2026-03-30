'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { MatchCard } from '@/components/match-card'
import { Button } from '@/components/ui/button'
import { Target, Users, Shuffle, Sparkles, Bell, ChevronRight } from 'lucide-react'
import { ThemeMenuButton } from '@/components/theme-controls'
import { MatchOpportunity, MatchType } from '@/lib/types'
import { JoinRevueltaDialog } from '@/components/join-revuelta-dialog'
import { JoinPlayersSearchDialog } from '@/components/join-players-search-dialog'
import { RegionCityFilterSelect } from '@/components/region-city-filter'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchGeoCitiesWithVenuesInRegion } from '@/lib/supabase/venue-queries'
import { compareMatchOpportunitiesByFillUrgency } from '@/lib/match-spots'
import { TEAM_ROSTER_MAX } from '@/lib/team-roster'

type FilterType = 'all' | MatchType

export function HomeScreen() {
  const {
    currentUser,
    getFilteredMatches,
    getUserTeams,
    setCurrentScreen,
    setSelectedMatchOpportunityId,
    joinMatchOpportunity,
    acceptRivalOpportunityWithTeam,
    participatingOpportunityIds,
    setInitialMatchesTab,
  } = useApp()
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [revueltaJoinOpp, setRevueltaJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [playersJoinOpp, setPlayersJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [rivalPickOppId, setRivalPickOppId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [cityFilter, setCityFilter] = useState('')
  const [cityFilterOptions, setCityFilterOptions] = useState<
    Array<{ id: string; name: string }>
  >([])

  useEffect(() => {
    if (!currentUser?.regionId || !isSupabaseConfigured()) {
      setCityFilterOptions([])
      setCityFilter('')
      return
    }
    void fetchGeoCitiesWithVenuesInRegion(
      createClient(),
      currentUser.regionId
    ).then(setCityFilterOptions)
  }, [currentUser?.regionId])

  const matches = currentUser
    ? getFilteredMatches(currentUser.gender).filter(
        (m) => m.status === 'pending' || m.status === 'confirmed'
      )
    : []

  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)

  const visibleMatches = matches.filter((m) => m.dateTime.getTime() >= midnight.getTime())

  const byCity =
    cityFilter === ''
      ? visibleMatches
      : visibleMatches.filter((m) => m.cityId === cityFilter)

  const filteredMatches =
    activeFilter === 'all'
      ? byCity
      : byCity.filter((m) => m.type === activeFilter)

  const sortedFeedMatches = useMemo(
    () => [...filteredMatches].sort(compareMatchOpportunitiesByFillUrgency),
    [filteredMatches]
  )

  const captainTeams = getUserTeams().filter((t) => t.captainId === currentUser?.id)

  const handleJoin = async (
    opportunityId: string,
    isOwn: boolean,
    type: MatchType
  ) => {
    if (isOwn) {
      setSelectedMatchOpportunityId(opportunityId)
      setCurrentScreen('matchDetails')
      return
    }

    if (type === 'rival') {
      if (captainTeams.length === 0) {
        setCurrentScreen('teams')
        return
      }
      if (captainTeams.length === 1) {
        await acceptRivalOpportunityWithTeam(opportunityId, captainTeams[0].id)
      } else {
        setRivalPickOppId(opportunityId)
      }
      return
    }

    if (type === 'open') {
      const m = sortedFeedMatches.find((x) => x.id === opportunityId)
      if (m) setRevueltaJoinOpp(m)
      return
    }

    if (type === 'players') {
      const m = sortedFeedMatches.find((x) => x.id === opportunityId)
      if (m) setPlayersJoinOpp(m)
      return
    }

    setJoiningId(opportunityId)
    try {
      await joinMatchOpportunity(opportunityId)
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header: logo + saludo en fila; acciones a la derecha */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative shrink-0 animate-float-logo-sm">
              <div
                className="pointer-events-none absolute inset-0 -z-10 scale-125 rounded-2xl bg-primary/20 blur-xl dark:bg-primary/30"
                aria-hidden
              />
              <Image
                src="/logohome.png"
                alt="SPORTMATCH"
                width={160}
                height={160}
                className="h-12 w-12 object-contain drop-shadow-[0_0_16px_oklch(0.72_0.19_142_/_0.3)] md:h-14 md:w-14"
                sizes="56px"
                priority
                loading="eager"
              />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-foreground md:text-2xl">
                Hola, {currentUser?.name?.split(' ')[0] || 'Jugador'}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                Encuentra tu partido perfecto
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeMenuButton className="shrink-0" />
            <Button
              variant="ghost"
              size="icon"
              className="relative shrink-0"
              type="button"
              onClick={() => {
                setInitialMatchesTab('chats')
                setCurrentScreen('matches')
              }}
              aria-label="Ir a chats de partidos"
            >
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
            </Button>
            <button 
              onClick={() => setCurrentScreen('profile')}
              className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary"
            >
              <img
                src={currentUser?.photo || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face'}
                alt={currentUser?.name}
                className="w-full h-full object-cover"
              />
            </button>
          </div>
        </div>

      </header>

      {/* Quick Actions */}
      <div className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickActionCard
            icon={<Sparkles className="w-6 h-6" />}
            label="Todos"
            cta="Ver oportunidades"
            selected={activeFilter === 'all'}
            color="bg-primary/10 text-primary border-primary/30"
            onClick={() => setActiveFilter('all')}
          />
          <QuickActionCard
            icon={<Target className="w-6 h-6" />}
            label="Se busca rival"
            cta="Acepta un desafío"
            selected={activeFilter === 'rival'}
            color="bg-red-500/10 text-red-400 border-red-500/30"
            onClick={() => setActiveFilter('rival')}
          />
          <QuickActionCard
            icon={<Users className="w-6 h-6" />}
            label="Falta uno"
            cta="Súmate al equipo"
            selected={activeFilter === 'players'}
            color="bg-primary/10 text-primary border-primary/30"
            onClick={() => setActiveFilter('players')}
          />
          <QuickActionCard
            icon={<Shuffle className="w-6 h-6" />}
            label="Partido revuelta"
            cta="Entra a jugar"
            selected={activeFilter === 'open'}
            color="bg-accent/10 text-accent border-accent/30"
            onClick={() => setActiveFilter('open')}
          />
        </div>
      </div>

      {/* Descubre equipos → pantalla /swipe */}
      <div className="px-4 mb-6">
        <Link
          href="/swipe"
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/20 to-accent/20 p-4 text-left transition-all hover:border-primary/50 group"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <Sparkles className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Descubre equipos</p>
              <p className="text-sm text-muted-foreground">
                Solicita unirte o desafía
              </p>
            </div>
          </div>
          <ChevronRight
            className="h-6 w-6 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>

      {/* Match Feed */}
      <div className="px-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Oportunidades cerca de ti
          </h2>
          <RegionCityFilterSelect
            cities={cityFilterOptions}
            value={cityFilter}
            onChange={setCityFilter}
          />
        </div>

        {sortedFeedMatches.length > 0 ? (
          <div className="space-y-4">
            {sortedFeedMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                isOwn={currentUser?.id === match.creatorId}
                isJoined={participatingOpportunityIds.includes(match.id)}
                joining={joiningId === match.id}
                onViewDetails={() => {
                  setSelectedMatchOpportunityId(match.id)
                  setCurrentScreen('matchDetails')
                }}
                currentUserId={currentUser?.id}
                showHomeFeedUrgency
                onJoin={() =>
                  handleJoin(
                    match.id,
                    currentUser?.id === match.creatorId,
                    match.type
                  )
                }
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No hay partidos disponibles con este filtro
            </p>
            <Button 
              variant="link" 
              className="text-primary mt-2"
              onClick={() => setActiveFilter('all')}
            >
              Ver todos los partidos
            </Button>
          </div>
        )}
      </div>

      <JoinRevueltaDialog
        open={revueltaJoinOpp !== null}
        onOpenChange={(open) => {
          if (!open) setRevueltaJoinOpp(null)
        }}
        opportunity={revueltaJoinOpp}
        onJoin={async (isGk) => {
          if (!revueltaJoinOpp) return
          await joinMatchOpportunity(revueltaJoinOpp.id, {
            isGoalkeeper: isGk,
          })
        }}
      />

      <JoinPlayersSearchDialog
        open={playersJoinOpp !== null}
        onOpenChange={(open) => {
          if (!open) setPlayersJoinOpp(null)
        }}
        opportunity={playersJoinOpp}
        onJoin={async (isGk) => {
          if (!playersJoinOpp) return
          await joinMatchOpportunity(playersJoinOpp.id, {
            isGoalkeeper: isGk,
          })
        }}
      />

      {rivalPickOppId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-2xl bg-card border-t border-border p-4 space-y-3">
            <p className="font-semibold text-foreground">Selecciona tu equipo para desafiar</p>
            {captainTeams.map((team) => (
              <button
                key={team.id}
                type="button"
                className="w-full text-left p-3 rounded-xl border border-border hover:border-primary/50"
                onClick={() => {
                  void acceptRivalOpportunityWithTeam(rivalPickOppId, team.id)
                  setRivalPickOppId(null)
                }}
              >
                <p className="font-medium text-foreground">{team.name}</p>
                <p className="text-xs text-muted-foreground">
                  {team.members.length}/{TEAM_ROSTER_MAX} jugadores
                </p>
              </button>
            ))}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setRivalPickOppId(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function QuickActionCard({
  icon,
  label,
  cta,
  selected,
  color,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  cta: string
  selected: boolean
  color: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border flex flex-col items-center gap-1.5 transition-all hover:scale-105 text-center ${
        selected ? 'ring-2 ring-primary/40' : ''
      } ${color}`}
    >
      {icon}
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[11px] opacity-90">{cta}</span>
    </button>
  )
}
