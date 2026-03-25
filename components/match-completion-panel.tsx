'use client'

import { useState } from 'react'
import type { MatchOpportunity, RivalResult } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  getRatingDeadline,
  isRatingWindowOpen,
  type MatchOpportunityRatingRow,
} from '@/lib/supabase/rating-queries'
import { Trophy, ClipboardCheck, Star, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

/** Motivos predefinidos al suspender (organizador). */
const SUSPEND_PRESET_REASONS = [
  'Mal tiempo o lluvia',
  'Cancha no disponible o cancelada',
  'No se completó el grupo de jugadores',
  'Motivos de salud o lesión',
  'Conflicto de horario o agenda',
] as const
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

function StarRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm text-foreground">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`p-1.5 rounded-lg border transition-colors ${
              value >= n
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-secondary border-border text-muted-foreground hover:border-primary/50'
            } disabled:opacity-50`}
            aria-label={`${n} estrellas`}
          >
            <Star
              className={`w-5 h-5 ${value >= n ? 'fill-primary' : ''}`}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

type Props = {
  opportunity: MatchOpportunity
  currentUserId: string
  isConfirmedParticipant: boolean
  myRating: MatchOpportunityRatingRow | null
  loadingRating: boolean
  onReloadMyRating: () => void
  finalizeMatchOpportunity: (
    opportunityId: string,
    outcome:
      | { kind: 'rival'; rivalResult: RivalResult }
      | { kind: 'casual' }
  ) => Promise<void>
  suspendMatchOpportunity: (
    opportunityId: string,
    reason: string
  ) => Promise<void>
  submitMatchRating: (
    opportunityId: string,
    payload: {
      organizerRating: number | null
      matchRating: number
      levelRating: number
      comment?: string
    }
  ) => Promise<void>
}

export function MatchCompletionPanel({
  opportunity,
  currentUserId,
  isConfirmedParticipant,
  myRating,
  loadingRating,
  onReloadMyRating,
  finalizeMatchOpportunity,
  suspendMatchOpportunity,
  submitMatchRating,
}: Props) {
  const isCreator = opportunity.creatorId === currentUserId
  const completed = opportunity.status === 'completed'
  const finalizedAt = opportunity.finalizedAt
  const windowOpen =
    completed && finalizedAt && isRatingWindowOpen(finalizedAt)
  const canRate =
    completed &&
    windowOpen &&
    (isCreator || isConfirmedParticipant) &&
    !myRating &&
    !loadingRating

  const [finalizing, setFinalizing] = useState(false)
  const [rivalPick, setRivalPick] = useState<RivalResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const [suspendExpanded, setSuspendExpanded] = useState(false)
  /** Índice 0–4 = preset; 'other' = texto libre. */
  const [suspendChoice, setSuspendChoice] = useState<
    number | 'other' | null
  >(null)
  const [suspendOtherText, setSuspendOtherText] = useState('')

  const [orgStars, setOrgStars] = useState(0)
  const [matchStars, setMatchStars] = useState(0)
  const [levelStars, setLevelStars] = useState(0)
  const [comment, setComment] = useState('')

  const showFinalize =
    isCreator && !completed && opportunity.status !== 'cancelled'

  const resolvedSuspendReason = (): string | null => {
    if (suspendChoice === null) return null
    if (typeof suspendChoice === 'number') {
      return SUSPEND_PRESET_REASONS[suspendChoice] ?? null
    }
    const t = suspendOtherText.trim()
    if (t.length < 5) return null
    return `Otro: ${t}`
  }

  const handleSuspend = async () => {
    const reason = resolvedSuspendReason()
    if (!reason) return
    setSuspending(true)
    try {
      await suspendMatchOpportunity(opportunity.id, reason)
      setSuspendExpanded(false)
      setSuspendChoice(null)
      setSuspendOtherText('')
    } finally {
      setSuspending(false)
    }
  }

  const canConfirmSuspend =
    resolvedSuspendReason() !== null && !suspending

  const outcomeLine = () => {
    if (!completed || !finalizedAt) return null
    if (opportunity.type === 'rival' && opportunity.rivalResult) {
      const map: Record<RivalResult, string> = {
        creator_team: 'Ganó el equipo del organizador',
        rival_team: 'Ganó el equipo rival',
        draw: 'Empate',
      }
      return (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Trophy className="w-4 h-4 text-accent" />
          {map[opportunity.rivalResult]}
        </p>
      )
    }
    if (opportunity.casualCompleted) {
      return (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-primary" />
          Partido jugado (sin marcador de equipos)
        </p>
      )
    }
    return null
  }

  const handleFinalize = async () => {
    if (opportunity.type === 'rival') {
      if (!rivalPick) return
      setFinalizing(true)
      try {
        await finalizeMatchOpportunity(opportunity.id, {
          kind: 'rival',
          rivalResult: rivalPick,
        })
      } finally {
        setFinalizing(false)
      }
      return
    }
    setFinalizing(true)
    try {
      await finalizeMatchOpportunity(opportunity.id, { kind: 'casual' })
    } finally {
      setFinalizing(false)
    }
  }

  const handleSubmitRating = async () => {
    if (!matchStars || !levelStars) return
    if (!isCreator && !orgStars) return
    setSubmitting(true)
    try {
      await submitMatchRating(opportunity.id, {
        organizerRating: isCreator ? null : orgStars,
        matchRating: matchStars,
        levelRating: levelStars,
        comment: comment.trim() || undefined,
      })
      onReloadMyRating()
      setComment('')
    } finally {
      setSubmitting(false)
    }
  }

  if (!showFinalize && !completed) return null

  return (
    <div className="border-b border-border bg-secondary/40 px-4 py-3 space-y-4">
      {showFinalize && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Finalizar partido
          </p>
          <p className="text-xs text-muted-foreground">
            Al cerrar, se registrará el resultado y se abrirá la ventana de 48
            h para que los jugadores califiquen.
          </p>
          {opportunity.type === 'rival' && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Resultado</Label>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ['creator_team', 'Ganó el equipo del organizador'],
                    ['rival_team', 'Ganó el equipo rival'],
                    ['draw', 'Empate'],
                  ] as const
                ).map(([val, label]) => (
                  <label
                    key={val}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                      rivalPick === val
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rival-result"
                      className="accent-primary"
                      checked={rivalPick === val}
                      onChange={() => setRivalPick(val)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Button
            className="w-full"
            disabled={
              finalizing ||
              (opportunity.type === 'rival' && !rivalPick)
            }
            onClick={() => void handleFinalize()}
          >
            {finalizing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando…
              </>
            ) : (
              'Marcar partido como finalizado'
            )}
          </Button>

          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-sm font-medium text-foreground">Suspender partido</p>
            <p className="text-xs text-muted-foreground">
              Si no se jugará, elige un motivo y confirma la suspensión.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="w-full justify-between h-11"
              disabled={suspending}
              onClick={() => {
                setSuspendExpanded((v) => !v)
                if (suspendExpanded) {
                  setSuspendChoice(null)
                  setSuspendOtherText('')
                }
              }}
            >
              <span>Suspender partido</span>
              {suspendExpanded ? (
                <ChevronUp className="w-4 h-4 shrink-0 opacity-90" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 opacity-90" />
              )}
            </Button>

            {suspendExpanded && (
              <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
                <p className="text-xs font-medium text-foreground">
                  Motivo de la suspensión
                </p>
                <div className="flex flex-col gap-2">
                  {SUSPEND_PRESET_REASONS.map((label, i) => (
                    <label
                      key={label}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                        suspendChoice === i
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="suspend-reason"
                        className="accent-primary shrink-0"
                        checked={suspendChoice === i}
                        onChange={() => {
                          setSuspendChoice(i)
                          setSuspendOtherText('')
                        }}
                        disabled={suspending}
                      />
                      <span className="text-left leading-snug">{label}</span>
                    </label>
                  ))}
                  <label
                    className={`flex flex-col gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                      suspendChoice === 'other'
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="suspend-reason"
                        className="accent-primary shrink-0"
                        checked={suspendChoice === 'other'}
                        onChange={() => setSuspendChoice('other')}
                        disabled={suspending}
                      />
                      <span className="font-medium">Otro</span>
                    </div>
                    {suspendChoice === 'other' && (
                      <Textarea
                        value={suspendOtherText}
                        onChange={(e) => setSuspendOtherText(e.target.value)}
                        placeholder="Describe el motivo…"
                        className="bg-background border-border min-h-[72px] resize-none text-sm ml-6"
                        maxLength={1000}
                        disabled={suspending}
                      />
                    )}
                  </label>
                </div>
                {suspendChoice === 'other' && (
                  <p className="text-[11px] text-muted-foreground">
                    Mínimo 5 caracteres.
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={suspending}
                    onClick={() => {
                      setSuspendExpanded(false)
                      setSuspendChoice(null)
                      setSuspendOtherText('')
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10 sm:min-w-[180px]"
                    disabled={!canConfirmSuspend}
                    onClick={() => void handleSuspend()}
                  >
                    {suspending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Suspendiendo…
                      </>
                    ) : (
                      'Confirmar suspensión'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {completed && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-primary uppercase tracking-wide">
            Partido finalizado
          </p>
          {outcomeLine()}
          {finalizedAt && windowOpen && (
            <p className="text-xs text-muted-foreground">
              Plazo de calificación: termina{' '}
              {formatDistanceToNow(getRatingDeadline(finalizedAt), {
                locale: es,
                addSuffix: true,
              })}
            </p>
          )}
        </div>
      )}

      {loadingRating && (
        <p className="text-xs text-muted-foreground">Cargando tu calificación…</p>
      )}

      {myRating && (
        <p className="text-sm text-primary">
          Ya enviaste tu calificación para este partido. ¡Gracias!
        </p>
      )}

      {canRate && (
        <div className="space-y-4 pt-1">
          <p className="text-sm font-medium text-foreground">
            Tu calificación (una sola vez)
          </p>
          {!isCreator && (
            <StarRow
              label="Gestión del organizador"
              value={orgStars}
              onChange={setOrgStars}
              disabled={submitting}
            />
          )}
          <StarRow
            label="El partido en conjunto (ambiente, fluidez)"
            value={matchStars}
            onChange={setMatchStars}
            disabled={submitting}
          />
          <StarRow
            label="Nivel del partido vs lo anunciado"
            value={levelStars}
            onChange={setLevelStars}
            disabled={submitting}
          />
          <div className="space-y-2">
            <Label className="text-sm">Comentario (opcional)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Breve opinión sobre el partido…"
              className="bg-card border-border min-h-[72px] resize-none text-sm"
              disabled={submitting}
              maxLength={2000}
            />
          </div>
          <Button
            className="w-full"
            disabled={
              submitting ||
              !matchStars ||
              !levelStars ||
              (!isCreator && !orgStars)
            }
            onClick={() => void handleSubmitRating()}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando…
              </>
            ) : (
              'Enviar calificación'
            )}
          </Button>
        </div>
      )}

      {completed &&
        finalizedAt &&
        !windowOpen &&
        !myRating &&
        (isCreator || isConfirmedParticipant) &&
        !loadingRating && (
          <p className="text-xs text-muted-foreground">
            El plazo de 48 h para calificar ya cerró.
          </p>
        )}
    </div>
  )
}
