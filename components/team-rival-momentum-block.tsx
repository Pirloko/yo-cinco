import { cn } from '@/lib/utils'
import { Flame, TrendingUp, Sparkles } from 'lucide-react'
import {
  getTeamRivalMomentumDisplay,
  type TeamRivalSnapshot,
} from '@/lib/team-rival-momentum'

type Props = {
  snapshot: TeamRivalSnapshot
  className?: string
  /** Texto bajo la barra (alcance de los datos). */
  footnote?: string
  /** `featured` = detalle de equipo: barra gruesa, badges, más aire. */
  variant?: 'default' | 'featured'
}

const headlineClass: Record<
  ReturnType<typeof getTeamRivalMomentumDisplay>['headline']['variant'],
  string
> = {
  danger: 'text-red-400',
  neutral: 'text-foreground',
  success: 'text-emerald-400',
}

export function TeamRivalMomentumBlock({
  snapshot,
  className,
  footnote,
  variant = 'default',
}: Props) {
  const d = getTeamRivalMomentumDisplay(snapshot)
  const featured = variant === 'featured'

  return (
    <div
      className={cn(
        featured
          ? 'rounded-2xl border border-border/70 bg-gradient-to-br from-secondary/40 via-secondary/20 to-background p-5 space-y-4 shadow-inner'
          : 'rounded-xl border border-border bg-background/60 p-4 space-y-3',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/80 shadow-sm',
            d.headline.variant === 'danger' && 'border-red-500/30 bg-red-500/10',
            d.headline.variant === 'success' && 'border-emerald-500/30 bg-emerald-500/10',
            d.headline.variant === 'neutral' && 'border-primary/20 bg-primary/5'
          )}
        >
          {d.headline.variant === 'success' ? (
            <Sparkles className="w-5 h-5 text-emerald-400" aria-hidden />
          ) : d.headline.variant === 'danger' ? (
            <TrendingUp className="w-5 h-5 text-red-400 rotate-180" aria-hidden />
          ) : (
            <Flame className="w-5 h-5 text-primary/90" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={cn(
              featured ? 'text-xl font-bold tracking-tight' : 'text-lg font-bold',
              'leading-tight',
              headlineClass[d.headline.variant]
            )}
          >
            {d.headline.label}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
              {d.momentumTier.label}
            </span>
            {d.nextMomentumLabel ? (
              <>
                <span className="text-muted-foreground text-xs">→</span>
                <span className="text-[11px] text-muted-foreground">
                  Siguiente:{' '}
                  <span className="font-medium text-foreground">{d.nextMomentumLabel}</span>
                </span>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">Nivel máximo de impulso</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground uppercase tracking-wide">
          <span>Progreso de impulso</span>
          <span className="tabular-nums text-foreground/90">
            {Math.round(d.momentumProgress * 100)}%
          </span>
        </div>
        <div
          className={cn(
            'rounded-full bg-muted/80 overflow-hidden ring-1 ring-border/50',
            featured ? 'h-3 shadow-inner' : 'h-2'
          )}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] shadow-sm',
              d.headline.variant === 'danger'
                ? 'bg-gradient-to-r from-red-500 via-orange-500 to-amber-400'
                : 'bg-gradient-to-r from-primary via-primary/90 to-accent'
            )}
            style={{
              width: `${Math.round(d.momentumProgress * 100)}%`,
            }}
          />
        </div>
      </div>

      {d.detailLines.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {d.detailLines.map((line) => (
            <li
              key={line}
              className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-3 py-2 text-[13px]"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {footnote ? (
        <p
          className={cn(
            'text-muted-foreground leading-snug border-t border-border/40 pt-3',
            featured ? 'text-xs' : 'text-[11px]'
          )}
        >
          {footnote}
        </p>
      ) : null}
    </div>
  )
}
