/** Niveles de organizador según partidos finalizados (no suspendidos). */
export type OrganizerTier = {
  id: string
  label: string
  minCompleted: number
  /** Límite superior exclusivo; null = sin techo */
  maxCompleted: number | null
}

const TIERS: OrganizerTier[] = [
  {
    id: 'starter',
    label: 'Organizador en práctica',
    minCompleted: 0,
    maxCompleted: 4,
  },
  {
    id: 'active',
    label: 'Organizador activo',
    minCompleted: 5,
    maxCompleted: 14,
  },
  {
    id: 'trusted',
    label: 'Organizador confiable',
    minCompleted: 15,
    maxCompleted: 29,
  },
  {
    id: 'reference',
    label: 'Organizador referente',
    minCompleted: 30,
    maxCompleted: null,
  },
]

export function getOrganizerTier(organizedCompleted: number): OrganizerTier {
  const n = Math.max(0, organizedCompleted)
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const t = TIERS[i]
    if (n >= t.minCompleted) {
      if (t.maxCompleted === null || n <= t.maxCompleted) return t
    }
  }
  return TIERS[0]
}

/** Progreso 0–1 dentro del nivel actual hacia el siguiente. */
export function getOrganizerTierProgress(organizedCompleted: number): {
  tier: OrganizerTier
  progress: number
  nextTierLabel: string | null
} {
  const tier = getOrganizerTier(organizedCompleted)
  const idx = TIERS.findIndex((t) => t.id === tier.id)
  const next = idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1] : null
  if (!next || tier.maxCompleted === null) {
    return {
      tier,
      progress: tier.maxCompleted === null ? 1 : 0,
      nextTierLabel: next?.label ?? null,
    }
  }
  const span = next.minCompleted - tier.minCompleted
  const cur = organizedCompleted - tier.minCompleted
  const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, cur / span))
  return { tier, progress, nextTierLabel: next.label }
}
