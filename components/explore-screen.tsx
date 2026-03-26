'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { MatchCard } from '@/components/match-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchSportsVenuesList } from '@/lib/supabase/venue-queries'
import { Level, MatchOpportunity, MatchType, type SportsVenue } from '@/lib/types'
import { JoinRevueltaDialog } from '@/components/join-revuelta-dialog'
import { JoinPlayersSearchDialog } from '@/components/join-players-search-dialog'
import {
  Search,
  SlidersHorizontal,
  X,
  Target,
  Users,
  Shuffle,
  Star,
  MapPin,
  Building2,
} from 'lucide-react'

export function ExploreScreen() {
  const {
    currentUser,
    getFilteredMatches,
    getUserTeams,
    setCurrentScreen,
    setSelectedMatchOpportunityId,
    joinMatchOpportunity,
    acceptRivalOpportunityWithTeam,
    participatingOpportunityIds,
  } = useApp()
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [revueltaJoinOpp, setRevueltaJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [playersJoinOpp, setPlayersJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [rivalPickOppId, setRivalPickOppId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<{
    types: MatchType[]
    levels: Level[]
  }>({
    types: [],
    levels: [],
  })
  const [publicVenues, setPublicVenues] = useState<SportsVenue[]>([])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    void fetchSportsVenuesList(supabase).then(setPublicVenues)
  }, [])

  const allMatches = currentUser
    ? getFilteredMatches(currentUser.gender).filter(
        (m) => m.status === 'pending' || m.status === 'confirmed'
      )
    : []

  const filteredMatches = allMatches.filter((match) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch = 
        match.title.toLowerCase().includes(query) ||
        match.venue.toLowerCase().includes(query) ||
        match.teamName?.toLowerCase().includes(query) ||
        match.location.toLowerCase().includes(query)
      if (!matchesSearch) return false
    }

    // Type filter
    if (filters.types.length > 0 && !filters.types.includes(match.type)) {
      return false
    }

    // Level filter
    if (filters.levels.length > 0 && !filters.levels.includes(match.level)) {
      return false
    }

    return true
  })

  const toggleType = (type: MatchType) => {
    if (filters.types.includes(type)) {
      setFilters({ ...filters, types: filters.types.filter(t => t !== type) })
    } else {
      setFilters({ ...filters, types: [...filters.types, type] })
    }
  }

  const toggleLevel = (level: Level) => {
    if (filters.levels.includes(level)) {
      setFilters({ ...filters, levels: filters.levels.filter(l => l !== level) })
    } else {
      setFilters({ ...filters, levels: [...filters.levels, level] })
    }
  }

  const clearFilters = () => {
    setFilters({ types: [], levels: [] })
    setSearchQuery('')
  }

  const activeFilterCount = filters.types.length + filters.levels.length

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

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border p-4 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Explorar</h1>
        
        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Buscar partidos, canchas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={`h-12 w-12 border-border relative ${showFilters ? 'bg-primary/10 border-primary' : ''}`}
          >
            <SlidersHorizontal className={`w-5 h-5 ${showFilters ? 'text-primary' : 'text-muted-foreground'}`} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="space-y-4 pt-2">
            {/* Type Filters */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Tipo de partido</p>
              <div className="flex gap-2 flex-wrap">
                <FilterChip
                  icon={<Target className="w-4 h-4" />}
                  label="Rivales"
                  active={filters.types.includes('rival')}
                  onClick={() => toggleType('rival')}
                />
                <FilterChip
                  icon={<Users className="w-4 h-4" />}
                  label="Jugadores"
                  active={filters.types.includes('players')}
                  onClick={() => toggleType('players')}
                />
                <FilterChip
                  icon={<Shuffle className="w-4 h-4" />}
                  label="Revueltas"
                  active={filters.types.includes('open')}
                  onClick={() => toggleType('open')}
                />
              </div>
            </div>

            {/* Level Filters */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Nivel</p>
              <div className="flex gap-2 flex-wrap">
                <FilterChip
                  icon={<Star className="w-4 h-4" />}
                  label="Principiante"
                  active={filters.levels.includes('principiante')}
                  onClick={() => toggleLevel('principiante')}
                />
                <FilterChip
                  icon={<Star className="w-4 h-4" />}
                  label="Intermedio"
                  active={filters.levels.includes('intermedio')}
                  onClick={() => toggleLevel('intermedio')}
                />
                <FilterChip
                  icon={<Star className="w-4 h-4" />}
                  label="Avanzado"
                  active={filters.levels.includes('avanzado')}
                  onClick={() => toggleLevel('avanzado')}
                />
                <FilterChip
                  icon={<Star className="w-4 h-4" />}
                  label="Competitivo"
                  active={filters.levels.includes('competitivo')}
                  onClick={() => toggleLevel('competitivo')}
                />
              </div>
            </div>

            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        )}
      </header>

      {publicVenues.length > 0 ? (
        <section className="px-4 pt-2 pb-1 space-y-2 border-b border-border/60">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Centros deportivos
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
            {publicVenues.map((v) => (
              <Link key={v.id} href={`/centro/${v.id}`} className="shrink-0 w-[200px]">
                <Card className="bg-card border-border hover:border-primary/40 transition-colors">
                  <CardContent className="p-3 space-y-1">
                    <p className="font-medium text-sm text-foreground line-clamp-2">
                      {v.name}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {v.city}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Results */}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredMatches.length} {filteredMatches.length === 1 ? 'resultado' : 'resultados'}
          </p>
          {searchQuery && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>Rancagua</span>
            </div>
          )}
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
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No encontramos partidos con estos filtros
            </p>
            <Button
              variant="link"
              className="text-primary mt-2"
              onClick={clearFilters}
            >
              Limpiar filtros
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

function FilterChip({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-secondary text-muted-foreground border-border hover:border-primary/50'
      }`}
    >
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  )
}
