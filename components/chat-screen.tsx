'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  fetchMessagesForOpportunity,
  fetchParticipantsForOpportunity,
  type ChatMessageRow,
  type OpportunityParticipantRow,
} from '@/lib/supabase/message-queries'
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
import { toast } from 'sonner'

type UiMessage = ChatMessageRow & { isMe: boolean }

export function ChatScreen() {
  const {
    setCurrentScreen,
    currentUser,
    matchOpportunities,
    selectedChatOpportunityId,
    setSelectedChatOpportunityId,
    setSelectedMatchOpportunityId,
    participatingOpportunityIds,
    finalizeMatchOpportunity,
    suspendMatchOpportunity,
    submitMatchRating,
    randomizeRevueltaTeams,
    rivalChallenges,
    submitRivalCaptainVote,
    finalizeRivalOrganizerOverride,
    openPublicProfile,
    profilesRealtimeGeneration,
    avatarDisplayUrl,
  } = useApp()

  const opportunity = selectedChatOpportunityId
    ? matchOpportunities.find((m) => m.id === selectedChatOpportunityId)
    : undefined

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

  const chatMessagingOpen = opportunity
    ? isMatchChatMessagingOpen(opportunity)
    : false

  const [messages, setMessages] = useState<UiMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [myRating, setMyRating] = useState<MatchOpportunityRatingRow | null>(
    null
  )
  const [loadingRating, setLoadingRating] = useState(false)
  const [participants, setParticipants] = useState<OpportunityParticipantRow[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadMyRating = useCallback(async () => {
    if (!selectedChatOpportunityId || !currentUser || !isSupabaseConfigured()) {
      setMyRating(null)
      return
    }
    setLoadingRating(true)
    try {
      const supabase = createClient()
      const row = await fetchMyRatingForOpportunity(
        supabase,
        selectedChatOpportunityId,
        currentUser.id
      )
      setMyRating(row)
    } finally {
      setLoadingRating(false)
    }
  }, [selectedChatOpportunityId, currentUser])

  const loadParticipants = useCallback(async () => {
    if (
      !selectedChatOpportunityId ||
      !currentUser ||
      !isSupabaseConfigured() ||
      !canAccessThread
    ) {
      setParticipants([])
      return
    }
    setLoadingParticipants(true)
    try {
      const supabase = createClient()
      const rows = await fetchParticipantsForOpportunity(
        supabase,
        selectedChatOpportunityId
      )
      setParticipants(rows)
    } finally {
      setLoadingParticipants(false)
    }
  }, [selectedChatOpportunityId, currentUser, canAccessThread, profilesRealtimeGeneration])

  const loadMessages = useCallback(async () => {
    if (!selectedChatOpportunityId || !currentUser || !isSupabaseConfigured()) {
      setMessages([])
      setLoading(false)
      return
    }
    if (!canAccessThread) {
      setMessages([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const rows = await fetchMessagesForOpportunity(
        supabase,
        selectedChatOpportunityId
      )
      setMessages(
        rows.map((m) => ({
          ...m,
          isMe: m.senderId === currentUser.id,
        }))
      )
    } catch {
      toast.error('No se pudieron cargar los mensajes')
    } finally {
      setLoading(false)
    }
  }, [selectedChatOpportunityId, currentUser, canAccessThread, profilesRealtimeGeneration])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    void loadMyRating()
  }, [loadMyRating])

  useEffect(() => {
    void loadParticipants()
  }, [loadParticipants])

  useEffect(() => {
    if (
      !selectedChatOpportunityId ||
      !isSupabaseConfigured() ||
      !canAccessThread
    ) {
      return
    }
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${selectedChatOpportunityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `opportunity_id=eq.${selectedChatOpportunityId}`,
        },
        () => {
          loadMessages()
          loadParticipants()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedChatOpportunityId, loadMessages, loadParticipants, canAccessThread])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
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

    const supabase = createClient()
    const { error } = await supabase.from('messages').insert({
      opportunity_id: selectedChatOpportunityId,
      sender_id: currentUser.id,
      content: newMessage.trim(),
    })

    if (error) {
      toast.error(error.message)
      return
    }

    setNewMessage('')
    loadMessages()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const goBack = () => {
    setSelectedChatOpportunityId(null)
    setCurrentScreen('matches')
  }

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
            onClick={() => setShowInfo(!showInfo)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Info className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedMatchOpportunityId(opportunity.id)
              setCurrentScreen('matchDetails')
            }}
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
                    <div key={p.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => openPublicProfile(p.id)}
                          className="flex items-center gap-2 min-w-0 text-left"
                        >
                          <img
                            src={avatarDisplayUrl(p.photo, p.id)}
                            alt={p.name}
                            className="w-7 h-7 rounded-full object-cover border border-border"
                          />
                          <span className="text-sm text-foreground truncate hover:underline">
                            {p.name}
                            {(opportunity?.type === 'open' ||
                              opportunity?.type === 'players') &&
                            p.isGoalkeeper
                              ? ' 🧤'
                              : ''}
                          </span>
                        </button>
                      </div>
                      <span className="text-[11px] text-muted-foreground capitalize">
                        {p.status === 'creator' ? 'Organizador' : p.status}
                      </span>
                    </div>
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
          onReloadMyRating={() => void loadMyRating()}
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
              <div
                key={message.id}
                className={`flex ${message.isMe ? 'justify-end' : 'justify-start'}`}
              >
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
            disabled={!newMessage.trim() || !chatMessagingOpen}
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
