/**
 * Claves centralizadas de TanStack Query para fetch/invalidación consistentes.
 * Preferir claves específicas (p. ej. `participants(id)`) frente a `.all` para no
 * disparar refetch masivos; el prefijo `.all` solo cuando realmente afecte todo el dominio.
 */

export const queryKeyRoot = {
  geo: ['geo'] as const,
  venueCentro: ['venueCentro'] as const,
  sportsVenue: ['sportsVenue'] as const,
  matchOpportunity: ['matchOpportunity'] as const,
  profile: ['profile'] as const,
  /** Perfil público vía /api/public-player-profile (Fase 6 — prefetch + sheet comparten clave). */
  publicPlayer: ['publicPlayer'] as const,
  matchesHub: ['matchesHub'] as const,
  chat: ['chat'] as const,
  explore: ['explore'] as const,
  teams: ['teams'] as const,
  create: ['create'] as const,
  venueDashboard: ['venueDashboard'] as const,
  venueBi: ['venueBi'] as const,
} as const

/** Clave estable para listas de ids en queryKey (orden + dedupe). */
export function stableIdsKey(ids: string[]): string {
  if (ids.length === 0) return ''
  return [...new Set(ids)].sort().join(',')
}

export const queryKeys = {
  geo: {
    all: queryKeyRoot.geo,
    citiesWithVenuesInRegion: (regionId: string | null | undefined) =>
      [...queryKeyRoot.geo, 'citiesWithVenuesInRegion', regionId] as const,
  },
  venueCentro: {
    all: queryKeyRoot.venueCentro,
    publicReservationsForDay: (venueId: string, dayStr: string) =>
      [...queryKeyRoot.venueCentro, 'publicReservationsForDay', venueId, dayStr] as const,
  },
  sportsVenue: {
    all: queryKeyRoot.sportsVenue,
    contact: (sportsVenueId: string) =>
      [...queryKeyRoot.sportsVenue, 'contact', sportsVenueId] as const,
  },
  matchOpportunity: {
    all: queryKeyRoot.matchOpportunity,
    participants: (opportunityId: string | null | undefined) =>
      [...queryKeyRoot.matchOpportunity, 'participants', opportunityId] as const,
    /** Motivos de salida: solo organizador o admin (RPC). */
    participantLeaveReasons: (opportunityId: string | null | undefined) =>
      [
        ...queryKeyRoot.matchOpportunity,
        'participantLeaveReasons',
        opportunityId,
      ] as const,
    ratingsOverview: (opportunityId: string | null | undefined) =>
      [...queryKeyRoot.matchOpportunity, 'ratingsOverview', opportunityId] as const,
    myRating: (
      opportunityId: string | null | undefined,
      userId: string | null | undefined
    ) =>
      [...queryKeyRoot.matchOpportunity, 'myRating', opportunityId, userId] as const,
    /** Fase 4: summary + comentarios recientes + mi reseña (detalle de partido). */
    ratingsSession: (
      opportunityId: string | null | undefined,
      userId: string | null | undefined
    ) =>
      [
        ...queryKeyRoot.matchOpportunity,
        'ratingsSession',
        opportunityId,
        userId,
      ] as const,
    venueReservation: (reservationId: string | null | undefined) =>
      [...queryKeyRoot.matchOpportunity, 'venueReservation', reservationId] as const,
    revueltaExternalJoin: (
      opportunityId: string | null | undefined,
      userId: string | null | undefined
    ) =>
      [
        ...queryKeyRoot.matchOpportunity,
        'revueltaExternalJoin',
        opportunityId,
        userId,
      ] as const,
  },
  profile: {
    all: queryKeyRoot.profile,
    organizerCompletedCount: (userId: string | null | undefined) =>
      [...queryKeyRoot.profile, 'organizerCompletedCount', userId] as const,
  },
  publicPlayer: {
    all: queryKeyRoot.publicPlayer,
    detail: (userId: string) =>
      [...queryKeyRoot.publicPlayer, 'detail', userId] as const,
  },
  matchesHub: {
    all: queryKeyRoot.matchesHub,
    soloVenueReservations: (userId: string | null | undefined) =>
      [...queryKeyRoot.matchesHub, 'soloVenueReservations', userId ?? ''] as const,
    invitedOpportunityIds: (userId: string | null | undefined) =>
      [...queryKeyRoot.matchesHub, 'invitedOpportunityIds', userId ?? ''] as const,
    lastMessages: (opportunityIdsKey: string) =>
      [...queryKeyRoot.matchesHub, 'lastMessages', opportunityIdsKey] as const,
    ratingSummaries: (opportunityIdsKey: string) =>
      [...queryKeyRoot.matchesHub, 'ratingSummaries', opportunityIdsKey] as const,
    venueReviewsByReservations: (reservationIdsKey: string) =>
      [
        ...queryKeyRoot.matchesHub,
        'venueReviewsByReservations',
        reservationIdsKey,
      ] as const,
    /** Fase 4: reseñas de partidos + últimos mensajes + reseñas de reservas solo (una query). */
    secondaryBundle: (signature: string) =>
      [...queryKeyRoot.matchesHub, 'secondaryBundle', signature] as const,
  },
  chat: {
    all: queryKeyRoot.chat,
    messages: (opportunityId: string, userId: string) =>
      [...queryKeyRoot.chat, 'messages', opportunityId, userId] as const,
  },
  explore: {
    all: queryKeyRoot.explore,
    publicVenues: (regionId: string | null | undefined) =>
      [...queryKeyRoot.explore, 'publicVenues', regionId ?? 'all'] as const,
    venueAvailabilityGrid: (venueIdsKey: string, horizonDays: number) =>
      [...queryKeyRoot.explore, 'availability', venueIdsKey, horizonDays] as const,
  },
  teams: {
    all: queryKeyRoot.teams,
    privateSettings: (
      teamId: string | null | undefined,
      userId: string | null | undefined
    ) =>
      [...queryKeyRoot.teams, 'privateSettings', teamId ?? '', userId ?? ''] as const,
  },
  create: {
    all: queryKeyRoot.create,
    sportsVenuesForPlayer: (
      regionId: string | null | undefined,
      cityId: string | null | undefined
    ) =>
      [
        ...queryKeyRoot.create,
        'sportsVenuesForPlayer',
        regionId ?? '',
        cityId ?? '',
      ] as const,
    venueCourts: (venueId: string | null | undefined) =>
      [...queryKeyRoot.create, 'venueCourts', venueId ?? ''] as const,
    venueDaySlots: (
      venueId: string | null | undefined,
      date: string,
      refreshKey: number,
      slotDurationHint: number
    ) =>
      [
        ...queryKeyRoot.create,
        'venueDaySlots',
        venueId ?? '',
        date,
        refreshKey,
        slotDurationHint,
      ] as const,
    alternativeVenuesAtTime: (
      candidateIdsKey: string,
      excludeVenueId: string,
      date: string,
      time: string
    ) =>
      [
        ...queryKeyRoot.create,
        'alternativeVenuesAtTime',
        candidateIdsKey,
        excludeVenueId,
        date,
        time,
      ] as const,
  },
  venueDashboard: {
    all: queryKeyRoot.venueDashboard,
    ownerBundle: (ownerId: string | null | undefined) =>
      [...queryKeyRoot.venueDashboard, 'ownerBundle', ownerId ?? ''] as const,
  },
  venueBi: {
    all: queryKeyRoot.venueBi,
    snapshot: (
      venueId: string | null | undefined,
      fromIso: string,
      toIso: string,
      timezone: string
    ) =>
      [
        ...queryKeyRoot.venueBi,
        'snapshot',
        venueId ?? '',
        fromIso,
        toIso,
        timezone,
      ] as const,
    incomeSeries: (
      venueId: string | null | undefined,
      fromIso: string,
      toIso: string,
      timezone: string
    ) =>
      [
        ...queryKeyRoot.venueBi,
        'incomeSeries',
        venueId ?? '',
        fromIso,
        toIso,
        timezone,
      ] as const,
    courtsBreakdown: (
      venueId: string | null | undefined,
      fromIso: string,
      toIso: string
    ) =>
      [...queryKeyRoot.venueBi, 'courtsBreakdown', venueId ?? '', fromIso, toIso] as const,
  },
} as const
