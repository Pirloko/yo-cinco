import { cn } from '@/lib/utils'
import { Trophy, Minus, TrendingDown, Flame } from 'lucide-react'
import {
  getTeamRivalMomentumDisplay,
  teamRivalSnapshotFromTeam,
} from '@/lib/team-rival-momentum'
import type { Team } from '@/lib/types'

const headlineColor: Record<'danger' | 'neutral' | 'success', string> = {
  danger: 'text-red-400',
  neutral: 'text-muted-foreground',
  success: 'text-emerald-400',
}

type Props = {
  team: Pick<
    Team,
    | 'statsWins'
    | 'statsDraws'
    | 'statsLosses'
    | 'statsWinStreak'
    | 'statsLossStreak'
  >
  className?: string
  /** En listas se muestra la franja compacta de impulso (por defecto true). */
  showMomentum?: boolean
  /** `sm` = tarjetas lista; `lg` = detalle del equipo (números más grandes). */
  size?: 'sm' | 'lg'
}

export function TeamCardStatsStrip({
  team,
  className,
  showMomentum = true,
  size = 'sm',
}: Props) {
  const snap = teamRivalSnapshotFromTeam(team)
  const d = getTeamRivalMomentumDisplay(snap)

  const isLg = size === 'lg'
  const iconCls = isLg ? 'w-5 h-5 mb-1' : 'w-3.5 h-3.5 mb-0.5'
  const numCls = isLg ? 'text-2xl font-bold' : 'text-base font-bold'
  const labelCls = isLg
    ? 'text-[10px] font-semibold uppercase tracking-wider mt-1.5'
    : 'text-[9px] font-medium uppercase tracking-wide mt-1'
  const cellPad = isLg ? 'px-2 py-3' : 'px-1.5 py-2'
  const gap = isLg ? 'gap-2' : 'gap-1.5'

  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('grid grid-cols-3', gap)}>
        <div
          className={cn(
            'rounded-xl border text-center',
            cellPad,
            'border-emerald-500/30 bg-gradient-to-b from-emerald-500/15 to-emerald-500/[0.07] shadow-sm shadow-emerald-500/5'
          )}
        >
          <Trophy
            className={cn('mx-auto text-emerald-500 opacity-95', iconCls)}
            aria-hidden
          />
          <p className={cn('tabular-nums text-foreground leading-none', numCls)}>
            {team.statsWins ?? 0}
          </p>
          <p
            className={cn(
              'text-emerald-600/95 dark:text-emerald-400/95',
              labelCls
            )}
          >
            Victorias
          </p>
        </div>
        <div
          className={cn(
            'rounded-xl border text-center',
            cellPad,
            'border-amber-500/25 bg-gradient-to-b from-amber-500/12 to-amber-500/[0.06] shadow-sm shadow-amber-500/5'
          )}
        >
          <Minus
            className={cn('mx-auto text-amber-500 opacity-95', iconCls)}
            strokeWidth={2.5}
            aria-hidden
          />
          <p className={cn('tabular-nums text-foreground leading-none', numCls)}>
            {team.statsDraws ?? 0}
          </p>
          <p
            className={cn(
              'text-amber-600/95 dark:text-amber-400/95',
              labelCls
            )}
          >
            Empates
          </p>
        </div>
        <div
          className={cn(
            'rounded-xl border text-center',
            cellPad,
            'border-rose-500/30 bg-gradient-to-b from-rose-500/15 to-rose-500/[0.07] shadow-sm shadow-rose-500/5'
          )}
        >
          <TrendingDown
            className={cn('mx-auto text-rose-500 opacity-95', iconCls)}
            aria-hidden
          />
          <p className={cn('tabular-nums text-foreground leading-none', numCls)}>
            {team.statsLosses ?? 0}
          </p>
          <p
            className={cn(
              'text-rose-600/95 dark:text-rose-400/95',
              labelCls
            )}
          >
            Derrotas
          </p>
        </div>
      </div>

      {showMomentum ? (
        <div className="rounded-lg border border-border/60 bg-secondary/20 px-2.5 py-2">
          <div className="flex items-start gap-2">
            <Flame
              className={cn(
                'w-3.5 h-3.5 shrink-0 mt-0.5',
                d.headline.variant === 'danger'
                  ? 'text-red-400'
                  : d.headline.variant === 'success'
                    ? 'text-emerald-400'
                    : 'text-primary/80'
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p
                className={cn(
                  'text-[11px] font-semibold leading-tight line-clamp-2',
                  headlineColor[d.headline.variant]
                )}
              >
                {d.headline.label}
              </p>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden min-w-0">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width]',
                      d.headline.variant === 'danger'
                        ? 'bg-gradient-to-r from-red-500/80 to-orange-500/70'
                        : 'bg-gradient-to-r from-primary/90 to-accent/90'
                    )}
                    style={{ width: `${Math.round(d.momentumProgress * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground shrink-0 max-w-[42%] text-right leading-tight line-clamp-2">
                  {d.momentumTier.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
