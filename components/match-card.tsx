'use client'

import { MatchOpportunity } from '@/lib/types'
import { playersSeekProfileLabel } from '@/lib/players-seek-profile'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RevueltaInviteActions } from '@/components/revuelta-invite-actions'
import { MapPin, Calendar, Users, Target, Shuffle, Clock, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

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
}: MatchCardProps) {
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
        return 'Revuelta abierta'
    }
  }

  const getActionLabel = () => {
    switch (match.type) {
      case 'rival':
        return 'Desafiar'
      case 'players':
        return 'Postular'
      case 'open':
        return 'Unirse'
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

  const actionDisabled = joining || (isJoined && !isOwn)
  const actionLabel = isOwn
    ? 'Gestionar'
    : isJoined
      ? 'Te uniste'
      : getActionLabel()

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/50 transition-all">
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

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Title and Team */}
        <div>
          <h3 className="font-semibold text-lg text-foreground">{match.title}</h3>
          {match.teamName && (
            <p className="text-sm text-muted-foreground">{match.teamName}</p>
          )}
          {match.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{match.description}</p>
          )}
        </div>

        {/* Details */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4 text-primary" />
            <span>{format(new Date(match.dateTime), "EEEE d 'de' MMMM", { locale: es })}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4 text-primary" />
            <span>{format(new Date(match.dateTime), 'HH:mm', { locale: es })} hrs</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4 text-primary" />
            <span>{match.venue}, {match.location}</span>
          </div>
          {match.playersNeeded && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4 text-primary" />
                <span>{match.playersJoined}/{match.playersNeeded} jugadores</span>
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${((match.playersJoined || 0) / match.playersNeeded) * 100}%`,
                    }}
                  />
                </div>
              </div>
              {match.type === 'open' && (
                <p className="text-xs text-muted-foreground pl-6">
                  Cupos disponibles:{' '}
                  <span className="text-foreground font-medium">
                    {Math.max(
                      0,
                      match.playersNeeded - (match.playersJoined || 0)
                    )}
                  </span>
                  {' · '}
                  Total en cancha (organizador incluido).
                </p>
              )}
              {match.type === 'players' && (
                <div className="text-xs text-muted-foreground pl-6 space-y-0.5">
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
          )}
          {match.type === 'open' &&
            currentUserId &&
            (match.creatorId === currentUserId || isJoined) && (
              <RevueltaInviteActions opportunity={match} className="pt-1" />
            )}
        </div>

        {/* Creator */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-3">
            <img
              src={match.creatorPhoto}
              alt={match.creatorName}
              className="w-10 h-10 rounded-full object-cover border-2 border-border"
            />
            <div>
              <p className="text-sm font-medium text-foreground">{match.creatorName}</p>
              <p className="text-xs text-muted-foreground">Organizador</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
