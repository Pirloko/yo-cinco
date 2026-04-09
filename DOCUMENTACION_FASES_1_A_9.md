# SPORTMATCH — Documentacion integral de optimizacion (Fases 1 a 9)

Este documento consolida, en orden, todo lo implementado para reducir egress, mejorar performance, escalar la app y robustecer produccion sin cambios destructivos.

## Estado general

- Fase 1: completada
- Fase 2: completada
- Fase 3: completada
- Fase 4: completada
- Fase 5: completada
- Fase 6: completada
- Fase 7: completada
- Fase 8: completada
- Fase 9: completada

---

## FASE 1 — Configuracion critica de TanStack Query

### Objetivo
Reducir refetch innecesario y descargas repetidas por defaults agresivos.

### Implementacion
- Se creo `lib/query-defaults.ts`:
  - `QUERY_STALE_TIME_MS = 3 * 60 * 1000`
  - `QUERY_GC_TIME_MS = 20 * 60 * 1000`
- Se actualizo `lib/query-client-provider.tsx`:
  - `staleTime` global **5 min**; datos poco volátiles **15 min** (`QUERY_STALE_TIME_STATIC_MS`)
  - `gcTime` a 20 min
  - `refetchOnWindowFocus: false`
  - `refetchOnReconnect: false`
  - `retry` mantenido en queries y configurado tambien para mutations
- Se ajustaron invalidaciones:
  - `components/chat-screen.tsx`: se elimino invalidacion redundante de participantes al llegar mensajes.
- Se reforzo guia de invalidaciones en `lib/query-keys.ts`:
  - priorizar keys especificas y evitar invalidaciones globales.

### Impacto
- Menos refetch por navegacion/focus/reconnect.
- Menor egress por lecturas repetidas.

---

## FASE 2 — Reduccion de payloads (egress critico)

### Objetivo
Eliminar `select('*')` y reducir columnas/joins para bajar KB por request.

### Implementacion principal
- `lib/supabase/geo-queries.ts`:
  - selects minimos para countries, regions, cities.
  - selects minimos con embed geo para:
    - `SPORTS_VENUE_SELECT_WITH_GEO`
    - `TEAM_SELECT_WITH_GEO`
    - `MATCH_OPPORTUNITY_SELECT_WITH_GEO`
    - `PROFILE_SELECT_WITH_GEO`
- `lib/supabase/venue-queries.ts`:
  - columnas explicitas para courts, weekly hours y reservations.
- `lib/supabase/team-queries.ts`:
  - invites y join requests con columnas minimas.
- `lib/supabase/rival-challenge-queries.ts`:
  - selects minimos en challenges direct/open.
- `lib/supabase/rating-queries.ts`:
  - selects minimos para rating individual y agregados.
- `lib/supabase/venue-review-queries.ts`:
  - stats publicas con columnas minimas.
- Server/public:
  - `lib/supabase/public-venue-server.ts`: remove `*` en courts/hours.
  - `lib/supabase/public-revuelta-server.ts`: remove `*` en match list.
- Tipado robusto por embeds geo:
  - `lib/supabase/queries.ts` usa cast `unknown as` para mantener compatibilidad de mappers.

### Impacto
- Menor tamaño de respuesta en matches/teams/venues/profiles.
- Menor costo de egress y menor latencia promedio.

---

## FASE 3 — Desacople de `app-context`

### Objetivo
Separar responsabilidades del contexto global y evitar efectos secundarios amplios.

### Implementacion
- Nuevo `lib/core/auth-store.ts`:
  - reglas/auth helpers (readonly, onboarding, team limit, etc.).
- Nuevo `lib/core/navigation-store.ts`:
  - captura/limpieza de estado de navegacion (query params, deep links, session).
- Nuevo `lib/core/realtime-manager.ts`:
  - hook `usePlayerRealtimeManager` con suscripciones por dominio y flush incremental.
- Refactor de `lib/app-context.tsx`:
  - AppProvider queda como orquestador.
  - se delega auth/navigation/realtime a `lib/core/*`.

### Impacto
- Menor acoplamiento del archivo central.
- Mejor mantenibilidad y menor riesgo de regresiones.

---

## FASE 4 — Optimizacion realtime

### Objetivo
Reducir trafico realtime y evitar refetch completos por cada evento.

### Implementacion
- `components/chat-screen.tsx`:
  - `INSERT` de mensajes actualiza cache con `setQueryData`.
  - invalidacion queda solo como fallback.
- `components/match-details-screen.tsx`:
  - se elimina `event: '*'`.
  - se usa `INSERT/UPDATE/DELETE` + debounce (250 ms).
- `components/venue-dashboard-screen.tsx`:
  - se reemplaza `event: '*'` por eventos explicitos.
- `lib/core/realtime-manager.ts`:
  - filtro de cambios irrelevantes en `profiles` (`hasMeaningfulProfileDelta`).
  - evita flush/rerender en heartbeats (`last_seen_at` y similares).

### Impacto
- Menos invalidaciones y menos fan-out de red.
- Menor carga de CPU/render en cliente.

---

## FASE 5 — Server-first

### Objetivo
Mover lecturas publicas al servidor con cache para reducir carga cliente.

### Implementacion
- Nuevo `lib/supabase/public-player-server.ts`:
  - fetch server con `unstable_cache` para perfil publico.
- Nueva API `app/api/public-player-profile/route.ts`:
  - endpoint cacheado para perfil publico.
- Caching server en snapshots publicos:
  - `lib/supabase/public-team-server.ts`
  - `lib/supabase/public-revuelta-server.ts`
  - `lib/supabase/public-venue-server.ts`
- ISR en paginas publicas:
  - `app/centro/[venueId]/page.tsx`
  - `app/equipo/[teamId]/page.tsx`
  - `app/revuelta/[opportunityId]/page.tsx`
- `components/public-player-profile-sheet.tsx`:
  - deja de consultar Supabase directo y consume API server.

### Impacto
- Menos requests desde el cliente.
- Mejor TTFB/cachabilidad en vistas publicas.

---

## FASE 6 — Cache avanzado

### Objetivo
Unificar estrategia server/client cache y evitar descargas duplicadas.

### Implementacion
- Nuevo `lib/cache-policy.ts`:
  - `publicStatic = 300`
  - `publicDynamic = 60`
  - `CLIENT_PROFILE_CACHE_TTL_MS = 60_000`
- Reemplazo de TTL hardcodeado por politica central en rutas/fetchers publicos.
- API perfil publico con `Cache-Control` explicito.
- Nuevo `lib/public-player-prefetch.ts`:
  - prefetch con dedupe de requests en vuelo.
- Integracion de prefetch en:
  - `components/chat-screen.tsx`
  - `components/match-details-screen.tsx`
- Cache local en `components/public-player-profile-sheet.tsx` con TTL.

### Impacto
- Menos refetch repetido de perfiles publicos.
- Menor egress en lectura recurrente.

---

## FASE 7 — Capa de servicios

### Objetivo
Centralizar logica de carga y negocio para reducir duplicacion.

### Implementacion
- Nuevo `lib/services/`:
  - `match.service.ts`
  - `team.service.ts`
  - `user.service.ts`
  - `venue.service.ts`
- Orquestadores agregados:
  - `loadPlayerMatchBundle`
  - `loadPlayerTeamBundle`
  - `loadPlayerTeamsAndInvites`
  - `loadOtherPlayersForUser`
  - `loadVenueForOwner`
  - `saveTeamPrivateSettings`
- `lib/core/realtime-manager.ts` migra a servicios.
- `lib/app-context.tsx` migra bootstrap/refreshes/guardados a servicios.

### Impacto
- `app-context` mas enfocado en estado/UI.
- Menor drift entre flujos y reutilizacion de logica.

---

## FASE 8 — Optimizacion de render

### Objetivo
Reducir renders innecesarios en pantallas de alto trafico.

### Implementacion
- `components/chat-screen.tsx`:
  - `useMemo/useCallback` en derivados y handlers clave.
  - extraccion memoizada de filas (`ParticipantRow`, `MessageRow`).
- `components/match-details-screen.tsx`:
  - memoizacion de derivados y callbacks.
  - `StatBox` y `ParticipantListItem` memoizados.
- `components/matches-screen.tsx`:
  - metadatos de tipo consolidados en constante estable.
  - callbacks estabilizados.
  - memo en `SoloReserveHubCard`, `UpcomingVenueWhatsappCta`, `TabButton`, `EmptyState`.
- `components/revuelta-teams-panel.tsx`:
  - memo en `JerseyBadge`, derivados memoizados y callback estable.
- `components/explore-screen.tsx`:
  - callbacks estabilizados (`goToQuickCreate`, `clearSearch`).

### Impacto
- Menor costo por render en listas y tabs.
- Menos churn de props/callbacks y reconciliacion.

---

## FASE 9 — Produccion real

### Objetivo
Agregar observabilidad, consistencia de errores y control de abuso en API.

### Implementacion
- Nuevo `lib/server/api-utils.ts`:
  - contexto de request
  - logs estructurados JSON
  - helpers de respuesta uniforme
  - rate limiting en memoria por bucket+IP
  - reporter opcional de errores a Sentry (`SENTRY_DSN`)
- Endpoints endurecidos:
  - `app/api/public-player-profile/route.ts`
  - `app/api/admin/geo/route.ts`
  - `app/api/admin/metrics/route.ts`
  - `app/api/admin/venues/route.ts`
- Estandar aplicado:
  - respuestas con `ok`, `requestId`, `error`, `code`
  - logs `info/warn/error` en eventos clave
  - `429` + `Retry-After` en exceso de solicitudes
  - reporte opcional de excepciones

### Impacto
- Mejor trazabilidad operativa.
- Menor riesgo ante picos o abuso.
- Contrato de error consistente para frontend/soporte.

---

## Validacion tecnica acumulada

- TypeScript: `./node_modules/.bin/tsc --noEmit` en cada bloque importante.
- Build producción: `./node_modules/.bin/next build` validado tras cambios críticos.
- Linter: sin errores introducidos en archivos modificados.
- Compatibilidad: se mantuvieron flujos existentes sin cambios destructivos.

---

## Nota de deploy importante (Next 16)

Se corrigio un fallo de build por segment config invalida:
- `revalidate` en app routes/pages debe exportarse como literal estatico.
- Se reemplazaron exports basados en constantes importadas por literales en:
  - `app/centro/[venueId]/page.tsx`
  - `app/equipo/[teamId]/page.tsx`
  - `app/revuelta/[opportunityId]/page.tsx`
  - `app/api/public-player-profile/route.ts`

---

## Resultado final

Con las 9 fases implementadas, SPORTMATCH queda con:
- menor egress y menos refetch redundante
- payloads mas eficientes
- arquitectura mas mantenible (core + services)
- realtime optimizado
- estrategia server/cache consolidada
- render mas eficiente en pantallas de alto uso
- base productiva con logging, errores consistentes y rate limiting

