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
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Cupos:{' '}
            <span className="text-foreground font-medium">
              {loading ? '…' : `${joined}/${needed || '—'}`}
            </span>
            {needed > 0 && (
              <> · Libres: {full ? 0 : Math.max(0, needed - joined)}</>
            )}
          </p>
          {!loading && rules.kind !== 'legacy' && (
            <p>
              Arqueros: <span className="text-foreground font-medium">{gkCount}</span>
              {' · '}
              Campo:{' '}
              <span className="text-foreground font-medium">{fieldCount}</span>
            </p>
          )}
        </div>
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
