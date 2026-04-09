'use client'

import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useAppAuth, useAppMatch, useAppUI } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import {
  fetchMessagesForOpportunity,
  fetchParticipantsForOpportunity,
  insertMatchChatMessage,
  type ChatMessageRow,
  type OpportunityParticipantRow,
} from '@/lib/supabase/message-queries'
import { DEFAULT_AVATAR } from '@/lib/supabase/mappers'
import {
  fetchMyRatingForOpportunity,
  getRatingDeadline,
  isMatchChatMessagingOpen,
  type MatchOpportunityRatingRow,
} from '@/lib/supabase/rating-queries'
import { MatchCompletionPanel } from '@/components/match-completion-panel'
import { RevueltaInviteActions } from '@/components/revuelta-invite-actions'
import { RevueltaTeamsPanel } from '@/components/revuelta-teams-panel'
import { ArrowLeft, Send, Calendar, MapPin, Info } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { prefetchPublicPlayerProfile } from '@/lib/public-player-prefetch'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'
import { updateLastSeen } from '@/lib/services/presence.service'
import { useMatchOpportunityParticipantsRealtime } from '@/lib/hooks/use-match-opportunity-participants-realtime'
import { toast } from 'sonner'

type UiMessage = ChatMessageRow & { isMe: boolean }

export function ChatScreen() {
  const {
    setCurrentScreen,
    selectedChatOpportunityId,
    setSelectedChatOpportunityId,
    setSelectedMatchOpportunityId,
    openPublicProfile,
  } = useAppUI()
  const { currentUser, avatarDisplayUrl } = useAppAuth()
  const {
    matchOpportunities,
    participatingOpportunityIds,
    finalizeMatchOpportunity,
    suspendMatchOpportunity,
    submitMatchRating,
    randomizeRevueltaTeams,
    rivalChallenges,
    submitRivalCaptainVote,
    finalizeRivalOrganizerOverride,
  } = useAppMatch()

  const opportunity = useMemo(
    () =>
      selectedChatOpportunityId
        ? matchOpportunities.find((m) => m.id === selectedChatOpportunityId)
        : undefined,
    [matchOpportunities, selectedChatOpportunityId]
  )

  const canAccessThread = useMemo(() => {
    if (!opportunity || !currentUser) return false
    return (
      opportunity.creatorId === currentUser.id ||
      participatingOpportunityIds.includes(opportunity.id)
    )
  }, [opportunity, currentUser, participatingOpportunityIds])

  const rivalChallengeForOpp = useMemo(
    () =>
      opportunity
        ? rivalChallenges.find((c) => c.opportunityId === opportunity.id) ?? null
        : null,
    [rivalChallenges, opportunity?.id]
  )

  const chatMessagingOpen = useMemo(
    () => (opportunity ? isMatchChatMessagingOpen(opportunity) : false),
    [opportunity]
  )

  const queryClient = useQueryClient()
  const oppId = selectedChatOpportunityId ?? ''
  const chatUserId = currentUser?.id ?? ''

  const messagesQuery = useQuery({
    queryKey: queryKeys.chat.messages(oppId, chatUserId),
    enabled: Boolean(
      oppId && canAccessThread && sessionQueryEnabled(chatUserId)
    ),
    queryFn: async () => {
      const uid = chatUserId
      try {
        const supabase = getBrowserSupabase()
        if (!supabase) return []
        const rows = await fetchMessagesForOpportunity(supabase, oppId)
        return rows.map((m) => ({
          ...m,
          isMe: m.senderId === uid,
        })) as UiMessage[]
      } catch {
        toast.error('No se pudieron cargar los mensajes')
        return []
      }
    },
  })
  const messages = messagesQuery.data ?? []
  const loading = messagesQuery.isFetching && messages.length === 0

  const participantsQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.participants(oppId),
    enabled: Boolean(
      oppId && canAccessThread && sessionQueryEnabled(chatUserId)
    ),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = getBrowserSupabase()
      if (!supabase) return []
      return fetchParticipantsForOpportunity(supabase, oppId)
    },
  })
  const participants: OpportunityParticipantRow[] = participantsQuery.data ?? []
  const loadingParticipants = participantsQuery.isFetching

  useMatchOpportunityParticipantsRealtime(
    selectedChatOpportunityId,
    opportunity?.creatorId,
    Boolean(
      selectedChatOpportunityId &&
        canAccessThread &&
        sessionQueryEnabled(chatUserId) &&
        isSupabaseConfigured() &&
        getBrowserSupabase()
    )
  )

  const myRatingQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.myRating(oppId, chatUserId),
    enabled: Boolean(oppId && sessionQueryEnabled(chatUserId)),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = getBrowserSupabase()
      if (!supabase) return null
      return fetchMyRatingForOpportunity(supabase, oppId, chatUserId)
    },
  })
  const myRating: MatchOpportunityRatingRow | null = myRatingQuery.data ?? null
  const loadingRating = myRatingQuery.isFetching

  const [newMessage, setNewMessage] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedChatOpportunityId || !isSupabaseConfigured() || !canAccessThread) {
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const oid = selectedChatOpportunityId
    const uid = currentUser?.id
    if (!uid) return
    const channel = supabase
      .channel(`messages:${oid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `opportunity_id=eq.${oid}`,
        },
        (payload) => {
          const row = payload.new as
            | {
                id?: string
                sender_id?: string
                content?: string
                created_at?: string
              }
            | null
          if (!row?.id || !row.sender_id || typeof row.content !== 'string') {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.chat.messages(oid, uid),
            })
            return
          }
          const participantsCached =
            queryClient.getQueryData<OpportunityParticipantRow[]>(
              queryKeys.matchOpportunity.participants(oid)
            ) ?? []
          const sender = participantsCached.find((p) => p.id === row.sender_id)
          const newMessage: UiMessage = {
            id: row.id,
            senderId: row.sender_id,
            content: row.content,
            createdAt: row.created_at ? new Date(row.created_at) : new Date(),
            senderName: sender?.name ?? 'Jugador',
            senderPhoto: sender?.photo ?? DEFAULT_AVATAR,
            isMe: row.sender_id === uid,
          }
          queryClient.setQueryData<UiMessage[]>(
            queryKeys.chat.messages(oid, uid),
            (prev) => {
              if (!prev?.length) return [newMessage]
              if (prev.some((m) => m.id === newMessage.id)) return prev
              return [...prev, newMessage]
            }
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedChatOpportunityId, canAccessThread, queryClient, currentUser?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedChatOpportunityId || !currentUser) {
        throw new Error('Sesión no disponible')
      }
      const supabase = getBrowserSupabase()
      if (!supabase) throw new Error('Cliente no disponible')
      const { error } = await insertMatchChatMessage(supabase, {
        opportunityId: selectedChatOpportunityId,
        senderId: currentUser.id,
        content,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setNewMessage('')
      const supabase = getBrowserSupabase()
      if (supabase && currentUser) {
        void updateLastSeen(supabase, currentUser.id, { force: true })
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar el mensaje')
    },
  })

  const handleSend = useCallback(async () => {
    if (
      !newMessage.trim() ||
      !currentUser ||
      !selectedChatOpportunityId ||
      !isSupabaseConfigured()
    ) {
      return
    }
    if (!canAccessThread) {
      toast.error(
        'No tenés acceso al chat de este partido. Solo participantes o el organizador pueden escribir.'
      )
      return
    }
    if (!chatMessagingOpen) {
      toast.info('Este chat ya está cerrado; no se pueden enviar mensajes.')
      return
    }
    if (currentUser.modBannedAt || (currentUser.modSuspendedUntil && currentUser.modSuspendedUntil > new Date())) {
      toast.error('Tu cuenta está restringida y solo puedes visualizar contenido por ahora.')
      return
    }

    try {
      await sendMessageMutation.mutateAsync(newMessage.trim())
    } catch {
      // toast en onError
    }
  }, [
    newMessage,
    currentUser,
    selectedChatOpportunityId,
    canAccessThread,
    chatMessagingOpen,
    sendMessageMutation,
  ])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  const goBack = useCallback(() => {
    setSelectedChatOpportunityId(null)
    setCurrentScreen('matches')
  }, [setCurrentScreen, setSelectedChatOpportunityId])

  const prefetchParticipantProfile = useCallback(
    (userId: string) => {
      void prefetchPublicPlayerProfile(queryClient, userId)
    },
    [queryClient]
  )

  const openParticipantProfile = useCallback(
    (userId: string) => {
      void prefetchPublicPlayerProfile(queryClient, userId)
      openPublicProfile(userId)
    },
    [openPublicProfile, queryClient]
  )

  const openMatchDetails = useCallback(() => {
    if (!opportunity) return
    setSelectedMatchOpportunityId(opportunity.id)
    setCurrentScreen('matchDetails')
  }, [opportunity, setCurrentScreen, setSelectedMatchOpportunityId])

  const toggleInfo = useCallback(() => {
    setShowInfo((prev) => !prev)
  }, [])

  if (!currentUser) {
    return null
  }

  if (!selectedChatOpportunityId || !opportunity) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <p className="text-muted-foreground text-center mb-4">
          No hay partido seleccionado.
        </p>
        <Button onClick={goBack}>Volver a partidos</Button>
      </div>
    )
  }

  if (!canAccessThread) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-muted-foreground text-center text-sm max-w-sm">
          No tenés acceso al chat de este partido. Solo el organizador y los
          jugadores inscritos pueden usarlo.
        </p>
        <Button onClick={goBack}>Volver a partidos</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative">
              <img
                src={avatarDisplayUrl(
                  opportunity.creatorPhoto,
                  opportunity.creatorId
                )}
                alt={opportunity.title}
                className="w-10 h-10 rounded-full object-cover border-2 border-primary"
              />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-foreground truncate">
                {opportunity.title}
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                {opportunity.venue} ·{' '}
                {formatMatchInTimezone(opportunity.dateTime, 'd MMM HH:mm')}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleInfo}
            className="text-muted-foreground hover:text-foreground"
          >
            <Info className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={openMatchDetails}
            className="text-primary"
          >
            Ver detalle
          </Button>
        </div>

        {showInfo && (
          <div className="px-4 pb-4 space-y-3 border-t border-border pt-3 bg-secondary/50">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-foreground">
                {formatMatchInTimezone(
                  opportunity.dateTime,
                  "EEEE d 'de' MMMM, HH:mm"
                )}{' '}
                hrs
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-primary" />
              <span className="text-foreground">{opportunity.venue}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Organiza: {opportunity.creatorName}
            </p>
            {opportunity.type === 'open' &&
              currentUser &&
              (opportunity.creatorId === currentUser.id ||
                participatingOpportunityIds.includes(opportunity.id)) &&
              (opportunity.status === 'pending' ||
                opportunity.status === 'confirmed') && (
                <div className="rounded-lg border border-border bg-card/60 p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">
                    Invitar más jugadores
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Cualquier participante puede compartir el enlace.
                  </p>
                  <RevueltaInviteActions opportunity={opportunity} />
                </div>
              )}
            {opportunity.type === 'open' && currentUser && (
              <RevueltaTeamsPanel
                opportunity={opportunity}
                participants={participants}
                isOrganizer={opportunity.creatorId === currentUser.id}
                randomizeRevueltaTeams={randomizeRevueltaTeams}
                compact
              />
            )}
            {opportunity.status === 'cancelled' && opportunity.suspendedReason && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                <p className="text-xs uppercase tracking-wide text-red-300 mb-1">
                  Partido suspendido
                </p>
                <p className="text-sm text-red-100">{opportunity.suspendedReason}</p>
              </div>
            )}
            <div className="pt-2 border-t border-border/60">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Participantes
              </p>
              {loadingParticipants ? (
                <p className="text-xs text-muted-foreground">Cargando participantes...</p>
              ) : participants.length > 0 ? (
                <div className="space-y-2">
                  {participants.map((p) => (
                    <ParticipantRow
                      key={p.id}
                      participant={p}
                      opportunityType={opportunity.type}
                      avatarDisplayUrl={avatarDisplayUrl}
                      onPrefetchProfile={prefetchParticipantProfile}
                      onOpenProfile={openParticipantProfile}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sin participantes aún.</p>
              )}
            </div>
          </div>
        )}
      </header>

      {opportunity && currentUser && (
        <MatchCompletionPanel
          opportunity={opportunity}
          rivalChallenge={rivalChallengeForOpp}
          currentUserId={currentUser.id}
          isConfirmedParticipant={participatingOpportunityIds.includes(
            opportunity.id
          )}
          myRating={myRating}
          loadingRating={loadingRating}
          onReloadMyRating={() => {
            if (!opportunity || !currentUser) return
            void queryClient.invalidateQueries({
              queryKey: queryKeys.matchOpportunity.myRating(
                opportunity.id,
                currentUser.id
              ),
            })
          }}
          finalizeMatchOpportunity={finalizeMatchOpportunity}
          submitRivalCaptainVote={submitRivalCaptainVote}
          finalizeRivalOrganizerOverride={finalizeRivalOrganizerOverride}
          suspendMatchOpportunity={suspendMatchOpportunity}
          submitMatchRating={submitMatchRating}
        />
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && messages.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">
            Cargando mensajes…
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4 py-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">Hoy</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                avatarDisplayUrl={avatarDisplayUrl}
              />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="sticky bottom-0 bg-background border-t border-border p-4 space-y-3">
        {!chatMessagingOpen && opportunity && (
          <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
            {opportunity.status === 'cancelled' ? (
              <span>Este partido fue cancelado; el chat no admite nuevos mensajes.</span>
            ) : opportunity.status === 'completed' && opportunity.finalizedAt ? (
              <span>
                Chat cerrado: pasaron las 48 h tras finalizar el partido (la misma
                ventana que las reseñas). Puedes leer el historial arriba.
              </span>
            ) : (
              <span>No se pueden enviar mensajes en este chat.</span>
            )}
          </div>
        )}
        {chatMessagingOpen &&
          opportunity?.status === 'completed' &&
          opportunity.finalizedAt && (
            <p className="text-[11px] text-muted-foreground text-center">
              El chat se cierra{' '}
              {formatDistanceToNow(getRatingDeadline(opportunity.finalizedAt), {
                locale: es,
                addSuffix: true,
              })}
            </p>
          )}
        <div className="flex items-center gap-2">
          <Input
            placeholder={
              chatMessagingOpen
                ? 'Escribe un mensaje...'
                : 'Chat cerrado — solo lectura'
            }
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!chatMessagingOpen}
            className="flex-1 h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground rounded-full px-4 disabled:opacity-60"
          />
          <Button
            onClick={() => void handleSend()}
            disabled={
              !newMessage.trim() || !chatMessagingOpen || sendMessageMutation.isPending
            }
            size="icon"
            className="w-12 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

const ParticipantRow = memo(function ParticipantRow({
  participant,
  opportunityType,
  avatarDisplayUrl,
  onPrefetchProfile,
  onOpenProfile,
}: {
  participant: OpportunityParticipantRow
  opportunityType: 'rival' | 'players' | 'open'
  avatarDisplayUrl: (photo?: string, userId?: string) => string
  onPrefetchProfile?: (userId: string) => void
  onOpenProfile: (userId: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onMouseEnter={() => {
            onPrefetchProfile?.(participant.id)
          }}
          onFocus={() => {
            onPrefetchProfile?.(participant.id)
          }}
          onClick={() => onOpenProfile(participant.id)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <img
            src={avatarDisplayUrl(participant.photo, participant.id)}
            alt={participant.name}
            className="w-7 h-7 rounded-full object-cover border border-border"
          />
          <span className="text-sm text-foreground truncate hover:underline">
            {participant.name}
            {(opportunityType === 'open' || opportunityType === 'players') &&
            participant.isGoalkeeper
              ? ' 🧤'
              : ''}
          </span>
        </button>
      </div>
      <span className="text-[11px] text-muted-foreground capitalize">
        {participant.status === 'creator' ? 'Organizador' : participant.status}
      </span>
    </div>
  )
})

const MessageRow = memo(function MessageRow({
  message,
  avatarDisplayUrl,
}: {
  message: UiMessage
  avatarDisplayUrl: (photo?: string, userId?: string) => string
}) {
  return (
    <div className={`flex ${message.isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex items-end gap-2 max-w-[80%] ${message.isMe ? 'flex-row-reverse' : ''}`}
      >
        {!message.isMe && (
          <img
            src={avatarDisplayUrl(
              message.senderPhoto,
              message.senderId
            )}
            alt=""
            className="w-8 h-8 rounded-full object-cover border border-border"
          />
        )}
        <div
          className={`px-4 py-2.5 rounded-2xl ${
            message.isMe
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-secondary text-foreground rounded-bl-sm'
          }`}
        >
          {!message.isMe && (
            <p className="text-[10px] text-muted-foreground mb-0.5">
              {message.senderName}
            </p>
          )}
          <p className="text-sm">{message.content}</p>
          <p
            className={`text-[10px] mt-1 ${
              message.isMe
                ? 'text-primary-foreground/70'
                : 'text-muted-foreground'
            }`}
          >
            {format(new Date(message.createdAt), 'HH:mm')}
          </p>
        </div>
      </div>
    </div>
  )
})
