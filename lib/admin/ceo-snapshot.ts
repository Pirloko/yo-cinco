/** Contrato JSON de `admin_ceo_business_snapshot` (Supabase RPC). */

export type AdminCeoSnapshotMeta = {
  from: string
  to: string
  timezone: string
}

export type AdminCeoNorthStar = {
  matchesCompleted: number
  matchesCreated: number
  completionRatePct: number
  avgConfirmedPlayersPerCompletedMatch: number
  avgHoursToFillBucket: number | null
  fillBucketSampleSize: number
}

export type AdminCeoActivation = {
  newPlayers: number
  onboardingCompletePct: number
  firstMatchWithin7DaysPct: number
  avgHoursToFirstMatch: number | null
  firstMatchSampleSize: number
}

export type AdminCeoLiquidity = {
  matchesCreated: number
  matchesFillableWithCap: number
  matchesFilled: number
  matchesFilledPct: number
  slotsJoined: number
  slotsNeeded: number
  slotsFilledPct: number
  matchesCancelledPct: number
  unfilledUpcomingInPeriod: number
}

export type AdminCeoRetention = {
  activePlayers7d: number
  playersWith2PlusCompletedMatches: number
  playersWithCompletedMatch: number
  avgCompletedMatchesPerParticipatingPlayer: number
}

export type AdminCeoMonetization = {
  revenueCollectedClp: number
  linkedMatchesWithReservation: number
  revenuePerLinkedMatch: number
  courtOccupancyConfirmedPct: number
  reservationsInWindow: number
  reservationsCancelledPct: number
  openMinutesPlatform: number
  bookedConfirmedMinutes: number
}

export type AdminCeoFriction = {
  joinRpcErrorRatePct: number | null
  joinRpcErrorNote: string
  pendingRevueltaRequests: number
  pendingTeamJoinRequests: number
  playersBanned: number
  playersSuspendedNow: number
  playersTotal: number
  pctPlayersBanned: number
  unfilledFutureMatchesInPeriod: number
}

export type AdminCeoBusinessSnapshot = {
  ok: true
  meta: AdminCeoSnapshotMeta
  northStar: AdminCeoNorthStar
  activation: AdminCeoActivation
  liquidity: AdminCeoLiquidity
  retention: AdminCeoRetention
  monetization: AdminCeoMonetization
  friction: AdminCeoFriction
}

export type AdminPlayersBusinessActivity = {
  activePlayers7d: number
  activePlayers30d: number
  eligiblePlayers: number
  pctActive7dOfEligible: number
  pctActive30dOfEligible: number
}

export type AdminPlayersBusinessQuality = {
  pctOnboardingComplete: number
  pctPlayedAtLeastOneCompleted: number
  pctReturningAmongPlayers: number
  playersWithOneOrMoreCompleted: number
  playersWithTwoOrMoreCompleted: number
}

export type AdminPlayersTopEntry = {
  userId: string
  name: string
  completedMatches: number
}

export type AdminPlayersBusinessEngagement = {
  avgCompletedMatchesPerPlayerWithPlay: number
  medianCompletedMatchesPerPlayerWithPlay: number
  topActivePlayers: AdminPlayersTopEntry[]
}

export type AdminPlayersBusinessChurn = {
  inactive7d: number
  inactive15d: number
  inactive30d: number
  pctInactive7d: number
}

export type AdminPlayersCohortRow = {
  month: string
  registered: number
  activeLast30d: number
}

export type AdminPlayersBusinessSnapshot = {
  ok: true
  activity: AdminPlayersBusinessActivity
  quality: AdminPlayersBusinessQuality
  engagement: AdminPlayersBusinessEngagement
  churn: AdminPlayersBusinessChurn
  cohorts: AdminPlayersCohortRow[]
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function maybeNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function parseAdminCeoSnapshot(raw: unknown): AdminCeoBusinessSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.ok !== true) return null
  const meta = o.meta as Record<string, unknown> | undefined
  const ns = o.northStar as Record<string, unknown> | undefined
  const ac = o.activation as Record<string, unknown> | undefined
  const lq = o.liquidity as Record<string, unknown> | undefined
  const rt = o.retention as Record<string, unknown> | undefined
  const mo = o.monetization as Record<string, unknown> | undefined
  const fr = o.friction as Record<string, unknown> | undefined
  if (!meta || !ns || !ac || !lq || !rt || !mo || !fr) return null

  return {
    ok: true,
    meta: {
      from: String(meta.from ?? ''),
      to: String(meta.to ?? ''),
      timezone: String(meta.timezone ?? 'America/Santiago'),
    },
    northStar: {
      matchesCompleted: num(ns.matchesCompleted),
      matchesCreated: num(ns.matchesCreated),
      completionRatePct: num(ns.completionRatePct),
      avgConfirmedPlayersPerCompletedMatch: num(ns.avgConfirmedPlayersPerCompletedMatch),
      avgHoursToFillBucket: maybeNum(ns.avgHoursToFillBucket),
      fillBucketSampleSize: num(ns.fillBucketSampleSize),
    },
    activation: {
      newPlayers: num(ac.newPlayers),
      onboardingCompletePct: num(ac.onboardingCompletePct),
      firstMatchWithin7DaysPct: num(ac.firstMatchWithin7DaysPct),
      avgHoursToFirstMatch: maybeNum(ac.avgHoursToFirstMatch),
      firstMatchSampleSize: num(ac.firstMatchSampleSize),
    },
    liquidity: {
      matchesCreated: num(lq.matchesCreated),
      matchesFillableWithCap: num(lq.matchesFillableWithCap),
      matchesFilled: num(lq.matchesFilled),
      matchesFilledPct: num(lq.matchesFilledPct),
      slotsJoined: num(lq.slotsJoined),
      slotsNeeded: num(lq.slotsNeeded),
      slotsFilledPct: num(lq.slotsFilledPct),
      matchesCancelledPct: num(lq.matchesCancelledPct),
      unfilledUpcomingInPeriod: num(lq.unfilledUpcomingInPeriod),
    },
    retention: {
      activePlayers7d: num(rt.activePlayers7d),
      playersWith2PlusCompletedMatches: num(rt.playersWith2PlusCompletedMatches),
      playersWithCompletedMatch: num(rt.playersWithCompletedMatch),
      avgCompletedMatchesPerParticipatingPlayer: num(rt.avgCompletedMatchesPerParticipatingPlayer),
    },
    monetization: {
      revenueCollectedClp: num(mo.revenueCollectedClp),
      linkedMatchesWithReservation: num(mo.linkedMatchesWithReservation),
      revenuePerLinkedMatch: num(mo.revenuePerLinkedMatch),
      courtOccupancyConfirmedPct: num(mo.courtOccupancyConfirmedPct),
      reservationsInWindow: num(mo.reservationsInWindow),
      reservationsCancelledPct: num(mo.reservationsCancelledPct),
      openMinutesPlatform: num(mo.openMinutesPlatform),
      bookedConfirmedMinutes: num(mo.bookedConfirmedMinutes),
    },
    friction: {
      joinRpcErrorRatePct: maybeNum(fr.joinRpcErrorRatePct),
      joinRpcErrorNote: String(fr.joinRpcErrorNote ?? ''),
      pendingRevueltaRequests: num(fr.pendingRevueltaRequests),
      pendingTeamJoinRequests: num(fr.pendingTeamJoinRequests),
      playersBanned: num(fr.playersBanned),
      playersSuspendedNow: num(fr.playersSuspendedNow),
      playersTotal: num(fr.playersTotal),
      pctPlayersBanned: num(fr.pctPlayersBanned),
      unfilledFutureMatchesInPeriod: num(fr.unfilledFutureMatchesInPeriod),
    },
  }
}

export function parseAdminPlayersBusinessSnapshot(
  raw: unknown
): AdminPlayersBusinessSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.ok !== true) return null
  const act = o.activity as Record<string, unknown> | undefined
  const qual = o.quality as Record<string, unknown> | undefined
  const eng = o.engagement as Record<string, unknown> | undefined
  const ch = o.churn as Record<string, unknown> | undefined
  if (!act || !qual || !eng || !ch) return null

  const topRaw = eng.topActivePlayers
  const top: AdminPlayersTopEntry[] = Array.isArray(topRaw)
    ? topRaw.map((row) => {
        const r = row as Record<string, unknown>
        return {
          userId: String(r.userId ?? ''),
          name: String(r.name ?? ''),
          completedMatches: num(r.completedMatches),
        }
      })
    : []

  const cohortsRaw = o.cohorts
  const cohorts: AdminPlayersCohortRow[] = Array.isArray(cohortsRaw)
    ? cohortsRaw.map((row) => {
        const r = row as Record<string, unknown>
        return {
          month: String(r.month ?? ''),
          registered: num(r.registered),
          activeLast30d: num(r.activeLast30d),
        }
      })
    : []

  return {
    ok: true,
    activity: {
      activePlayers7d: num(act.activePlayers7d),
      activePlayers30d: num(act.activePlayers30d),
      eligiblePlayers: num(act.eligiblePlayers),
      pctActive7dOfEligible: num(act.pctActive7dOfEligible),
      pctActive30dOfEligible: num(act.pctActive30dOfEligible),
    },
    quality: {
      pctOnboardingComplete: num(qual.pctOnboardingComplete),
      pctPlayedAtLeastOneCompleted: num(qual.pctPlayedAtLeastOneCompleted),
      pctReturningAmongPlayers: num(qual.pctReturningAmongPlayers),
      playersWithOneOrMoreCompleted: num(qual.playersWithOneOrMoreCompleted),
      playersWithTwoOrMoreCompleted: num(qual.playersWithTwoOrMoreCompleted),
    },
    engagement: {
      avgCompletedMatchesPerPlayerWithPlay: num(eng.avgCompletedMatchesPerPlayerWithPlay),
      medianCompletedMatchesPerPlayerWithPlay: num(eng.medianCompletedMatchesPerPlayerWithPlay),
      topActivePlayers: top,
    },
    churn: {
      inactive7d: num(ch.inactive7d),
      inactive15d: num(ch.inactive15d),
      inactive30d: num(ch.inactive30d),
      pctInactive7d: num(ch.pctInactive7d),
    },
    cohorts,
  }
}
