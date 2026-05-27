import type { SupabaseClient } from '@supabase/supabase-js'
import type { RivalChallenge } from '@/lib/types'
import { perSideMaxFromPlayersNeeded } from '@/lib/rival-lineup-slot'

export type RivalEncounterTeamDisplay = {
  teamId: string
  name: string
  logoUrl: string | null
}

export type RivalEncounterDisplay = {
  home: RivalEncounterTeamDisplay
  away: RivalEncounterTeamDisplay | null
  mode: RivalChallenge['mode']
  challengeStatus: RivalChallenge['status']
  awaitingRival: boolean
  perSideMax: number
}

type RpcPayload = {
  ok?: boolean
  error?: string
  home?: { teamId?: string; name?: string; logoUrl?: string | null }
  away?: { teamId?: string; name?: string; logoUrl?: string | null } | null
  mode?: string
  challengeStatus?: string
  awaitingRival?: boolean
  perSideMax?: number
}

function mapTeam(
  raw: { teamId?: string; name?: string; logoUrl?: string | null } | null | undefined,
  fallbackName: string,
  fallbackId: string
): RivalEncounterTeamDisplay {
  return {
    teamId: raw?.teamId?.trim() || fallbackId,
    name: raw?.name?.trim() || fallbackName,
    logoUrl: raw?.logoUrl?.trim() || null,
  }
}

export async function fetchRivalEncounterDisplay(
  supabase: SupabaseClient,
  opportunityId: string,
  fallback: {
    challengerTeamId: string
    challengerTeamName: string
    challengerLogo?: string | null
    acceptedTeamId?: string | null
    acceptedTeamName?: string | null
    acceptedLogo?: string | null
    mode: RivalChallenge['mode']
    status: RivalChallenge['status']
    playersNeeded?: number | null
  }
): Promise<RivalEncounterDisplay> {
  const perSideDefault = perSideMaxFromPlayersNeeded(fallback.playersNeeded)

  const { data, error } = await supabase.rpc('get_rival_encounter_display', {
    p_opportunity_id: opportunityId,
  })

  if (!error && data && typeof data === 'object') {
    const p = data as RpcPayload
    if (p.ok) {
      return {
        home: mapTeam(
          p.home,
          fallback.challengerTeamName,
          fallback.challengerTeamId
        ),
        away: p.away
          ? mapTeam(
              p.away,
              fallback.acceptedTeamName ?? 'Equipo visita',
              fallback.acceptedTeamId ?? ''
            )
          : fallback.acceptedTeamId
            ? mapTeam(
                {
                  teamId: fallback.acceptedTeamId,
                  name: fallback.acceptedTeamName ?? undefined,
                  logoUrl: fallback.acceptedLogo,
                },
                fallback.acceptedTeamName ?? 'Equipo visita',
                fallback.acceptedTeamId
              )
            : null,
        mode: (p.mode as RivalChallenge['mode']) ?? fallback.mode,
        challengeStatus:
          (p.challengeStatus as RivalChallenge['status']) ?? fallback.status,
        awaitingRival: p.awaitingRival === true,
        perSideMax: p.perSideMax ?? perSideDefault,
      }
    }
  }

  return {
    home: mapTeam(
      {
        teamId: fallback.challengerTeamId,
        name: fallback.challengerTeamName,
        logoUrl: fallback.challengerLogo,
      },
      fallback.challengerTeamName,
      fallback.challengerTeamId
    ),
    away: fallback.acceptedTeamId
      ? mapTeam(
          {
            teamId: fallback.acceptedTeamId,
            name: fallback.acceptedTeamName ?? undefined,
            logoUrl: fallback.acceptedLogo,
          },
          fallback.acceptedTeamName ?? 'Equipo visita',
          fallback.acceptedTeamId
        )
      : null,
    mode: fallback.mode,
    challengeStatus: fallback.status,
    awaitingRival: fallback.status === 'pending' && !fallback.acceptedTeamId,
    perSideMax: perSideDefault,
  }
}
