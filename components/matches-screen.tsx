'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { Badge } from '@/components/ui/badge'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchLastMessagesForOpportunities } from '@/lib/supabase/message-queries'
import {
  fetchRatingSummariesForOpportunities,
  isMatchChatMessagingOpen,
  type RatingSummary,
} from '@/lib/supabase/rating-queries'
import type { MatchOpportunity, MatchesHubTab, RivalResult } from '@/lib/types'
import {
  Calendar,
  MapPin,
  MessageCircle,
  CheckCircle,
  Clock,
  Target,
  Users,
  Shuffle,
  Trophy,
  History,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function isUserInvolved(
  m: MatchOpportunity,
  userId: string,
  participatingIds: string[]
) {
  return m.creatorId === userId || participatingIds.includes(m.id)
}

function canUserAccessChat(
  m: MatchOpportunity,
  userId: string,
  participatingIds: string[]
) {
  return m.creatorId === userId || participatingIds.includes(m.id)
}

function formatCompletedOutcome(m: MatchOpportunity): string {
  if (m.status === 'cancelled') return 'Cancelado'
  if (m.type === 'rival' && m.rivalResult) {
    const map: Record<RivalResult, string> = {
      creator_team: 'Ganó el equipo del organizador',
      rival_team: 'Ganó el equipo rival',
      draw: 'Empate',
    }
    return map[m.rivalResult]
  }
  if (m.casualCompleted) return 'Partido jugado'
  return 'Finalizado'
}

export function MatchesScreen() {
  const {
    currentScreen,
    currentUser,
    matchOpportunities,
    participatingOpportunityIds,
    setSelectedChatOpportunityId,
    setSelectedMatchOpportunityId,
    setCurrentScreen,
    initialMatchesTab,
    setInitialMatchesTab,
  } = useApp()

  const [activeTab, setActiveTab] = useState<MatchesHubTab>('upcoming')
  const [lastByOpp, setLastByOpp] = useState<
    Awaited<ReturnType<typeof fetchLastMessagesForOpportunities>>
  >(new Map())
  const [ratingByOpp, setRatingByOpp] = useState<Map<string, RatingSummary>>(
    new Map()
  )

  useEffect(() => {
    if (currentScreen !== 'matches' || !initialMatchesTab) return
    setActiveTab(initialMatchesTab)
    setInitialMatchesTab(null)
  }, [currentScreen, initialMatchesTab, setInitialMatchesTab])

  const myInvolved = useMemo(() => {
    if (!currentUser) return []
    return matchOpportunities.filter((m) =>
      isUserInvolved(m, currentUser.id, participatingOpportunityIds)
    )
  }, [matchOpportunities, currentUser, participatingOpportunityIds])

  const midnight = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const pendingToResolve = useMemo(() => {
    if (!currentUser) return []
    return myInvolved
      .filter((m) => m.creatorId === currentUser.id)
      .filter((m) => m.status === 'pending' || m.status === 'confirmed')
      .filter((m) => m.dateTime.getTime() < midnight.getTime())
      .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime())
  }, [myInvolved, currentUser, midnight])

  const upcomingList = useMemo(
    () =>
      myInvolved
        .filter((m) => m.status === 'pending' || m.status === 'confirmed')
        .filter((m) => m.dateTime.getTime() >= midnight.getTime())
        .sort(
          (a, b) =>
            new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
        ),
    [myInvolved, midnight]
  )

  const finishedList = useMemo(
    () =>
      myInvolved
        .filter((m) => m.status === 'completed' || m.status === 'cancelled')
        .sort((a, b) => {
          const ad = a.finalizedAt?.getTime() ?? new Date(a.dateTime).getTime()
          const bd = b.finalizedAt?.getTime() ?? new Date(b.dateTime).getTime()
          return bd - ad
        }),
    [myInvolved]
  )

  const chatOpportunities = useMemo(() => {
    if (!currentUser) return []
    return matchOpportunities.filter((m) =>
      canUserAccessChat(m, currentUser.id, participatingOpportunityIds)
    )
  }, [matchOpportunities, currentUser, participatingOpportunityIds])

  /** Solo chats donde aún se puede escribir (misma ventana de 48 h que reseñas si está finalizado). */
  const activeChatOpportunities = useMemo(
    () => chatOpportunities.filter((m) => isMatchChatMessagingOpen(m)),
    [chatOpportunities]
  )

  useEffect(() => {
    if (!isSupabaseConfigured() || activeChatOpportunities.length === 0) {
      setLastByOpp(new Map())
      return
    }
    const supabase = createClient()
    const ids = activeChatOpportunities.map((c) => c.id)
    fetchLastMessagesForOpportunities(supabase, ids).then(setLastByOpp)
  }, [activeChatOpportunities])

  useEffect(() => {
    if (!isSupabaseConfigured() || finishedList.length === 0) {
      setRatingByOpp(new Map())
      return
    }
    const supabase = createClient()
    void fetchRatingSummariesForOpportunities(
      supabase,
      finishedList.map((f) => f.id)
    ).then(setRatingByOpp)
  }, [finishedList])

  const getTypeIcon = (type: 'rival' | 'players' | 'open') => {
    switch (type) {
      case 'rival':
        return <Target className="w-4 h-4" />
      case 'players':
        return <Users className="w-4 h-4" />
      case 'open':
        return <Shuffle className="w-4 h-4" />
    }
  }

  const getTypeLabel = (type: 'rival' | 'players' | 'open') => {
    switch (type) {
      case 'rival':
        return 'Rival vs rival'
      case 'players':
        return 'Yo + cinco'
      case 'open':
        return 'Revuelta abierta'
    }
  }

  const getTypeColor = (type: 'rival' | 'players' | 'open') => {
    switch (type) {
      case 'rival':
        return 'bg-red-500/20 text-red-400'
      case 'players':
        return 'bg-primary/20 text-primary'
      case 'open':
        return 'bg-accent/20 text-accent'
    }
  }

  const getTypeHeaderBg = (type: 'rival' | 'players' | 'open') => {
    switch (type) {
      case 'rival':
        return 'bg-red-500/10 border-red-500/30'
      case 'players':
        return 'bg-primary/10 border-primary/30'
      case 'open':
        return 'bg-accent/10 border-accent/30'
    }
  }

  const openChat = (opportunityId: string) => {
    setSelectedChatOpportunityId(opportunityId)
    setCurrentScreen('chat')
  }

  const openDetails = (opportunityId: string) => {
    setSelectedMatchOpportunityId(opportunityId)
    setCurrentScreen('matchDetails')
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="p-4 pb-2">
          <h1 className="text-2xl font-bold text-foreground">Partidos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Próximos partidos, chats del grupo e historial
          </p>
        </div>

        <div className="flex border-b border-border">
          <TabButton
            active={activeTab === 'upcoming'}
            onClick={() => setActiveTab('upcoming')}
            icon={<Clock className="w-4 h-4" />}
            label="Próximos"
            count={upcomingList.length}
          />
          <TabButton
            active={activeTab === 'chats'}
            onClick={() => setActiveTab('chats')}
            icon={<MessageCircle className="w-4 h-4" />}
            label="Chats"
            count={activeChatOpportunities.length}
          />
          <TabButton
            active={activeTab === 'finished'}
            onClick={() => setActiveTab('finished')}
            icon={<History className="w-4 h-4" />}
            label="Finalizados"
            count={finishedList.length}
          />
        </div>
      </header>

      <div className="p-4">
        {activeTab === 'upcoming' && (
          <div className="space-y-4">
            {pendingToResolve.length > 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  Pendientes por cerrar ({pendingToResolve.length})
                </p>
                <p className="text-xs text-muted-foreground">
                  Estos partidos eran de días anteriores. Confirma si se jugaron o
                  suspéndelos con un motivo.
                </p>
                <div className="space-y-2 pt-1">
                  {pendingToResolve.slice(0, 3).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => openDetails(m.id)}
                      className="w-full text-left rounded-lg border border-border bg-card/60 px-3 py-2 hover:border-primary/40 transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground truncate">
                        {m.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(m.dateTime, "EEEE d MMM · HH:mm", { locale: es })}
                        {' · '}
                        {m.venue}
                      </p>
                    </button>
                  ))}
                  {pendingToResolve.length > 3 ? (
                    <p className="text-xs text-muted-foreground">
                      Y {pendingToResolve.length - 3} más…
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {upcomingList.length > 0 ? (
              upcomingList.map((match) => {
                const isCreator =
                  !!currentUser && currentUser.id === match.creatorId
                const canChat =
                  !!currentUser &&
                  canUserAccessChat(
                    match,
                    currentUser.id,
                    participatingOpportunityIds
                  )
                return (
                  <div
                    key={match.id}
                    className="bg-card rounded-xl border border-border overflow-hidden"
                  >
                    <div
                      className={`px-4 py-3 border-b border-border ${getTypeHeaderBg(
                        match.type
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg ${getTypeColor(
                              match.type
                            )}`}
                          >
                            {getTypeIcon(match.type)}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate">
                            {getTypeLabel(match.type)}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {match.level}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={match.creatorPhoto}
                            alt={match.creatorName}
                            className="w-12 h-12 rounded-full object-cover border-2 border-border shrink-0"
                          />
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                              {match.title}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {match.creatorName}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            isCreator
                              ? 'border-primary/50 text-primary'
                              : 'border-border text-muted-foreground'
                          }
                        >
                          {isCreator ? 'Organizas' : 'Participas'}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-primary" />
                          {format(new Date(match.dateTime), "EEEE d MMM", {
                            locale: es,
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4 text-primary" />
                          {format(new Date(match.dateTime), 'HH:mm')}
                        </span>
                        <span className="flex items-center gap-1 min-w-0">
                          <MapPin className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate">{match.venue}</span>
                        </span>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openDetails(match.id)}
                          className="px-3 py-2.5 rounded-lg border border-border text-foreground hover:bg-secondary transition-colors"
                        >
                          Ver detalle
                        </button>
                        {canChat ? (
                          <button
                            type="button"
                            onClick={() => openChat(match.id)}
                            className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                          >
                            <MessageCircle className="w-4 h-4" />
                            Abrir chat del grupo
                          </button>
                        ) : (
                          <p className="text-xs text-muted-foreground w-full text-center py-2">
                            Únete al partido desde Inicio o Explorar para usar el
                            chat
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <EmptyState
                icon={<Calendar className="w-8 h-8" />}
                title="Sin partidos próximos"
                description="Únete a un partido o crea uno desde el botón Crear. Aquí verás solo tus partidos activos."
              />
            )}
          </div>
        )}

        {activeTab === 'chats' && (
          <div className="space-y-2">
            {activeChatOpportunities.length > 0 ? (
              activeChatOpportunities.map((chat) => {
                const last = lastByOpp.get(chat.id)
                const isDone =
                  chat.status === 'completed' || chat.status === 'cancelled'
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => openChat(chat.id)}
                    className="w-full bg-card rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-all text-left"
                  >
                    <div
                      className={`px-4 py-3 border-b border-border ${getTypeHeaderBg(
                        chat.type
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg ${getTypeColor(
                              chat.type
                            )}`}
                          >
                            {getTypeIcon(chat.type)}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate">
                            {getTypeLabel(chat.type)}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {chat.level}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4 flex items-center gap-4">
                      <div className="relative shrink-0">
                        <img
                          src={chat.creatorPhoto}
                          alt={chat.title}
                          className="w-14 h-14 rounded-full object-cover border-2 border-border"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-foreground truncate">
                            {chat.title}
                          </h3>
                          {last && (
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {format(last.createdAt, 'HH:mm')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {last?.content ?? 'Sin mensajes aún — escribe el primero'}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(chat.dateTime), "d MMM HH:mm", {
                              locale: es,
                            })}
                          </p>
                          {isDone && (
                            <Badge variant="secondary" className="text-[10px]">
                              {chat.status === 'completed'
                                ? 'Finalizado'
                                : 'Cancelado'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            ) : (
              <EmptyState
                icon={<MessageCircle className="w-8 h-8" />}
                title={
                  chatOpportunities.length > 0
                    ? 'Sin chats activos'
                    : 'Sin conversaciones'
                }
                description={
                  chatOpportunities.length > 0
                    ? 'Los partidos finalizados dejan el chat abierto 48 h (como las reseñas). Después, el historial sigue en Finalizados → Ver chat.'
                    : 'Cuando entres a un partido (como organizador o jugador), aparecerá aquí el chat para coordinar con el grupo.'
                }
              />
            )}
          </div>
        )}

        {activeTab === 'finished' && (
          <div className="space-y-4">
            {finishedList.length > 0 ? (
              finishedList.map((match) => {
                const ratings = ratingByOpp.get(match.id)
                return (
                  <div
                    key={match.id}
                    className="bg-card rounded-xl border border-border overflow-hidden"
                  >
                    <div
                      className={`px-4 py-3 border-b border-border ${getTypeHeaderBg(
                        match.type
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg ${getTypeColor(
                              match.type
                            )}`}
                          >
                            {getTypeIcon(match.type)}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate">
                            {getTypeLabel(match.type)}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {match.level}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-foreground">
                            {match.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(match.dateTime), "d MMM yyyy", {
                              locale: es,
                            })}
                            {match.finalizedAt && (
                              <span className="text-muted-foreground">
                                {' '}
                                · Cerrado{' '}
                                {format(new Date(match.finalizedAt), 'd MMM', {
                                  locale: es,
                                })}
                              </span>
                            )}
                          </p>
                        </div>
                        <Badge
                          variant={
                            match.status === 'cancelled'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {match.status === 'cancelled'
                            ? 'Cancelado'
                            : 'Finalizado'}
                        </Badge>
                      </div>

                  {match.status === 'completed' && (
                    <div className="space-y-1.5">
                      <p className="text-sm flex items-center gap-2 text-foreground">
                        <Trophy className="w-4 h-4 text-accent shrink-0" />
                        {formatCompletedOutcome(match)}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {ratings?.avgOverall != null
                            ? `⭐ ${ratings.avgOverall}`
                            : '⭐ —'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {ratings?.count ?? 0}{' '}
                          {(ratings?.count ?? 0) === 1
                            ? 'reseña'
                            : 'reseñas'}
                        </span>
                      </div>
                    </div>
                  )}
                  {match.status === 'cancelled' && match.suspendedReason && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                      <p className="text-xs uppercase tracking-wide text-red-300 mb-1">
                        Motivo de suspensión
                      </p>
                      <p className="text-sm text-red-100">{match.suspendedReason}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => openDetails(match.id)}
                    className="w-full py-2 rounded-lg border border-border text-foreground font-medium hover:bg-secondary transition-colors"
                  >
                    Ver detalle
                  </button>

                  {currentUser &&
                    canUserAccessChat(
                      match,
                      currentUser.id,
                      participatingOpportunityIds
                    ) && (
                      <button
                        type="button"
                        onClick={() => openChat(match.id)}
                        className="w-full py-2 rounded-lg border border-border text-foreground font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                      >
                        <MessageCircle className="w-4 h-4" />
                        {isMatchChatMessagingOpen(match)
                          ? 'Ver chat / calificaciones'
                          : 'Ver historial del chat'}
                      </button>
                    )}
                  </div>
                  </div>
                )
              })
            ) : (
              <EmptyState
                icon={<CheckCircle className="w-8 h-8" />}
                title="Sin partidos finalizados"
                description="Cuando el organizador cierre un partido, aparecerá aquí con el resultado."
              />
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-3 px-1 text-center font-medium transition-colors relative min-w-0 ${
        active ? 'text-primary' : 'text-muted-foreground'
      }`}
    >
      <span className="flex flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-1.5">
        {icon}
        <span className="text-xs sm:text-sm truncate max-w-full">{label}</span>
        {count > 0 && (
          <Badge className="bg-primary/20 text-primary border-0 text-[10px] px-1.5 py-0 h-5">
            {count}
          </Badge>
        )}
      </span>
      {active && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
      )}
    </button>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4 text-muted-foreground">
        {icon}
      </div>
      <h3 className="font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 px-4">{description}</p>
    </div>
  )
}
