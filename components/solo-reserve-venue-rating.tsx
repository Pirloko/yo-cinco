'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Star, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import {
  insertSportsVenueReview,
  type SoloVenueReviewSummary,
} from '@/lib/supabase/venue-review-queries'
import type { PlayerVenueReservationListItem } from '@/lib/supabase/venue-queries'
import { cn } from '@/lib/utils'

const COMMENT_MAX = 500

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
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex gap-0.5" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              'rounded p-0.5 transition-transform active:scale-95',
              disabled && 'opacity-50 pointer-events-none'
            )}
            aria-label={`${n} de 5 estrellas`}
            aria-pressed={n === value}
          >
            <Star
              className={cn(
                'h-5 w-5',
                n <= value
                  ? 'fill-amber-400 text-amber-500'
                  : 'text-muted-foreground/45'
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function miniOverall(s: SoloVenueReviewSummary) {
  return (
    (s.courtQuality + s.managementRating + s.facilitiesRating) /
    3
  ).toFixed(1)
}

type Props = {
  reservation: PlayerVenueReservationListItem
  existing: SoloVenueReviewSummary | undefined
  reviewerDisplayName: string
  currentUserId: string
  onSaved: () => void
}

export function SoloReserveVenueRatingBlock({
  reservation: r,
  existing,
  reviewerDisplayName,
  currentUserId,
  onSaved,
}: Props) {
  const now = Date.now()
  if (r.status === 'cancelled') {
    return null
  }
  if (r.status !== 'confirmed' || r.endsAt.getTime() >= now) {
    return null
  }

  if (existing) {
    return (
      <div
        className="rounded-lg border border-emerald-600/25 bg-emerald-500/[0.06] px-3 py-2.5 dark:border-emerald-400/20 dark:bg-emerald-950/30"
        role="status"
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
          Tu valoración del centro
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          Media {miniOverall(existing)} / 5
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cancha {existing.courtQuality} · Gestión {existing.managementRating} ·
          Instalaciones {existing.facilitiesRating}
        </p>
        {existing.comment ? (
          <p className="mt-2 text-sm leading-snug text-foreground border-t border-border/40 pt-2">
            “{existing.comment}”
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <SoloReserveVenueRatingForm
      reservation={r}
      reviewerDisplayName={reviewerDisplayName}
      currentUserId={currentUserId}
      onSaved={onSaved}
    />
  )
}

function SoloReserveVenueRatingForm({
  reservation: r,
  reviewerDisplayName,
  currentUserId,
  onSaved,
}: Omit<Props, 'existing'>) {
  const [court, setCourt] = useState(0)
  const [management, setManagement] = useState(0)
  const [facilities, setFacilities] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (court < 1 || management < 1 || facilities < 1) {
      toast.error('Elige una puntuación del 1 al 5 en cada categoría.')
      return
    }
    const trimmed = comment.trim().slice(0, COMMENT_MAX)
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await insertSportsVenueReview(supabase, {
        venueId: r.venueId,
        venueReservationId: r.id,
        reviewerId: currentUserId,
        courtQuality: court,
        managementRating: management,
        facilitiesRating: facilities,
        comment: trimmed.length > 0 ? trimmed : null,
        reviewerNameSnapshot:
          reviewerDisplayName.trim().slice(0, 80) || 'Jugador',
      })
      if (error) {
        toast.error(error)
        return
      }
      toast.success('Gracias, tu opinión quedó registrada.')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-foreground">
          Valora tu experiencia en {r.venueName}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Solo tú puedes enviar una opinión por esta reserva. Será visible en la
          ficha pública del centro.
        </p>
      </div>
      <div className="space-y-0.5 rounded-md border border-border/60 bg-background/60 px-2 py-2">
        <StarRow label="Calidad de cancha" value={court} onChange={setCourt} disabled={saving} />
        <StarRow label="Gestión del centro" value={management} onChange={setManagement} disabled={saving} />
        <StarRow label="Instalaciones" value={facilities} onChange={setFacilities} disabled={saving} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`venue-review-comment-${r.id}`} className="text-xs text-muted-foreground">
          Comentario (opcional)
        </label>
        <Textarea
          id={`venue-review-comment-${r.id}`}
          value={comment}
          disabled={saving}
          maxLength={COMMENT_MAX}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Ej. canchas en buen estado, buena atención…"
          className="min-h-[72px] resize-y text-sm"
        />
        <p className="text-[10px] text-muted-foreground text-right">
          {comment.length}/{COMMENT_MAX}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={saving}
        onClick={() => void submit()}
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
            Enviando…
          </>
        ) : (
          'Publicar opinión'
        )}
      </Button>
    </div>
  )
}
