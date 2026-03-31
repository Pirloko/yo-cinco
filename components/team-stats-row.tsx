import { cn } from '@/lib/utils'

type Props = {
  wins: number
  draws: number
  losses: number
  /** Texto corto bajo la fila (p. ej. alcance de las stats). */
  caption?: string
  className?: string
  /** Una línea compacta tipo 3V·1E·0D (listas / carrusel). */
  compact?: boolean
  /** Por defecto: Victorias / Empates / Derrotas por extenso. */
  explicit?: boolean
}

export function TeamStatsRow({
  wins,
  draws,
  losses,
  caption,
  className,
  compact,
  explicit = true,
}: Props) {
  const total = wins + draws + losses

  if (compact && !explicit) {
    return (
      <div className={cn('space-y-1', className)}>
        <p className="text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground font-semibold">{wins}</span>V ·{' '}
          <span className="text-foreground font-semibold">{draws}</span>E ·{' '}
          <span className="text-foreground font-semibold">{losses}</span>D
        </p>
        {caption ? (
          <p className="text-[10px] text-muted-foreground">{caption}</p>
        ) : null}
      </div>
    )
  }

  if (compact && explicit) {
    return (
      <div className={cn('space-y-1', className)}>
        <p className="text-[11px] text-muted-foreground leading-snug">
          <span className="text-foreground font-semibold tabular-nums">{wins}</span> victorias ·{' '}
          <span className="text-foreground font-semibold tabular-nums">{draws}</span> empates ·{' '}
          <span className="text-foreground font-semibold tabular-nums">{losses}</span> derrotas
        </p>
        {caption ? (
          <p className="text-[10px] text-muted-foreground">{caption}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'grid gap-2',
          compact ? 'grid-cols-1 sm:grid-cols-3 text-xs' : 'grid-cols-1 sm:grid-cols-3 text-sm'
        )}
      >
        <div className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Victorias</p>
          <p className="text-lg font-bold tabular-nums text-foreground">{wins}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Empates</p>
          <p className="text-lg font-bold tabular-nums text-foreground">{draws}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Derrotas</p>
          <p className="text-lg font-bold tabular-nums text-foreground">{losses}</p>
        </div>
      </div>
      {total > 0 && !compact && (
        <p className="text-xs text-muted-foreground">
          Total partidos rival: <span className="font-medium text-foreground">{total}</span>
        </p>
      )}
      {caption ? (
        <p className={cn('text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}>
          {caption}
        </p>
      ) : null}
    </div>
  )
}
