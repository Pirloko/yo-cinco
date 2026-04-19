'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'

import {
  useAppAuth,
  useAppMatch,
  useAppTeam,
  useAppUI,
} from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { MatchCard } from '@/components/match-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Users,
  Shuffle,
  Sparkles,
  Bell,
  Swords,
  Loader2,
} from 'lucide-react'
import { ThemeMenuButton } from '@/components/theme-controls'
import { MatchOpportunity, MatchType } from '@/lib/types'
import { JoinRevueltaDialog } from '@/components/join-revuelta-dialog'
import { JoinPlayersSearchDialog } from '@/components/join-players-search-dialog'
import { JoinTeamPickDialog } from '@/components/join-team-pick-dialog'
import { RegionCityFilterSelect } from '@/components/region-city-filter'
import { useGeoCitiesWithVenuesInRegion } from '@/lib/hooks/use-geo-cities-with-venues'
import { compareMatchOpportunitiesByFillUrgency } from '@/lib/match-spots'
import { TEAM_ROSTER_MAX } from '@/lib/team-roster'
import {
  userIsConfirmedMemberOfTeam,
  userIsTeamStaffCaptain,
} from '@/lib/team-membership'
import type { TeamPickPrivateResolveSuccess } from '@/lib/supabase/team-pick-queries'
import { minimalMatchOpportunityForTeamPickPreview } from '@/lib/team-pick-ui'

type FilterType = 'all' | Exclude<MatchType, 'rival'> | 'team_pick'

export function HomeScreen() {
  const {
    setCurrentScreen,
    setSelectedMatchOpportunityId,
    setInitialMatchesTab,
  } = useAppUI()
  const { currentUser, avatarDisplayUrl } = useAppAuth()
  const {
    getFilteredMatches,
    joinMatchOpportunity,
    joinTeamPickMatchOpportunity,
    resolveTeamPickPrivateJoinCode,
    participatingOpportunityIds,
    requestJoinPrivateRevuelta,
  } = useAppMatch()
  const { getUserTeams, acceptRivalOpportunityWithTeam } = useAppTeam()
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [revueltaJoinOpp, setRevueltaJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [playersJoinOpp, setPlayersJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [teamPickJoinOpp, setTeamPickJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [teamPickCodeInput, setTeamPickCodeInput] = useState('')
  const [teamPickByCodePreview, setTeamPickByCodePreview] =
    useState<TeamPickPrivateResolveSuccess | null>(null)
  const [teamPickByCodeOpen, setTeamPickByCodeOpen] = useState(false)
  const [teamPickByCodeBusy, setTeamPickByCodeBusy] = useState(false)
  const [teamPickFixedCode, setTeamPickFixedCode] = useState('')
  const [rivalPickOppId, setRivalPickOppId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [cityFilter, setCityFilter] = useState('')
  const citiesQuery = useGeoCitiesWithVenuesInRegion(
    currentUser?.regionId,
    currentUser?.id
  )
  const cityFilterOptions = citiesQuery.data ?? []

  useEffect(() => {
    setCityFilter('')
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
      : activeFilter === 'team_pick'
        ? byCity.filter(
            (m) =>
              m.type === 'team_pick_public' || m.type === 'team_pick_private'
          )
        : byCity.filter((m) => m.type === activeFilter)

  const sortedFeedMatches = useMemo(
    () => [...filteredMatches].sort(compareMatchOpportunitiesByFillUrgency),
    [filteredMatches]
  )

  const staffTeamsForRival = getUserTeams().filter((t) =>
    userIsTeamStaffCaptain(t, currentUser?.id ?? '')
  )

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
      if (staffTeamsForRival.length === 0) {
        setCurrentScreen('teams')
        return
      }
      if (staffTeamsForRival.length === 1) {
        await acceptRivalOpportunityWithTeam(
          opportunityId,
          staffTeamsForRival[0].id
        )
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

    if (type === 'team_pick_public' || type === 'team_pick_private') {
      const m = sortedFeedMatches.find((x) => x.id === opportunityId)
      if (m) setTeamPickJoinOpp(m)
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
                src="/sportmatch-logo.png"
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
                src={avatarDisplayUrl(
                  currentUser?.photo ||
                    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
                  currentUser?.id
                )}
                alt={currentUser?.name}
                className="w-full h-full object-cover"
              />
            </button>
          </div>
        </div>

      </header>

      {/* Quick Actions */}
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickActionCard
            icon={<Sparkles className="w-6 h-6" />}
            label="Todos"
            cta="Ver oportunidades"
            selected={activeFilter === 'all'}
            color="bg-primary/10 text-primary border-primary/30"
            onClick={() => setActiveFilter('all')}
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
          <QuickActionCard
            icon={<Swords className="w-6 h-6" />}
            label="Selección de equipos"
            cta="Elegí equipo A o B y tu posición."
            selected={activeFilter === 'team_pick'}
            color="bg-primary/10 text-primary border-primary/30"
            onClick={() => setActiveFilter('team_pick')}
          />
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary shrink-0" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">
              Selección de equipos privado: ¿tenés el código?
            </h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ingresá los 4 dígitos que te pasó el organizador. Podés unirte aunque el
            partido no aparezca en tu listado.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input
              inputMode="numeric"
              maxLength={4}
              autoComplete="one-time-code"
              placeholder="0000"
              value={teamPickCodeInput}
              onChange={(e) =>
                setTeamPickCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              className="h-11 sm:max-w-[140px] font-mono tracking-widest text-center text-lg"
              aria-label="Código de partido selección de equipos privado"
            />
            <Button
              type="button"
              className="sm:w-auto"
              disabled={
                teamPickByCodeBusy || teamPickCodeInput.replace(/\D/g, '').length !== 4
              }
              onClick={() => {
                void (async () => {
                  const digits = teamPickCodeInput.replace(/\D/g, '').slice(0, 4)
                  if (digits.length !== 4) return
                  setTeamPickByCodeBusy(true)
                  try {
                    const r = await resolveTeamPickPrivateJoinCode(digits)
                    if (!r.ok) {
                      toast.error(r.error)
                      return
                    }
                    setTeamPickByCodePreview(r)
                    setTeamPickFixedCode(digits)
                    setTeamPickByCodeOpen(true)
                  } finally {
                    setTeamPickByCodeBusy(false)
                  }
                })()
              }}
            >
              {teamPickByCodeBusy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" aria-hidden />
                  Buscando…
                </>
              ) : (
                'Buscar partido'
              )}
            </Button>
          </div>
        </div>
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
            {sortedFeedMatches.map((match) => {
              const privTeam = match.privateRevueltaTeamId
                ? getUserTeams().find((t) => t.id === match.privateRevueltaTeamId)
                : undefined
              const isPrivExt =
                match.type === 'open' &&
                !!match.privateRevueltaTeamId &&
                !userIsConfirmedMemberOfTeam(privTeam, currentUser?.id ?? '')
              return (
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
                isPrivateRevueltaExternal={isPrivExt}
                onJoin={() =>
                  handleJoin(
                    match.id,
                    currentUser?.id === match.creatorId,
                    match.type
                  )
                }
              />
            )})}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-950/50 bg-black/25 px-6 py-14 text-center dark:border-emerald-900/45 dark:bg-black/40">
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-900/45 bg-black/35 text-[2.25rem] leading-none dark:border-emerald-800/50 dark:bg-black/50"
              aria-hidden
            >
              ⚽
            </div>
            <p className="text-base font-bold text-foreground">
              No hay partidos disponibles
            </p>
          </div>
        )}
      </div>

      <JoinRevueltaDialog
        open={revueltaJoinOpp !== null}
        onOpenChange={(open) => {
          if (!open) setRevueltaJoinOpp(null)
        }}
        opportunity={revueltaJoinOpp}
        mode={
          revueltaJoinOpp?.privateRevueltaTeamId &&
          !userIsConfirmedMemberOfTeam(
            getUserTeams().find((t) => t.id === revueltaJoinOpp.privateRevueltaTeamId),
            currentUser?.id ?? ''
          )
            ? 'request'
            : 'join'
        }
        onJoin={async (isGk) => {
          if (!revueltaJoinOpp) return
          const ext =
            revueltaJoinOpp.privateRevueltaTeamId &&
            !userIsConfirmedMemberOfTeam(
              getUserTeams().find(
                (t) => t.id === revueltaJoinOpp.privateRevueltaTeamId
              ),
              currentUser?.id ?? ''
            )
          if (ext) {
            const r = await requestJoinPrivateRevuelta(revueltaJoinOpp.id, isGk)
            if (r.ok) setRevueltaJoinOpp(null)
            return
          }
          await joinMatchOpportunity(revueltaJoinOpp.id, {
            isGoalkeeper: isGk,
          })
          setRevueltaJoinOpp(null)
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

      <JoinTeamPickDialog
        open={teamPickJoinOpp !== null}
        onOpenChange={(open) => {
          if (!open) setTeamPickJoinOpp(null)
        }}
        opportunity={teamPickJoinOpp}
        onJoin={async (payload) => {
          if (!teamPickJoinOpp) return
          await joinTeamPickMatchOpportunity(teamPickJoinOpp.id, payload)
        }}
      />

      <JoinTeamPickDialog
        open={teamPickByCodeOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTeamPickByCodeOpen(false)
            setTeamPickByCodePreview(null)
            setTeamPickFixedCode('')
          }
        }}
        opportunity={
          teamPickByCodePreview
            ? minimalMatchOpportunityForTeamPickPreview({
                id: teamPickByCodePreview.matchId,
                title: teamPickByCodePreview.title,
                venue: teamPickByCodePreview.venue,
                location: teamPickByCodePreview.location,
                dateTime: new Date(teamPickByCodePreview.dateTime),
                level: teamPickByCodePreview.level,
                gender: teamPickByCodePreview.gender,
                type: 'team_pick_private',
                playersNeeded: teamPickByCodePreview.playersNeeded,
                playersJoined: teamPickByCodePreview.playersJoined,
              })
            : null
        }
        fixedJoinCode={teamPickFixedCode.length === 4 ? teamPickFixedCode : null}
        onJoin={async (payload) => {
          if (!teamPickByCodePreview) return
          await joinTeamPickMatchOpportunity(teamPickByCodePreview.matchId, {
            ...payload,
            joinCode: teamPickFixedCode,
          })
          setTeamPickByCodeOpen(false)
          setTeamPickByCodePreview(null)
          setTeamPickFixedCode('')
          setTeamPickCodeInput('')
        }}
      />

      {rivalPickOppId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-2xl bg-card border-t border-border p-4 space-y-3">
            <p className="font-semibold text-foreground">Selecciona tu equipo para desafiar</p>
            {staffTeamsForRival.map((team) => (
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
