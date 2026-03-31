import type { RevueltaLineup } from '@/lib/revuelta-lineup'

export type Gender = 'male' | 'female'

export type Position = 'portero' | 'defensa' | 'mediocampista' | 'delantero'

export type Level = 'principiante' | 'intermedio' | 'avanzado' | 'competitivo'

export type MatchType = 'rival' | 'players' | 'open'

/** Búsqueda de jugadores: qué cupos ofrece el organizador. */
export type PlayersSeekProfile =
  | 'gk_only'
  | 'field_only'
  | 'gk_and_field'

export type MatchStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'

export type { RevueltaLineup }

/** Pestañas de la pantalla Partidos (hub). */
export type MatchesHubTab = 'upcoming' | 'chats' | 'finished'

/** Resultado en partidos tipo rival (equipo del creador vs rival). */
export type RivalResult = 'creator_team' | 'rival_team' | 'draw'

/** Resultado en revuelta (equipos A/B tras sorteo). */
export type RevueltaResult = 'team_a' | 'team_b' | 'draw'

export type AccountType = 'player' | 'venue' | 'admin'

/** Catálogo geo (tablas `geo_*`). */
export interface GeoCountry {
  id: string
  isoCode: string
  name: string
  isActive: boolean
}

export interface GeoRegion {
  id: string
  countryId: string
  code: string
  name: string
  isActive: boolean
}

export interface GeoCity {
  id: string
  regionId: string
  name: string
  slug: string
  isActive: boolean
}

export interface User {
  id: string
  email: string
  name: string
  age: number
  gender: Gender
  position: Position
  level: Level
  /** FK `profiles.city_id` (filtros / lógica). */
  cityId: string
  /** Nombre para mostrar (viene del catálogo o columna `city` legada). */
  city: string
  /** Región de `geo_cities.region_id` según la ciudad del perfil (filtros regionales). */
  regionId?: string
  availability: string[]
  photo: string
  bio?: string
  whatsappPhone?: string
  /** Confirmación de WhatsApp + género (OAuth debe pasar por onboarding). */
  playerEssentialsCompletedAt?: Date
  /** Estadísticas acumuladas (BD). */
  statsPlayerWins?: number
  statsPlayerDraws?: number
  statsPlayerLosses?: number
  /** Partidos organizados y cerrados como jugados (no suspendidos). */
  statsOrganizedCompleted?: number
  /** Victorias del equipo del organizador al organizar. */
  statsOrganizerWins?: number
  createdAt: Date
  /** Por defecto jugador; `venue` solo vía administración en Supabase. */
  accountType?: AccountType
}

export interface SportsVenue {
  id: string
  ownerId: string
  name: string
  address: string
  mapsUrl: string | null
  phone: string
  cityId: string
  city: string
  slotDurationMinutes: number
  createdAt: Date
}

export interface VenueCourt {
  id: string
  venueId: string
  name: string
  sortOrder: number
  /** Precio por hora en CLP (opcional). */
  pricePerHour?: number | null
}

export interface VenueWeeklyHour {
  id: string
  venueId: string
  /** 0 = domingo … 6 = sábado. */
  dayOfWeek: number
  openTime: string
  closeTime: string
}

export interface VenueReservationRow {
  id: string
  courtId: string
  startsAt: Date
  endsAt: Date
  bookerUserId: string | null
  matchOpportunityId: string | null
  status: 'pending' | 'confirmed' | 'cancelled'
  paymentStatus?: 'unpaid' | 'deposit_paid' | 'paid'
  pricePerHour?: number | null
  currency?: string
  depositAmount?: number | null
  paidAmount?: number | null
  confirmedAt?: Date | null
  cancelledAt?: Date | null
  cancelledReason?: string | null
  confirmedByUserId?: string | null
  confirmationSource?: 'venue_owner' | 'booker_self' | 'admin' | null
  confirmationNote?: string | null
  notes?: string | null
}

export interface TeamMember {
  id: string
  name: string
  position: Position
  photo: string
  status: 'confirmed' | 'pending' | 'invited'
}

export interface Team {
  id: string
  name: string
  logo?: string
  level: Level
  captainId: string
  members: TeamMember[]
  cityId: string
  city: string
  /** Región de la ciudad del equipo (`geo_cities.region_id`), fija al crear el equipo. */
  cityRegionId?: string
  gender: Gender
  description?: string
  /** Partidos rival finalizados (BD). */
  statsWins?: number
  statsDraws?: number
  statsLosses?: number
  statsWinStreak?: number
  statsLossStreak?: number
  createdAt: Date
}

/** Solo lectura para miembros vía tabla `team_private_settings` (RLS). */
export interface TeamPrivateSettings {
  teamId: string
  whatsappInviteUrl: string | null
  rulesText: string | null
}

export interface TeamInvite {
  id: string
  teamId: string
  teamName: string
  inviterId: string
  inviterName: string
  inviteeId: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: Date
}

/** Jugador solicita unirse; el capitán acepta o rechaza. */
export interface TeamJoinRequest {
  id: string
  teamId: string
  teamName: string
  requesterId: string
  requesterName: string
  requesterPhoto: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: Date
}

export type RivalChallengeMode = 'direct' | 'open'
export type RivalChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

export interface RivalChallenge {
  id: string
  opportunityId: string
  opportunityTitle: string
  mode: RivalChallengeMode
  status: RivalChallengeStatus
  challengerTeamId: string
  challengerTeamName: string
  challengerCaptainId: string
  challengedTeamId?: string
  challengedTeamName?: string
  challengedCaptainId?: string
  acceptedTeamId?: string
  acceptedTeamName?: string
  acceptedCaptainId?: string
  createdAt: Date
  respondedAt?: Date
}

export interface MatchOpportunity {
  id: string
  type: MatchType
  title: string
  description?: string
  /** FK `match_opportunities.city_id`. */
  cityId: string
  /** Región de la ciudad del partido (`geo_cities.region_id`). */
  cityRegionId?: string
  location: string
  venue: string
  /** Centro deportivo vinculado (opcional). */
  sportsVenueId?: string
  venueReservationId?: string
  dateTime: Date
  level: Level
  creatorId: string
  creatorName: string
  creatorPhoto: string
  teamName?: string
  playersNeeded?: number
  playersJoined?: number
  /** Solo type players: cupos (arquero / campo / ambos). */
  playersSeekProfile?: PlayersSeekProfile
  gender: Gender
  status: MatchStatus
  createdAt: Date
  /** Snapshot de la reserva de cancha (si existe) para total y reparto. */
  venueReservationPricing?: {
    pricePerHour: number | null
    startsAt: Date
    endsAt: Date
    currency: string
  } | null
  /** Cuando el organizador cerró el partido (inicio ventana 48 h para calificar). */
  finalizedAt?: Date
  rivalResult?: RivalResult
  /** Partidos players/open: marcado como jugado sin marcador de equipos. */
  casualCompleted?: boolean
  /** Suspensión/cancelación por organizador con motivo. */
  suspendedAt?: Date
  suspendedReason?: string
  /** Revuelta: equipos A/B tras sorteo del organizador. */
  revueltaLineup?: RevueltaLineup
  /** Revuelta: resultado al cerrar (equipo ganador o empate). */
  revueltaResult?: RevueltaResult
  /** Voto capitán equipo retador (rival). */
  rivalCaptainVoteChallenger?: RivalResult
  /** Voto capitán equipo aceptado (rival). */
  rivalCaptainVoteAccepted?: RivalResult
  /** Capitanes no coinciden; falta desempate del organizador tras plazo. */
  rivalOutcomeDisputed?: boolean
  /** Evita doble conteo de stats (solo lectura). */
  matchStatsAppliedAt?: Date
}

export interface Match {
  id: string
  opportunityId: string
  participants: string[]
  status: MatchStatus
  createdAt: Date
}

export interface Message {
  id: string
  matchId: string
  senderId: string
  content: string
  createdAt: Date
}

export interface OnboardingData {
  name: string
  age: number
  gender: Gender
  whatsappPhone: string
  position: Position
  level: Level
  availability: string[]
  /** Nombre legible (columna `city`). */
  city: string
  /** FK `geo_cities.id`. */
  cityId: string
  photo: string
}

/** Primer alta del centro en la app (crea `sports_venues`). */
export interface VenueOnboardingData {
  name: string
  address: string
  phone: string
  city: string
  cityId: string
  mapsUrl: string | null
  slotDurationMinutes: number
}
