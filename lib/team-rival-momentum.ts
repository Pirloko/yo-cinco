/**
 * Nivel de “impulso” del equipo en partidos rival: título llamativo + barra por puntos.
 * Los puntos combinan volumen, rachas y resultados (solo lectura en cliente).
 */

export type TeamRivalSnapshot = {
  wins: number
  draws: number
  losses: number
  winStreak: number
  lossStreak: number
}

export function teamRivalSnapshotFromTeam(t: {
  statsWins?: number
  statsDraws?: number
  statsLosses?: number
  statsWinStreak?: number
  statsLossStreak?: number
}): TeamRivalSnapshot {
  return {
    wins: t.statsWins ?? 0,
    draws: t.statsDraws ?? 0,
    losses: t.statsLosses ?? 0,
    winStreak: t.statsWinStreak ?? 0,
    lossStreak: t.statsLossStreak ?? 0,
  }
}

export type TeamRivalHeadlineVariant = 'danger' | 'neutral' | 'success'

/** Puntos para la barra de nivel: 0 solo sin partidos rival; con historial, mínimo 1. */
export function teamRivalMomentumPoints(s: TeamRivalSnapshot): number {
  const total = Math.max(0, s.wins + s.draws + s.losses)
  if (total === 0) return 0
  const w = Math.max(0, s.wins)
  const d = Math.max(0, s.draws)
  const ws = Math.max(0, s.winStreak)
  const ls = Math.max(0, s.lossStreak)
  const raw = w * 8 + d * 3 + total * 2 + ws * 7 - ls * 10
  return Math.max(1, raw)
}

type MomentumTier = {
  id: string
  label: string
  minPoints: number
  /** Inclusive upper bound; null = sin techo */
  maxPoints: number | null
}

const MOMENTUM_TIERS: MomentumTier[] = [
  { id: 'fog', label: 'Sin fogueo aún', minPoints: 0, maxPoints: 0 },
  { id: 'debut', label: 'Pisando el césped', minPoints: 1, maxPoints: 14 },
  { id: 'map', label: 'En el radar rival', minPoints: 15, maxPoints: 34 },
  { id: 'heavy', label: 'Peso de cancha', minPoints: 35, maxPoints: 64 },
  { id: 'honor', label: 'Cancha de honor', minPoints: 65, maxPoints: 99 },
  { id: 'inst', label: 'Institución del club', minPoints: 100, maxPoints: null },
]

export function getTeamRivalMomentumTier(points: number): MomentumTier {
  const p = Math.max(0, points)
  for (let i = MOMENTUM_TIERS.length - 1; i >= 0; i--) {
    const t = MOMENTUM_TIERS[i]
    if (p >= t.minPoints) {
      if (t.maxPoints === null || p <= t.maxPoints) return t
    }
  }
  return MOMENTUM_TIERS[0]
}

export function getTeamRivalMomentumProgress(points: number): {
  tier: MomentumTier
  progress: number
  nextTierLabel: string | null
} {
  const tier = getTeamRivalMomentumTier(points)
  const idx = MOMENTUM_TIERS.findIndex((x) => x.id === tier.id)
  const next = idx >= 0 && idx < MOMENTUM_TIERS.length - 1 ? MOMENTUM_TIERS[idx + 1] : null
  if (!next || tier.maxPoints === null) {
    return {
      tier,
      progress: tier.maxPoints === null ? 1 : 0,
      nextTierLabel: next?.label ?? null,
    }
  }
  const span = next.minPoints - tier.minPoints
  const cur = points - tier.minPoints
  const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, cur / span))
  return { tier, progress, nextTierLabel: next.label }
}

/**
 * Título principal “llamativo” (prioriza rachas negativas, luego positivas, luego palmarés).
 */
export function getTeamRivalHeadline(s: TeamRivalSnapshot): {
  label: string
  variant: TeamRivalHeadlineVariant
} {
  const total = s.wins + s.draws + s.losses
  if (total <= 0) {
    return { label: 'Aún sin partidos rival', variant: 'neutral' }
  }
  if (s.lossStreak >= 5) {
    return { label: 'En caída libre', variant: 'danger' }
  }
  if (s.lossStreak >= 3) {
    return { label: 'Noche larga en defensa', variant: 'danger' }
  }
  if (s.lossStreak >= 2) {
    return { label: 'Tiempos de sequía', variant: 'danger' }
  }
  if (s.winStreak >= 10) {
    return { label: 'Dinastía de la cancha', variant: 'success' }
  }
  if (s.wins >= 40) {
    return { label: 'Salón de la fama', variant: 'success' }
  }
  if (s.winStreak >= 7) {
    return { label: 'Ole sin freno', variant: 'success' }
  }
  if (s.winStreak >= 5) {
    return { label: 'Imparable', variant: 'success' }
  }
  if (s.winStreak >= 3) {
    return { label: 'En llamas', variant: 'success' }
  }
  if (s.winStreak >= 2) {
    return { label: 'Con la mecha encendida', variant: 'success' }
  }
  if (total >= 25) {
    return { label: 'Cancha conocida', variant: 'neutral' }
  }
  if (total >= 10) {
    return { label: 'Rodados de verdad', variant: 'neutral' }
  }
  return { label: 'Primeros balones', variant: 'neutral' }
}

export function getTeamRivalMomentumDisplay(s: TeamRivalSnapshot) {
  const points = teamRivalMomentumPoints(s)
  const { tier, progress, nextTierLabel } = getTeamRivalMomentumProgress(points)
  const headline = getTeamRivalHeadline(s)
  const total = s.wins + s.draws + s.losses
  const lines: string[] = []
  if (total > 0) {
    lines.push(`Partidos rival jugados: ${total}`)
  }
  if (s.winStreak > 0) {
    lines.push(`Racha de victorias: ${s.winStreak}`)
  }
  if (s.lossStreak > 0) {
    lines.push(`Racha de derrotas: ${s.lossStreak}`)
  }
  return {
    points,
    headline,
    momentumTier: tier,
    momentumProgress: progress,
    nextMomentumLabel: nextTierLabel,
    detailLines: lines,
  }
}
