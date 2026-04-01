'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin,
  Calendar,
  Swords,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/app-context'
import type { Level, Team, TeamJoinRequest } from '@/lib/types'

const LEVEL_LABEL: Record<Level, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  competitivo: 'Competitivo',
}

const levelBadgeClass: Record<Level, string> = {
  principiante: 'bg-slate-500/95 text-white',
  intermedio: 'bg-emerald-600/95 text-white',
  avanzado: 'bg-amber-600/95 text-white',
  competitivo: 'bg-red-600/95 text-white',
}

type DiscoverTeamsCarouselProps = {
  teams: Team[]
  matchCounts: Record<string, number>
  loadingCounts: boolean
  currentUserId: string
  joinRequests: TeamJoinRequest[]
  joiningTeamId: string | null
  /** Si es false, el usuario no tiene equipo como capitán/vice para desafiar. */
  canChallengeRival?: boolean
  onRequestJoin: (teamId: string) => void
  onChallenge: (team: Team) => void
}

export function DiscoverTeamsCarousel({
  teams,
  matchCounts,
  loadingCounts,
  currentUserId,
  joinRequests,
  joiningTeamId,
  canChallengeRival = true,
  onRequestJoin,
  onChallenge,
}: DiscoverTeamsCarouselProps) {
  const { avatarDisplayUrl } = useApp()
  const [index, setIndex] = useState(0)
  const teamIdsKey = teams.map((t) => t.id).join(',')

  useEffect(() => {
    setIndex(0)
  }, [teamIdsKey])

  useEffect(() => {
    if (index >= teams.length && teams.length > 0) {
      setIndex(teams.length - 1)
    }
  }, [teams.length, index])

  if (teams.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No hay equipos para mostrar con el filtro actual. Prueba otra ciudad o revisa
          más tarde.
        </p>
      </div>
    )
  }

  const team = teams[index]
  const captainMember = team.members.find((m) => m.id === team.captainId)
  const captainName = captainMember?.name ?? 'Capitán'
  const fallbackMember = team.members[0]
  const coverUrl =
    team.logo?.trim() ||
    (captainMember
      ? avatarDisplayUrl(captainMember.photo, captainMember.id)
      : fallbackMember
        ? avatarDisplayUrl(fallbackMember.photo, fallbackMember.id)
        : 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&h=1000&fit=crop')
  const hasPendingJoin = joinRequests.some(
    (r) =>
      r.teamId === team.id &&
      r.requesterId === currentUserId &&
      r.status === 'pending'
  )

  const goPrev = () => setIndex((i) => Math.max(0, i - 1))
  const goNext = () => setIndex((i) => Math.min(teams.length - 1, i + 1))

  return (
    <div
      className="w-full max-w-md mx-auto outline-none rounded-2xl"
      aria-label="Equipos sugeridos estilo tarjeta"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          goPrev()
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          goNext()
        }
      }}
    >
      <p className="text-center text-xs text-muted-foreground mb-2 tabular-nums">
        {index + 1} / {teams.length}
      </p>

      <div className="relative flex items-stretch gap-1 sm:gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          aria-label="Equipo anterior"
          className="flex h-12 w-10 sm:w-12 shrink-0 items-center justify-center self-center rounded-full border border-border bg-background/90 text-foreground shadow-md backdrop-blur-sm transition-opacity disabled:opacity-35 disabled:pointer-events-none hover:bg-secondary z-10"
        >
          <ChevronLeft className="h-7 w-7" strokeWidth={2.5} />
        </button>

        <div className="min-w-0 flex-1 relative">
          <DiscoverTeamCard
            key={team.id}
            team={team}
            matchCount={matchCounts[team.id] ?? 0}
            loadingCounts={loadingCounts}
            captainName={captainName}
            coverUrl={coverUrl}
            hasPendingJoin={hasPendingJoin}
            joining={joiningTeamId === team.id}
            onRequestJoin={() => onRequestJoin(team.id)}
            onChallenge={() => onChallenge(team)}
            canChallengeRival={canChallengeRival}
          />
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={index >= teams.length - 1}
          aria-label="Siguiente equipo"
          className="flex h-12 w-10 sm:w-12 shrink-0 items-center justify-center self-center rounded-full border border-border bg-background/90 text-foreground shadow-md backdrop-blur-sm transition-opacity disabled:opacity-35 disabled:pointer-events-none hover:bg-secondary z-10"
        >
          <ChevronRight className="h-7 w-7" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

function DiscoverTeamCard({
  team,
  matchCount,
  loadingCounts,
  captainName,
  coverUrl,
  hasPendingJoin,
  joining,
  onRequestJoin,
  onChallenge,
  canChallengeRival,
}: {
  team: Team
  matchCount: number
  loadingCounts: boolean
  captainName: string
  coverUrl: string
  hasPendingJoin: boolean
  joining: boolean
  canChallengeRival: boolean
  onRequestJoin: () => void
  onChallenge: () => void
}) {
  const memberCount = team.members.filter((m) => m.status === 'confirmed').length
  const createdLabel = formatDistanceToNow(team.createdAt, {
    addSuffix: true,
    locale: es,
  })

  return (
    <article className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-xl ring-1 ring-white/5">
      <div className="relative aspect-[3/4] w-full min-h-[22rem]">
        <Image
          src={coverUrl}
          alt={`${team.name} — imagen del equipo`}
          fill
          className="object-cover"
          sizes="(max-width: 448px) 100vw, 400px"
          priority={false}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/10"
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute right-3 top-3 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg ${levelBadgeClass[team.level]}`}
        >
          {LEVEL_LABEL[team.level]}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 pt-12 text-white">
          <h3 className="text-2xl font-bold leading-tight tracking-tight drop-shadow-lg">
            {team.name}
          </h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-white/95">
            <MapPin className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
            {team.city}
          </p>
          <p className="mt-1 text-sm text-white/90">Capitán · {captainName}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium backdrop-blur-md">
              <Users className="mr-1 inline h-3.5 w-3.5 -translate-y-px opacity-95" />
              {memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium backdrop-blur-md">
              <Calendar className="mr-1 inline h-3.5 w-3.5 -translate-y-px opacity-95" />
              {createdLabel}
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium backdrop-blur-md">
              <Swords className="mr-1 inline h-3.5 w-3.5 -translate-y-px opacity-95" />
              {loadingCounts ? (
                <Loader2 className="inline h-3.5 w-3.5 animate-spin" aria-label="Cargando" />
              ) : (
                <>{matchCount} part. jugados</>
              )}
            </span>
            <span
              className="rounded-full bg-white/20 px-3 py-1.5 text-[11px] font-semibold backdrop-blur-md tabular-nums leading-tight"
              title="Victorias, empates y derrotas (partidos rival)"
            >
              {team.statsWins ?? 0} vic · {team.statsDraws ?? 0} emp · {team.statsLosses ?? 0}{' '}
              der
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border bg-background/98 p-3">
        <Button
          type="button"
          variant="secondary"
          className="h-12 text-sm font-semibold"
          disabled={hasPendingJoin || joining}
          onClick={onRequestJoin}
        >
          {joining ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasPendingJoin ? (
            'Solicitud enviada'
          ) : (
            'Solicitar unirme'
          )}
        </Button>
        <Button
          type="button"
          className="h-12 bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          disabled={!canChallengeRival}
          title={
            !canChallengeRival
              ? 'Necesitás ser capitán o vicecapitán de un equipo'
              : undefined
          }
          onClick={onChallenge}
        >
          Desafiar equipo
        </Button>
      </div>
    </article>
  )
}
