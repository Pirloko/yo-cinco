import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PublicVenueReviewSnippet, PublicVenueReviewStats } from '@/lib/types'

function StarsReadonly({ value }: { value: number }) {
  const v = Math.round(Math.min(5, Math.max(0, value)))
  return (
    <div className="flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            'h-3.5 w-3.5',
            n <= v ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/35'
          )}
        />
      ))}
    </div>
  )
}

function StatBar({
  label,
  value,
  max = 5,
}: {
  label: string
  value: number
  max?: number
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-semibold text-foreground">
          {Number.isFinite(value) ? value.toFixed(1) : '—'}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/80 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

type Props = {
  stats: PublicVenueReviewStats | null
  reviews: PublicVenueReviewSnippet[]
}

export function VenueCentroReviewsSection({ stats, reviews }: Props) {
  const hasAny = (stats?.reviewCount ?? 0) > 0 || reviews.length > 0

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      aria-labelledby="venue-reviews-heading"
    >
      <div className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Star className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2
              id="venue-reviews-heading"
              className="text-base font-semibold tracking-tight text-foreground"
            >
              Opiniones de jugadores
            </h2>
            <p className="text-xs text-muted-foreground">
              Valoraciones tras reservar cancha por la app
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {!hasAny ? (
          <p className="text-center text-sm text-muted-foreground py-2">
            Aún no hay opiniones publicadas. Cuando los jugadores cierren una reserva
            de cancha, podrán dejar una valoración aquí.
          </p>
        ) : (
          <>
            {stats && stats.reviewCount > 0 ? (
              <div className="rounded-xl border border-border/80 bg-secondary/20 p-4 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Valoración media
                    </p>
                    <p className="mt-0.5 flex items-baseline gap-2">
                      <span className="text-3xl font-bold tabular-nums text-foreground">
                        {stats.avgOverall.toFixed(1)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / 5 · {stats.reviewCount}{' '}
                        {stats.reviewCount === 1 ? 'opinión' : 'opiniones'}
                      </span>
                    </p>
                  </div>
                  <StarsReadonly value={stats.avgOverall} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatBar label="Cancha" value={stats.avgCourtQuality} />
                  <StatBar label="Gestión" value={stats.avgManagement} />
                  <StatBar label="Instalaciones" value={stats.avgFacilities} />
                </div>
              </div>
            ) : null}

            {reviews.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Últimas opiniones
                </p>
                <ul className="space-y-3">
                  {reviews.map((r) => {
                    const overall =
                      (r.courtQuality + r.managementRating + r.facilitiesRating) / 3
                    return (
                      <li
                        key={r.id}
                        className="rounded-xl border border-border/70 bg-background/80 px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {r.reviewerNameSnapshot}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDistanceToNow(r.createdAt, {
                                addSuffix: true,
                                locale: es,
                              })}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {overall.toFixed(1)}
                            </span>
                            <StarsReadonly value={overall} />
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                          <span>Cancha {r.courtQuality}/5</span>
                          <span>Gestión {r.managementRating}/5</span>
                          <span>Instal. {r.facilitiesRating}/5</span>
                        </div>
                        {r.comment ? (
                          <p className="mt-2 text-sm leading-snug text-foreground/90 border-t border-border/50 pt-2">
                            {r.comment}
                          </p>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
