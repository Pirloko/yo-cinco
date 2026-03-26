'use client'

import { useState } from 'react'
import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { MatchCard } from '@/components/match-card'
import { Button } from '@/components/ui/button'
import { Target, Users, Shuffle, Sparkles, Bell, LayoutList } from 'lucide-react'
import { MatchOpportunity, MatchType } from '@/lib/types'
import { JoinRevueltaDialog } from '@/components/join-revuelta-dialog'
import { JoinPlayersSearchDialog } from '@/components/join-players-search-dialog'

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

  const matches = currentUser
    ? getFilteredMatches(currentUser.gender).filter(
        (m) => m.status === 'pending' || m.status === 'confirmed'
      )
    : []

  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)

  const visibleMatches = matches.filter((m) => m.dateTime.getTime() >= midnight.getTime())
  
  const filteredMatches = activeFilter === 'all' 
    ? visibleMatches
    : visibleMatches.filter((m) => m.type === activeFilter)

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
      const m = filteredMatches.find((x) => x.id === opportunityId)
      if (m) setRevueltaJoinOpp(m)
      return
    }

    if (type === 'players') {
      const m = filteredMatches.find((x) => x.id === opportunityId)
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

  const filters: { id: FilterType; icon: React.ReactNode; label: string }[] = [
    { id: 'all', icon: <Sparkles className="w-4 h-4" />, label: 'Todos' },
    { id: 'rival', icon: <Target className="w-4 h-4" />, label: 'Rivales' },
    { id: 'players', icon: <Users className="w-4 h-4" />, label: 'Jugadores' },
    { id: 'open', icon: <Shuffle className="w-4 h-4" />, label: 'Revueltas' },
  ]

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Hola, {currentUser?.name?.split(' ')[0] || 'Jugador'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Encuentra tu partido perfecto
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="relative"
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

        {/* Filter Tabs */}
        <div className="flex gap-2 px-4 pb-4 overflow-x-auto scrollbar-hide">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                activeFilter === filter.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}
            >
              {filter.icon}
              <span className="text-sm font-medium">{filter.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Quick Actions */}
      <div className="p-4">
        <div className="grid grid-cols-3 gap-3">
          <QuickActionCard
            icon={<Target className="w-6 h-6" />}
            label="Buscar rival"
            color="bg-red-500/10 text-red-400 border-red-500/30"
            onClick={() => setCurrentScreen('create')}
          />
          <QuickActionCard
            icon={<Users className="w-6 h-6" />}
            label="Buscar jugadores"
            color="bg-primary/10 text-primary border-primary/30"
            onClick={() => setCurrentScreen('create')}
          />
          <QuickActionCard
            icon={<Shuffle className="w-6 h-6" />}
            label="Crear revuelta"
            color="bg-accent/10 text-accent border-accent/30"
            onClick={() => setCurrentScreen('create')}
          />
        </div>
      </div>

      {/* Mis partidos y chats */}
      <div className="px-4 mb-4">
        <button
          type="button"
          onClick={() => setCurrentScreen('matches')}
          className="w-full p-4 bg-card rounded-2xl border border-border flex items-center justify-between gap-3 hover:border-primary/50 transition-all text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <LayoutList className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Mis partidos y chats</p>
              <p className="text-sm text-muted-foreground">
                Próximos, conversaciones y finalizados
              </p>
            </div>
          </div>
          <svg
            className="w-5 h-5 text-primary shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Swipe Banner */}
      <div className="px-4 mb-4">
        <button 
          type="button"
          onClick={() => setCurrentScreen('swipe')}
          className="w-full p-4 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl border border-primary/30 flex items-center justify-between group hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-foreground">Descubre jugadores</p>
              <p className="text-sm text-muted-foreground">Desliza para conectar</p>
            </div>
          </div>
          <div className="text-primary group-hover:translate-x-1 transition-transform">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      {/* Match Feed */}
      <div className="px-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Oportunidades cerca de ti
          </h2>
          <button 
            onClick={() => setCurrentScreen('explore')}
            className="text-sm text-primary hover:underline"
          >
            Ver todas
          </button>
        </div>

        {filteredMatches.length > 0 ? (
          <div className="space-y-4">
            {filteredMatches.map((match) => (
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
                <p className="text-xs text-muted-foreground">{team.members.length}/6 jugadores</p>
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
  color,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all hover:scale-105 ${color}`}
    >
      {icon}
      <span className="text-xs font-medium text-center">{label}</span>
    </button>
  )
}
