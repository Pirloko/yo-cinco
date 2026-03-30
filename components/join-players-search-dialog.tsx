'use client'

import { useEffect, useState } from 'react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import type { MatchOpportunity } from '@/lib/types'
import { playersJoinRules } from '@/lib/players-seek-profile'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { JoinPayOrganizerNotice } from '@/components/match-court-pricing'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  opportunity: MatchOpportunity | null
  onJoin: (isGoalkeeper: boolean) => Promise<void>
}

export function JoinPlayersSearchDialog({
  open,
  onOpenChange,
  opportunity,
  onJoin,
}: Props) {
  const [gkCount, setGkCount] = useState(0)
  const [fieldCount, setFieldCount] = useState(0)
  const [joined, setJoined] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !opportunity || !isSupabaseConfigured()) {
      setGkCount(0)
      setFieldCount(0)
      setJoined(0)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const sb = createClient()
        const { data, error } = await sb
          .from('match_opportunity_participants')
          .select('is_goalkeeper, status')
          .eq('opportunity_id', opportunity.id)
        if (error || cancelled) return
        let gk = 0
        let field = 0
        let j = 0
        for (const p of data ?? []) {
          const st = p.status as string
          if (st !== 'pending' && st !== 'confirmed') continue
          j++
          if (p.is_goalkeeper === true) gk++
          else field++
        }
        if (!cancelled) {
          setGkCount(gk)
          setFieldCount(field)
          setJoined(j)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, opportunity?.id])

  if (!opportunity) return null

  const rules = playersJoinRules(opportunity)
  const needed = opportunity.playersNeeded ?? 0
  const full = needed > 0 && joined >= needed
  const left = needed > 0 ? Math.max(0, needed - joined) : 0

  const handleJoin = async (asGk: boolean) => {
    if (full) return
    setSubmitting(true)
    try {
      await onJoin(asGk)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const gkSlotMixed = rules.kind === 'mixed' && gkCount < 1
  const fieldSlotMixed =
    rules.kind === 'mixed' && fieldCount < Math.max(0, needed - 1)
  const gkSlotOnly = rules.kind === 'gk_only' && gkCount < needed
  const fieldSlotOnly = rules.kind === 'field_only' && fieldCount < needed

  const summaryTitle = (() => {
    if (loading) return 'Revisando cupos…'
    if (needed <= 0) return 'Cupos disponibles'
    if (full) return 'Cupos completos'
    if (left === 1) return 'Queda 1 cupo'
    return `Quedan ${left} cupos`
  })()

  const summaryDetail = (() => {
    if (loading) return 'Un segundo…'
    if (needed <= 0) return 'El organizador está recibiendo postulaciones.'
    if (full) return 'Ya no quedan cupos para sumarse a esta búsqueda.'
    switch (rules.kind) {
      case 'field_only':
        return left === 1
          ? 'Se busca 1 jugador de campo.'
          : `Se buscan ${left} jugadores de campo.`
      case 'gk_only':
        return left === 1 ? 'Se busca 1 arquero.' : `Se buscan ${left} arqueros.`
      case 'mixed': {
        const needsGk = gkCount < 1
        const needsField = fieldCount < Math.max(0, needed - 1)
        if (needsGk && !needsField) return 'Solo queda cupo de arquero.'
        if (!needsGk && needsField) return 'Solo quedan cupos de jugadores de campo.'
        if (needsGk && needsField)
          return 'Puedes postular como jugador de campo o como arquero.'
        return 'Cupos disponibles.'
      }
      case 'legacy':
        return left === 1 ? 'Se busca 1 jugador.' : `Se buscan ${left} jugadores.`
    }
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Postular a la búsqueda</DialogTitle>
          <DialogDescription>
            {opportunity.title} — elige cómo te sumas según lo que busca el
            organizador.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-1">
          <p className="text-foreground font-medium">{summaryTitle}</p>
          <p className="text-sm text-muted-foreground">{summaryDetail}</p>
          {needed > 0 && !loading && (
            <p className="text-xs text-muted-foreground">
              Cupos: <span className="text-foreground font-medium">{joined}</span>/
              <span className="text-foreground font-medium">{needed}</span>
            </p>
          )}
        </div>
        <JoinPayOrganizerNotice opportunity={opportunity} />
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {rules.kind === 'legacy' && (
            <Button
              type="button"
              className="w-full bg-primary"
              disabled={submitting || full || loading}
              onClick={() => void handleJoin(false)}
            >
              Postular
            </Button>
          )}
          {rules.kind === 'gk_only' && (
            <Button
              type="button"
              className="w-full bg-primary"
              disabled={submitting || full || loading || !gkSlotOnly}
              onClick={() => void handleJoin(true)}
            >
              Postular como arquero
            </Button>
          )}
          {rules.kind === 'field_only' && (
            <Button
              type="button"
              className="w-full bg-primary"
              disabled={submitting || full || loading || !fieldSlotOnly}
              onClick={() => void handleJoin(false)}
            >
              Postular como jugador de campo
            </Button>
          )}
          {rules.kind === 'mixed' && (
            <>
              <Button
                type="button"
                className="w-full bg-primary"
                disabled={submitting || full || loading || !fieldSlotMixed}
                onClick={() => void handleJoin(false)}
              >
                Jugador de campo
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={submitting || full || loading || !gkSlotMixed}
                onClick={() => void handleJoin(true)}
              >
                Arquero (máx. 1) 🧤
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
