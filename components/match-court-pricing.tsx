'use client'

import type { MatchOpportunity } from '@/lib/types'
import {
  courtTotalFromPricing,
  formatClp,
  payOrganizerFullNotice,
  perPlayerCourtShare,
} from '@/lib/court-pricing'
import { Banknote } from 'lucide-react'

export function MatchCourtPricingBlock({
  opportunity,
  variant = 'card',
}: {
  opportunity: MatchOpportunity
  variant?: 'card' | 'compact'
}) {
  const p = opportunity.venueReservationPricing
  if (!p) return null
  const total = courtTotalFromPricing(p)
  const share = perPlayerCourtShare(opportunity)
  if (total == null || share == null) return null

  const notice = payOrganizerFullNotice(opportunity)

  if (variant === 'compact') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-100/95">
        <Banknote className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
        <span>
          Total cancha {formatClp(total)} · Tu parte ~{formatClp(share)}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
      <p className="text-xs font-medium text-foreground flex items-center gap-2">
        <Banknote className="w-4 h-4 text-amber-400" />
        Costo de cancha
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground">Total estimado</p>
          <p className="font-semibold text-foreground">{formatClp(total)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Por jugador (aprox.)</p>
          <p className="font-semibold text-foreground">{formatClp(share)}</p>
        </div>
      </div>
      {notice ? (
        <p className="text-xs text-amber-100/90 leading-snug border-t border-amber-500/20 pt-2">
          {notice}
        </p>
      ) : null}
    </div>
  )
}

export function JoinPayOrganizerNotice({
  opportunity,
}: {
  opportunity: MatchOpportunity
}) {
  const msg = payOrganizerFullNotice(opportunity)
  if (!msg) return null
  return (
    <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-50/95 leading-snug">
      {msg}
    </div>
  )
}
