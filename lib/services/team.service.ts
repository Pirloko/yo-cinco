import type { SupabaseClient } from '@supabase/supabase-js'
import type { Team, TeamInvite, TeamJoinRequest, TeamPrivateSettings } from '@/lib/types'
import {
  fetchTeamInvitesForUser,
  fetchTeamJoinRequestsForUser,
  fetchTeamPrivateSettings,
  fetchTeamsWithMembers,
} from '@/lib/supabase/team-queries'

export type PlayerTeamBundle = {
  teams: Team[]
  teamInvites: TeamInvite[]
  teamJoinRequests: TeamJoinRequest[]
}

export async function loadPlayerTeamBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<PlayerTeamBundle> {
  const [teams, teamInvites, teamJoinRequests] = await Promise.all([
    fetchTeamsWithMembers(supabase),
    fetchTeamInvitesForUser(supabase, userId),
    fetchTeamJoinRequestsForUser(supabase, userId),
  ])
  return { teams, teamInvites, teamJoinRequests }
}

export async function loadPlayerTeamsAndInvites(
  supabase: SupabaseClient,
  userId: string
): Promise<Pick<PlayerTeamBundle, 'teams' | 'teamInvites'>> {
  const [teams, teamInvites] = await Promise.all([
    fetchTeamsWithMembers(supabase),
    fetchTeamInvitesForUser(supabase, userId),
  ])
  return { teams, teamInvites }
}

export async function fetchLatestTeams(supabase: SupabaseClient): Promise<Team[]> {
  return fetchTeamsWithMembers(supabase)
}

export async function fetchLatestTeamInvitesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<TeamInvite[]> {
  return fetchTeamInvitesForUser(supabase, userId)
}

export async function fetchLatestTeamJoinRequestsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<TeamJoinRequest[]> {
  return fetchTeamJoinRequestsForUser(supabase, userId)
}

export async function fetchTeamSettings(
  supabase: SupabaseClient,
  teamId: string
): Promise<TeamPrivateSettings | null> {
  return fetchTeamPrivateSettings(supabase, teamId)
}

export async function saveTeamPrivateSettings(
  supabase: SupabaseClient,
  teamId: string,
  payload: { whatsappInviteUrl?: string | null; rulesText?: string | null }
): Promise<TeamPrivateSettings | null> {
  const current = await fetchTeamPrivateSettings(supabase, teamId)
  const nextWhatsapp =
    payload.whatsappInviteUrl !== undefined
      ? (payload.whatsappInviteUrl?.trim() || null)
      : (current?.whatsappInviteUrl ?? null)
  const nextRules =
    payload.rulesText !== undefined
      ? (payload.rulesText?.trim() || null)
      : (current?.rulesText ?? null)

  const { error } = await supabase.from('team_private_settings').upsert(
    {
      team_id: teamId,
      whatsapp_invite_url: nextWhatsapp,
      rules_text: nextRules,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'team_id' }
  )
  if (error) return null
  return {
    teamId,
    whatsappInviteUrl: nextWhatsapp,
    rulesText: nextRules,
  }
}
