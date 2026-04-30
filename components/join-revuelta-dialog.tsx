'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import { fetchMatchParticipantGkFieldCounts } from '@/lib/supabase/match-participant-queries'
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
import { JoinPayOrganizerNotice } from '@/components/match-court-pricing'

const MAX_GOALKEEPERS = 2

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  opportunity: MatchOpportunity | null
  onJoin: (isGoalkeeper: boolean) => Promise<void>
  /** Revuelta privada: el jugador no es del equipo y envía solicitud al organizador. */
  mode?: 'join' | 'request'
}

export function JoinRevueltaDialog({
  open,
  onOpenChange,
  opportunity,
  onJoin,
  mode = 'join',
}: Props) {
  const [gkCount, setGkCount] = useState(0)
  const [fieldCount, setFieldCount] = useState(0)
  const [joinedCount, setJoinedCount] = useState(0)
  const [loadingCount, setLoadingCount] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !opportunity || !isSupabaseConfigured()) {
      setGkCount(0)
      setFieldCount(0)
      setJoinedCount(0)
      return
    }
    let cancelled = false
    setLoadingCount(true)
    void (async () => {
      try {
        const sb = getBrowserSupabase()
        if (!sb || cancelled) return
        const counts = await fetchMatchParticipantGkFieldCounts(sb, opportunity.id)
        if (!counts || cancelled) return
        if (!cancelled) {
          setGkCount(counts.gkCount)
          setFieldCount(counts.fieldCount)
          setJoinedCount(counts.joinedCount)
        }
      } finally {
        if (!cancelled) setLoadingCount(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, opportunity?.id])

  const needed = opportunity?.playersNeeded ?? 0
  const cap = needed
  const joined = loadingCount
    ? (opportunity?.playersJoined ?? 0)
    : joinedCount
  const totalLeft = cap > 0 ? Math.max(0, cap - joined) : 999
  const gkLeft = Math.max(0, MAX_GOALKEEPERS - gkCount)
  const fieldCap = Math.max(0, cap - MAX_GOALKEEPERS)
  const fieldLeft = Math.max(0, fieldCap - fieldCount)
  const full = !!opportunity && cap > 0 && joined >= cap

  const availabilityText = useMemo(() => {
    if (!opportunity) return ''
    if (full) return 'No quedan cupos disponibles.'
    if (fieldLeft <= 0 && gkLeft > 0) return 'Solo quedan cupos de arquero.'
    if (gkLeft <= 0 && fieldLeft > 0) return 'Quedan cupos de jugadores.'
    if (gkLeft > 0 && fieldLeft > 0) {
      return `Quedan ${fieldLeft} de jugadores y ${gkLeft} de arquero.`
    }
    return 'Hay cupos disponibles.'
  }, [opportunity, full, fieldLeft, gkLeft])

  if (!opportunity) return null

  const handleJoin = async (asGk: boolean) => {
    if (full) return
    if (asGk && gkLeft <= 0) return
    if (!asGk && fieldLeft <= 0) return
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
          <DialogTitle>
            {mode === 'request' ? 'Solicitar ingreso' : 'Unirte a la revuelta'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'request'
              ? `${opportunity.title} — revuelta privada de equipo. Elige rol; el organizador del partido aceptará o rechazará tu solicitud. No pasas a ser miembro del plantel.`
              : `${opportunity.title} — elige cómo quieres jugar.`}
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
          <p className="text-foreground font-medium">{availabilityText}</p>
        </div>
        <JoinPayOrganizerNotice opportunity={opportunity} />
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full bg-primary"
            disabled={submitting || full || fieldLeft <= 0}
            onClick={() => void handleJoin(false)}
          >
            Entrar como jugador de campo
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={submitting || full || gkLeft <= 0}
            onClick={() => void handleJoin(true)}
          >
            Entrar como arquero 🧤
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
