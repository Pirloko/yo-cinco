'use client'

import { useEffect, useState } from 'react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import type { MatchOpportunity } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const MAX_GOALKEEPERS = 2

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  opportunity: MatchOpportunity | null
  onJoin: (isGoalkeeper: boolean) => Promise<void>
}

export function JoinRevueltaDialog({
  open,
  onOpenChange,
  opportunity,
  onJoin,
}: Props) {
  const [gkCount, setGkCount] = useState(0)
  const [loadingCount, setLoadingCount] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !opportunity || !isSupabaseConfigured()) {
      setGkCount(0)
      return
    }
    let cancelled = false
    setLoadingCount(true)
    void (async () => {
      try {
        const sb = createClient()
        const { count, error } = await sb
          .from('match_opportunity_participants')
          .select('*', { count: 'exact', head: true })
          .eq('opportunity_id', opportunity.id)
          .eq('is_goalkeeper', true)
        if (!cancelled && !error) setGkCount(count ?? 0)
      } finally {
        if (!cancelled) setLoadingCount(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, opportunity?.id])

  if (!opportunity) return null

  const needed = opportunity.playersNeeded ?? 0
  const joined = opportunity.playersJoined ?? 0
  const totalLeft = needed > 0 ? Math.max(0, needed - joined) : 999
  const gkLeft = Math.max(0, MAX_GOALKEEPERS - gkCount)
  const full = needed > 0 && joined >= needed

  const handleJoin = async (asGk: boolean) => {
    if (full) return
    if (asGk && gkLeft <= 0) return
    setSubmitting(true)
    try {
      await onJoin(asGk)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unirte a la revuelta</DialogTitle>
          <DialogDescription>
            {opportunity.title} — elige si vas como arquero (máx. 2) o jugador de
            campo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Cupos totales:{' '}
            <span className="text-foreground font-medium">
              {loadingCount ? '…' : `${joined}/${needed || '—'}`}
            </span>
            {needed > 0 && (
              <> · Libres: {full ? 0 : totalLeft}</>
            )}
          </p>
          <p>
            Arqueros:{' '}
            <span className="text-foreground font-medium">
              {gkCount}/{MAX_GOALKEEPERS}
            </span>
            {gkLeft > 0 ? (
              <span> · Quedan {gkLeft} cupo(s) de arquero</span>
            ) : (
              <span> · Completo</span>
            )}
          </p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full bg-primary"
            disabled={submitting || full}
            onClick={() => void handleJoin(false)}
          >
            Jugador de campo
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={submitting || full || gkLeft <= 0}
            onClick={() => void handleJoin(true)}
          >
            Arquero 🧤
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
