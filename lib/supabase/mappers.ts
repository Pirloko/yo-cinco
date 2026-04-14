import type {
  Gender,
  Level,
  MatchOpportunity,
  MatchStatus,
  MatchType,
  Position,
  RevueltaResult,
  RivalResult,
  User,
} from '@/lib/types'
import { parseRevueltaLineup } from '@/lib/revuelta-lineup'
import { parsePlayersSeekProfile } from '@/lib/players-seek-profile'
import {
  computeAgeFromBirthDate,
  parseBirthDateLocal,
} from '@/lib/age-birthday'

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face'

export type ProfileGeoCityEmbed = {
  id: string
  name: string
  slug: string
  region_id?: string
}

export type ProfileRow = {
  id: string
  name: string
  age: number
  birth_date?: string | null
  gender: Gender
  position: Position
  level: Level
  city: string
  city_id: string
  geo_city?: ProfileGeoCityEmbed | null
  availability: string[]
  photo_url: string
  bio: string | null
  whatsapp_phone?: string | null
  player_essentials_completed_at?: string | null
  stats_player_wins?: number | null
  stats_player_draws?: number | null
  stats_player_losses?: number | null
  stats_organized_completed?: number | null
  stats_organizer_wins?: number | null
  mod_yellow_cards?: number | null
  mod_red_cards?: number | null
  mod_suspended_until?: string | null
  mod_banned_at?: string | null
  mod_ban_reason?: string | null
  mod_last_yellow_at?: string | null
  mod_last_red_at?: string | null
  created_at: string
  account_type?: 'player' | 'venue' | 'admin' | null
}

export function profileRowToUser(row: ProfileRow, email: string): User {
  const displayCity = row.geo_city?.name?.trim() || row.city
  const birthDate = row.birth_date
    ? parseBirthDateLocal(row.birth_date)
    : undefined
  const age =
    birthDate != null ? computeAgeFromBirthDate(birthDate) : row.age
  return {
    id: row.id,
    email,
    name: row.name,
    age,
    birthDate: birthDate ?? null,
    gender: row.gender,
    position: row.position,
    level: row.level,
    cityId: row.city_id ?? '',
    city: displayCity,
    regionId: row.geo_city?.region_id ?? undefined,
    availability: row.availability ?? [],
    photo: row.photo_url || DEFAULT_AVATAR,
    bio: row.bio ?? undefined,
    whatsappPhone: row.whatsapp_phone ?? undefined,
    playerEssentialsCompletedAt: row.player_essentials_completed_at
      ? new Date(row.player_essentials_completed_at)
      : undefined,
    statsPlayerWins: row.stats_player_wins ?? 0,
    statsPlayerDraws: row.stats_player_draws ?? 0,
    statsPlayerLosses: row.stats_player_losses ?? 0,
    statsOrganizedCompleted: row.stats_organized_completed ?? 0,
    statsOrganizerWins: row.stats_organizer_wins ?? 0,
    modYellowCards: row.mod_yellow_cards ?? 0,
    modRedCards: row.mod_red_cards ?? 0,
    modSuspendedUntil: row.mod_suspended_until ? new Date(row.mod_suspended_until) : undefined,
    modBannedAt: row.mod_banned_at ? new Date(row.mod_banned_at) : undefined,
    modBanReason: row.mod_ban_reason ?? undefined,
    modLastYellowAt: row.mod_last_yellow_at
      ? new Date(row.mod_last_yellow_at)
      : null,
    modLastRedAt: row.mod_last_red_at ? new Date(row.mod_last_red_at) : null,
    createdAt: new Date(row.created_at),
    accountType:
      row.account_type === 'venue'
        ? 'venue'
        : row.account_type === 'admin'
          ? 'admin'
          : 'player',
  }
}

export type MatchOpportunityGeoCityEmbed = {
  id: string
  name: string
  slug: string
  region_id?: string
}

export type MatchOpportunityRow = {
  id: string
  type: MatchType
  title: string
  description: string | null
  location: string
  venue: string
  city_id: string
  geo_city?: MatchOpportunityGeoCityEmbed | null
  date_time: string
  level: Level
  creator_id: string
  team_name: string | null
  players_needed: number | null
  players_joined: number
  players_seek_profile?: string | null
  gender: Gender
  status: MatchStatus
  created_at: string
  finalized_at?: string | null
  rival_result?: RivalResult | null
  casual_completed?: boolean | null
  suspended_at?: string | null
  suspended_reason?: string | null
  revuelta_lineup?: unknown | null
  revuelta_result?: RevueltaResult | null
  rival_captain_vote_challenger?: RivalResult | null
  rival_captain_vote_accepted?: RivalResult | null
  rival_outcome_disputed?: boolean | null
  match_stats_applied_at?: string | null
  sports_venue_id?: string | null
  venue_reservation_id?: string | null
  private_revuelta_team_id?: string | null
}

export type CreatorSnippet = {
  id: string
  name: string
  photo_url: string
}

export function mapMatchOpportunityFromDb(
  row: MatchOpportunityRow,
  creator: CreatorSnippet | null,
  venueReservation?: {
    starts_at: string
    ends_at: string
    price_per_hour: number | null
    currency: string | null
  } | null,
  venueContactPhone?: string | null,
  /** Si `sports_venue_id` en BD es null pero el nombre coincide con un centro en la misma ciudad (solo UI / listados). */
  resolvedSportsVenueIdForUi?: string | null
): MatchOpportunity {
  const c = creator ?? {
    id: row.creator_id,
    name: 'Jugador',
    photo_url: DEFAULT_AVATAR,
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? undefined,
    cityId: row.city_id ?? '',
    cityRegionId: row.geo_city?.region_id ?? undefined,
    location: row.geo_city?.name?.trim() || row.location,
    venue: row.venue,
    dateTime: new Date(row.date_time),
    level: row.level,
    creatorId: row.creator_id,
    creatorName: c.name || 'Jugador',
    creatorPhoto: c.photo_url || DEFAULT_AVATAR,
    teamName: row.team_name ?? undefined,
    privateRevueltaTeamId: row.private_revuelta_team_id ?? undefined,
    playersNeeded: row.players_needed ?? undefined,
    playersJoined: row.players_joined,
    playersSeekProfile: parsePlayersSeekProfile(row.players_seek_profile),
    gender: row.gender,
    status: row.status,
    createdAt: new Date(row.created_at),
    finalizedAt:
      row.finalized_at != null ? new Date(row.finalized_at) : undefined,
    rivalResult: row.rival_result ?? undefined,
    casualCompleted:
      row.casual_completed === null || row.casual_completed === undefined
        ? undefined
        : row.casual_completed,
    suspendedAt: row.suspended_at ? new Date(row.suspended_at) : undefined,
    suspendedReason: row.suspended_reason ?? undefined,
    revueltaLineup:
      parseRevueltaLineup(row.revuelta_lineup) ?? undefined,
    revueltaResult: row.revuelta_result ?? undefined,
    rivalCaptainVoteChallenger: row.rival_captain_vote_challenger ?? undefined,
    rivalCaptainVoteAccepted: row.rival_captain_vote_accepted ?? undefined,
    rivalOutcomeDisputed: row.rival_outcome_disputed ?? undefined,
    matchStatsAppliedAt: row.match_stats_applied_at
      ? new Date(row.match_stats_applied_at)
      : undefined,
    sportsVenueId:
      row.sports_venue_id ??
      (resolvedSportsVenueIdForUi?.trim()
        ? resolvedSportsVenueIdForUi.trim()
        : undefined),
    venueContactPhone: venueContactPhone?.trim() || undefined,
    venueReservationId: row.venue_reservation_id ?? undefined,
    venueReservationPricing:
      venueReservation === undefined
        ? undefined
        : venueReservation === null
          ? null
          : {
              pricePerHour: venueReservation.price_per_hour,
              startsAt: new Date(venueReservation.starts_at),
              endsAt: new Date(venueReservation.ends_at),
              currency: venueReservation.currency?.trim() || 'CLP',
            },
  }
}

export { DEFAULT_AVATAR }
