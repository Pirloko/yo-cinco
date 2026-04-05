'use client'

import { useApp } from '@/lib/app-context'
import { MatchOpportunity } from '@/lib/types'
import {
  matchFillUrgencyMessage,
  matchSpotsRemaining,
} from '@/lib/match-spots'
import { shortCourtPricingLine } from '@/lib/court-pricing'
import { playersSeekProfileLabel } from '@/lib/players-seek-profile'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RevueltaInviteActions } from '@/components/revuelta-invite-actions'
import {
  MapPin,
  Calendar,
  Users,
  Target,
  Shuffle,
  Clock,
  Loader2,
  Flame,
} from 'lucide-react'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { MATCH_CARD_SHELL } from '@/lib/card-shell'

interface MatchCardProps {
  match: MatchOpportunity
  /** @deprecated usar onJoin para apuntarse al partido */
  onAction?: () => void
  /** Apuntarse (insert en participantes). Si no se pasa, se usa onAction si existe. */
  onJoin?: () => void | Promise<void>
  isOwn?: boolean
  isJoined?: boolean
  joining?: boolean
  onViewDetails?: () => void
  /** Para mostrar invitación a revuelta: organizador o ya unido al partido. */
  currentUserId?: string
  /** Inicio: priorizar partidos casi llenos (banner si quedan 1–3 cupos). */
  showHomeFeedUrgency?: boolean
  /** Revuelta privada y el usuario no es del equipo: CTA solicitar. */
  isPrivateRevueltaExternal?: boolean
}

export function MatchCard({
  match,
  onAction,
  onJoin,
  isOwn = false,
  isJoined = false,
  joining = false,
  onViewDetails,
  currentUserId,
  showHomeFeedUrgency = false,
  isPrivateRevueltaExternal = false,
}: MatchCardProps) {
  const { avatarDisplayUrl } = useApp()
  const getTypeIcon = () => {
    switch (match.type) {
      case 'rival':
        return <Target className="w-4 h-4" />
      case 'players':
        return <Users className="w-4 h-4" />
      case 'open':
        return <Shuffle className="w-4 h-4" />
    }
  }

  const getTypeLabel = () => {
    switch (match.type) {
      case 'rival':
        return 'Busca rival'
      case 'players':
        return 'Faltan jugadores'
      case 'open':
        return match.privateRevueltaTeamId ? 'Revuelta privada' : 'Revuelta abierta'
    }
  }

  const getActionLabel = () => {
    switch (match.type) {
      case 'rival':
        return 'Desafiar'
      case 'players':
        return 'Postular'
      case 'open':
        return isPrivateRevueltaExternal ? 'Solicitar' : 'Unirse'
    }
  }

  const getLevelColor = () => {
    switch (match.level) {
      case 'principiante':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'intermedio':
        return 'bg-primary/20 text-primary border-primary/30'
      case 'avanzado':
        return 'bg-accent/20 text-accent border-accent/30'
      case 'competitivo':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
    }
  }

  const getTypeBgColor = () => {
    switch (match.type) {
      case 'rival':
        return 'bg-red-500/10 border-red-500/30'
      case 'players':
        return 'bg-primary/10 border-primary/30'
      case 'open':
        return 'bg-accent/10 border-accent/30'
    }
  }

  const handleAction = () => {
    if (onJoin) void onJoin()
    else onAction?.()
  }

  const priceLine = shortCourtPricingLine(match)

  const actionDisabled = joining || (isJoined && !isOwn)
  const spotsLeft = matchSpotsRemaining(match)
  const urgencyMsg =
    showHomeFeedUrgency &&
    spotsLeft != null &&
    spotsLeft >= 1 &&
    spotsLeft <= 3 &&
    !isOwn &&
    !isJoined
      ? matchFillUrgencyMessage(spotsLeft)
      : null

  const actionLabel = isOwn
    ? 'Gestionar'
    : isJoined
      ? 'Te uniste'
      : getActionLabel()

  return (
    <div className={MATCH_CARD_SHELL}>
      {/* Header with type badge */}
      <div className={`px-4 py-3 border-b border-border ${getTypeBgColor()}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${
              match.type === 'rival' ? 'bg-red-500/20 text-red-400' :
              match.type === 'players' ? 'bg-primary/20 text-primary' :
              'bg-accent/20 text-accent'
            }`}>
              {getTypeIcon()}
            </div>
            <span className={`text-sm font-medium ${
              match.type === 'rival' ? 'text-red-400' :
              match.type === 'players' ? 'text-primary' :
              'text-accent'
            }`}>
              {getTypeLabel()}
            </span>
          </div>
          <Badge variant="outline" className={getLevelColor()}>
            {match.level}
          </Badge>
        </div>
      </div>

      {urgencyMsg ? (
        <div className="px-4 py-2.5 border-b border-amber-500/30 bg-amber-500/10 flex gap-2 items-start">
          <Flame className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
              {urgencyMsg}
            </p>
            <button
              type="button"
              onClick={handleAction}
              disabled={actionDisabled}
              className="text-xs font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-200 disabled:opacity-50"
            >
              Unirte ahora
            </button>
          </div>
        </div>
      ) : null}

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title and Team */}
        <div className="space-y-1">
          <h3 className="font-semibold text-base leading-snug text-foreground pr-1">
            {match.title}
          </h3>
          {match.teamName && (
            <p className="text-sm text-muted-foreground">{match.teamName}</p>
          )}
          {match.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {match.description}
            </p>
          )}
        </div>

        {/* Cuándo y dónde: bloque único, menos filas sueltas */}
        <div className="rounded-xl border border-border/80 bg-secondary/40 px-3 py-2.5 space-y-2">
          <div className="flex gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/80 border border-border/60">
              <Calendar className="w-4 h-4 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground leading-tight">
                {formatMatchInTimezone(match.dateTime, "EEEE d 'de' MMMM")}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5 shrink-0 text-primary/90" aria-hidden />
                {formatMatchInTimezone(match.dateTime, 'HH:mm')} hrs
              </p>
            </div>
          </div>
          <div className="flex gap-2.5 border-t border-border/50 pt-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/80 border border-border/60">
              <MapPin className="w-4 h-4 text-primary" aria-hidden />
            </div>
            <p className="min-w-0 flex-1 text-sm text-muted-foreground leading-snug">
              <span className="text-foreground font-medium">{match.venue}</span>
              <span className="text-muted-foreground"> · {match.location}</span>
            </p>
          </div>
        </div>

        {priceLine ? (
          <p className="text-xs font-medium leading-snug text-amber-950 bg-amber-400/20 border border-amber-900/15 rounded-lg px-2.5 py-1.5 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-50">
            {priceLine}
          </p>
        ) : null}

        {match.playersNeeded ? (
          <div className="rounded-xl border border-border/80 bg-secondary/30 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-primary shrink-0" aria-hidden />
                <span className="text-sm font-medium text-foreground">
                  {match.playersJoined}/{match.playersNeeded} jugadores
                </span>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${Math.min(100, ((match.playersJoined || 0) / match.playersNeeded) * 100)}%`,
                }}
              />
            </div>
            {match.type === 'open' && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Cupos libres:{' '}
                <span className="text-foreground font-medium">
                  {Math.max(0, match.playersNeeded - (match.playersJoined || 0))}
                </span>
                . Total en cancha (organizador incluido).
              </p>
            )}
            {match.type === 'players' && (
              <div className="text-[11px] text-muted-foreground space-y-0.5 leading-relaxed">
                <p>Cupos solo para quienes se suman (el organizador no cuenta).</p>
                {playersSeekProfileLabel(match.playersSeekProfile) && (
                  <p className="text-foreground/90">
                    {playersSeekProfileLabel(match.playersSeekProfile)}
                    {match.playersSeekProfile === 'gk_and_field' && (
                      <span className="text-muted-foreground">
                        {' '}
                        · máx. 1 arquero
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}

        {match.type === 'open' &&
          currentUserId &&
          (match.creatorId === currentUserId || isJoined) && (
            <RevueltaInviteActions opportunity={match} className="pt-0.5" />
          )}

        {/* Creator */}
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2 border-t border-border">
          <div className="flex items-center gap-3">
            <img
              src={avatarDisplayUrl(match.creatorPhoto, match.creatorId)}
              alt={match.creatorName}
              className="w-10 h-10 rounded-full object-cover border-2 border-border"
            />
            <div>
              <p className="text-sm font-medium text-foreground">{match.creatorName}</p>
              <p className="text-xs text-muted-foreground">Organizador</p>
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewDetails}
              className="text-primary hover:text-primary"
            >
              Ver detalle
            </Button>
            <Button
              onClick={handleAction}
              disabled={actionDisabled}
              className={
                (isJoined && !isOwn)
                  ? 'bg-secondary text-muted-foreground hover:bg-secondary'
                  : match.type === 'rival'
                    ? 'bg-red-500 hover:bg-red-600 text-primary-foreground'
                    : match.type === 'players'
                      ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                      : 'bg-accent hover:bg-accent/90 text-accent-foreground'
              }
            >
              {joining ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uniendo…
                </>
              ) : (
                actionLabel
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
