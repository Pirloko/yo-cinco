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

export interface User {
  id: string
  email: string
  name: string
  age: number
  gender: Gender
  position: Position
  level: Level
  city: string
  availability: string[]
  photo: string
  bio?: string
  createdAt: Date
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
  city: string
  gender: Gender
  description?: string
  createdAt: Date
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
  location: string
  venue: string
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
  position: Position
  level: Level
  availability: string[]
  city: string
  photo: string
}
