# SPORTMATCH — Optimización de egress/performance (por fases)

Este documento resume lo avanzado hasta el momento para reducir tráfico de red (egress), refetch innecesario y mejorar rendimiento/escala en SPORTMATCH (Next.js 16, React 19, Supabase, TanStack Query).

## Contexto del problema

- **Síntoma**: consumo alto de red y cached egress, refetch frecuentes, payloads grandes.
- **Causas típicas**:
  - Defaults de TanStack Query muy agresivos para refetch (staleTime corto y refetch por focus/reconnect).
  - Invalidaciones redundantes (especialmente con realtime).
  - Consultas a Supabase con `select('*')` o selects “anchos” (incluyendo columnas no usadas).
  - Lógica client-heavy que hace muchas llamadas por pantalla.

---

## Hotfix previo: redeploy fallido en Vercel (CI)

**Problema**
- Vercel detectó `pnpm-lock.yaml` y usó pnpm en CI con `frozen-lockfile`.
- `package.json` incluía nuevas dependencias (`@tanstack/react-query` y `@tanstack/react-query-devtools`) que **no estaban reflejadas** en `pnpm-lock.yaml`.
- Resultado: `ERR_PNPM_OUTDATED_LOCKFILE`.

**Solución aplicada**
- Se ejecutó instalación para **actualizar `pnpm-lock.yaml`** y luego se verificó `pnpm install --frozen-lockfile`.
- Se commiteó y pusheó el lockfile actualizado.

**Impacto**
- Deploy en Vercel vuelve a ser determinístico (CI no se rompe por lockfile desfasado).

---

## FASE 1 — Configuración crítica de TanStack Query (impacto inmediato)

### Objetivo
Reducir descargas repetidas de datos y refetch innecesario tras navegación/focus/reconnect.

### Cambios implementados

#### 1) Defaults globales centralizados

- Archivo nuevo: `lib/query-defaults.ts`
  - `QUERY_STALE_TIME_MS = 3 min` (rango objetivo 2–5 min)
  - `QUERY_GC_TIME_MS = 20 min` (rango objetivo 10–30 min)

- Ajuste en `lib/query-client-provider.tsx`:
  - `staleTime`: **30s → 3min**
  - `gcTime`: **10min → 20min**
  - `refetchOnWindowFocus`: **false** (se mantiene)
  - `refetchOnReconnect`: **true (default) → false**
  - `retry`: **1** (se mantiene)
  - `mutations.retry`: **1** (default)

**Resultado esperado**
- Al navegar entre pantallas, mientras la data esté fresca (3 min), **no se refetchea** solo por remontar.
- Al volver a enfocar la ventana o reconectar, no se disparan refetch automáticos.

#### 2) Invalidaciones más específicas (reducción de refetch)

- Ajuste en `components/chat-screen.tsx`:
  - En realtime de `messages` (INSERT), se eliminó la invalidación de `matchOpportunity.participants`.
  - Motivo: un mensaje nuevo **no cambia** participantes, por lo que ese refetch era redundante.

#### 3) Guía de invalidación (documentación)

- Se mejoró el comentario en `lib/query-keys.ts` para enfatizar:
  - **Preferir claves específicas**.
  - Reservar `.all` solo cuando sea estrictamente necesario.

### Verificación
- Lints sin errores en archivos tocados.
- `tsc --noEmit` OK.

---

## Próximo: FASE 2 — Reducción de payloads (egress crítico)

### Objetivo
Reducir KB transferidos por request auditando consultas a Supabase:

- Detectar `select('*')`, joins innecesarios y campos no usados.
- Migrar a **selección mínima de columnas**.
- Mantener compatibilidad y shapes esperadas por UI.

### Alcance inmediato (primer barrido)
- `lib/supabase/geo-queries.ts`
- `lib/supabase/venue-queries.ts`
- `lib/supabase/team-queries.ts`
- `lib/supabase/rival-challenge-queries.ts`
- `lib/supabase/rating-queries.ts`
- SSR público: `lib/supabase/public-venue-server.ts`, `lib/supabase/public-revuelta-server.ts`

### Estrategia
- Cambios “quirúrgicos”: reemplazar `select('*')` por columnas estrictamente utilizadas por los mapeos actuales.
- Mantener los `mapXRow(...)` y tipos de retorno para no romper pantallas.
- Medir después: menos bytes por respuesta y menor cached egress.

## FASE 2 — Avance (punto 1: Venues)

### Reducción de payload en `sports_venues`

Se optimizó `SPORTS_VENUE_SELECT_WITH_GEO` en `lib/supabase/geo-queries.ts` para eliminar `*` y traer solo:

- `id, owner_id, name, address, maps_url, phone, city_id, city, is_paused, slot_duration_minutes, created_at`
- embed `geo_city:geo_cities!city_id(id,name,slug,region_id)`

**Cobertura:** impacta todas las lecturas de venues en:
- `lib/supabase/venue-queries.ts` (listados + por región/ciudad + por id/owner)
- `lib/supabase/public-venue-server.ts` (SSR público)

**Motivo:** `mapVenueRow(...)` solo consume esas columnas; todo lo demás era egress innecesario.

## FASE 2 — Avance (punto 2: Teams)

### Reducción de payload en `teams`

Se optimizó `TEAM_SELECT_WITH_GEO` en `lib/supabase/geo-queries.ts` para eliminar `*` y traer solo:

- `id, name, logo_url, level, captain_id, vice_captain_id, city_id, city, gender, description`
- stats: `stats_wins, stats_draws, stats_losses, stats_win_streak, stats_loss_streak`
- `created_at`
- embed `geo_city:geo_cities!city_id(id,name,slug,region_id)`

**Cobertura:** impacta lecturas de equipos en:
- `lib/supabase/team-queries.ts` (listado de equipos)
- `lib/supabase/public-team-server.ts` (SSR público de `/equipo/[id]`)

**Motivo:** `mapTeamRow(...)` y `mapSnapshot(...)` usan solo esas columnas.

## FASE 2 — Avance (punto 3: Match opportunities)

### Reducción de payload en `match_opportunities`

Se optimizó `MATCH_OPPORTUNITY_SELECT_WITH_GEO` en `lib/supabase/geo-queries.ts` para eliminar `*` y traer únicamente las columnas que consume `MatchOpportunityRow` + `mapMatchOpportunityFromDb(...)`:

- Identidad/geo: `id, city_id` + embed `geo_city:geo_cities!city_id(id,name,slug,region_id)`
- Información pública: `type, title, description, location, venue, date_time, level, gender, status, created_at`
- Relaciones: `creator_id, team_name, sports_venue_id, venue_reservation_id, private_revuelta_team_id`
- Cupos: `players_needed, players_joined, players_seek_profile`
- Cierre/resultados/moderación: `finalized_at, rival_result, casual_completed, suspended_at, suspended_reason, revuelta_lineup, revuelta_result`
- Votos/disputa/stats: `rival_captain_vote_challenger, rival_captain_vote_accepted, rival_outcome_disputed, match_stats_applied_at`

**Cobertura:** impacta el feed/listado principal de partidos en `lib/supabase/queries.ts` (`fetchMatchOpportunities`).

**Nota técnica:** el tipado de embeds de Supabase a veces representa `geo_city` como array; se mantuvo un cast explícito a `MatchOpportunityRow` para no cambiar el mapper y preservar compatibilidad.

## FASE 2 — Avance (punto 4: Profiles)

### Reducción de payload en `profiles`

Se optimizó `PROFILE_SELECT_WITH_GEO` en `lib/supabase/geo-queries.ts` para eliminar `*` y traer solo las columnas que consume `profileRowToUser(...)`:

- Identidad/geo: `id, city, city_id` + embed `geo_city:geo_cities!city_id(id,name,slug,region_id)`
- Perfil jugador: `name, age, birth_date, gender, position, level, availability, photo_url, bio, whatsapp_phone, player_essentials_completed_at`
- Stats: `stats_player_wins, stats_player_draws, stats_player_losses, stats_organized_completed, stats_organizer_wins`
- Moderación: `mod_yellow_cards, mod_red_cards, mod_suspended_until, mod_banned_at, mod_ban_reason, mod_last_yellow_at, mod_last_red_at`
- Meta: `created_at, account_type`

**Cobertura:** impacta:
- `fetchProfileForUser` y `fetchOtherProfiles` en `lib/supabase/queries.ts`

**Nota técnica:** igual que en otras tablas con embeds, el tipado de Supabase puede exponer `geo_city` como array; se reforzó el cast `unknown as ProfileRow` para mantener el mapper sin cambios.

## FASE 3 — Desacoplar `app-context` (avance inicial)

### Objetivo
Reducir responsabilidades globales de `lib/app-context.tsx` manteniendo `AppProvider` como orquestador.

### Cambios aplicados

- Se creo `lib/core/auth-store.ts` con utilidades de dominio auth/moderacion:
  - `getAuthUserEmail`
  - `isUserReadOnly`
  - `toastReadOnly`
  - `needsOnboardingProfile`
  - `isTeamLimitReached`
  - `toastTeamLimitReached`

- Se creo `lib/core/navigation-store.ts` para encapsular estado transitorio de navegacion:
  - `clearSessionNavigationState`
  - `captureInviteParamsFromUrl`

- Se creo `lib/core/realtime-manager.ts` con hook dedicado:
  - `usePlayerRealtimeManager(...)`
  - Centraliza suscripciones realtime por dominio (match/team/users), debounce y flush incremental.

- `lib/app-context.tsx` ahora:
  - importa y reutiliza modulos `lib/core/*`
  - delega el bloque realtime al hook `usePlayerRealtimeManager`
  - delega limpieza/captura de estado de navegacion a `navigation-store`
  - mantiene `AppProvider` como capa orquestadora de estado y acciones.

### Verificacion
- `tsc --noEmit` OK
- lints en archivos tocados: OK

## FASE 7 — Completada (capa de servicios)

### Objetivo
Separar orquestacion de datos y reglas de carga fuera de `app-context`/realtime para centralizar logica y reducir duplicacion.

### Cambios implementados

- Nueva capa `lib/services/`:
  - `match.service.ts`
  - `team.service.ts`
  - `user.service.ts`
  - `venue.service.ts`

- Se movio la orquestacion de bundles de datos de jugador:
  - `loadPlayerMatchBundle(...)` centraliza `matchOpportunities + participatingOpportunityIds + rivalChallenges`
  - `loadPlayerTeamBundle(...)` centraliza `teams + teamInvites + teamJoinRequests`
  - `loadOtherPlayersForUser(...)` centraliza carga de perfiles de jugadores
  - `loadVenueForOwner(...)` centraliza carga de venue por owner

- Integracion en `lib/core/realtime-manager.ts`:
  - flush incremental ahora consume servicios (`match/team/user`) en lugar de orquestar queries directas
  - mantiene debounce/throttle y comportamiento previo

- Integracion completa de orquestacion en `lib/app-context.tsx`:
  - bootstrap de estado de jugador (signin + initial session) migrado a servicios
  - refresh de matches/participaciones/desafios migrado a servicios (`loadPlayerMatchBundle`, `fetchLatestMatchOpportunities`)
  - refresh de teams/invites/join-requests migrado a servicios (`loadPlayerTeamBundle`, `loadPlayerTeamsAndInvites`, `fetchLatestTeamInvitesForUser`, `fetchLatestTeamJoinRequestsForUser`, `fetchLatestTeams`)
  - flujo de venue owner migrado a `loadVenueForOwner`
  - perfil de usuario para auth/bootstrap migrado a `loadProfileForUser`
  - guardado de coordinacion privada de equipo migrado a servicio (`saveTeamPrivateSettings`)

### Impacto consolidado

- Menor acoplamiento de `app-context` con Supabase query layer.
- Reutilizacion de carga por dominio (menos duplicacion y menor riesgo de drift).
- `app-context` queda mas enfocado en estado/UI y menos en detalles de acceso a datos.
- Se completa la meta de Fase 7 sin cambios destructivos.

### Verificacion
- `./node_modules/.bin/tsc --noEmit` OK
- lints en archivos tocados: OK

## FASE 9 — Completada (produccion real)

### Objetivo
Agregar hardening productivo en API: logging estructurado, manejo de errores consistente, limitacion de tasa y base para observabilidad externa.

### Cambios implementados

- Nueva utilidad central `lib/server/api-utils.ts`:
  - `createApiContext(req)` con `requestId`, `method`, `path`, `ip`, `userAgent`.
  - `apiLog(level, event, ctx, meta)` para logs JSON estructurados.
  - `successJson(...)` y `errorJson(...)` para respuestas API homogéneas.
  - `checkRateLimit(...)` con rate limiting en memoria por IP + bucket.
  - `reportServerError(...)` con integración opcional a Sentry (`SENTRY_DSN`) sin forzar dependencia.

- Endpoints endurecidos:
  - `app/api/public-player-profile/route.ts`
  - `app/api/presence/route.ts`
  - `app/api/admin/geo/route.ts` (GET/POST)
  - `app/api/admin/metrics/route.ts`
  - `app/api/admin/venues/route.ts`

- Mejoras aplicadas en esos endpoints:
  - Respuesta uniforme con `ok`, `error/code`, `requestId`.
  - Eventos relevantes con logging estructurado (`info/warn/error`).
  - Rate limiting por ruta sensible con `429` y header `Retry-After`.
  - Captura opcional de excepciones a Sentry cuando haya `SENTRY_DSN`.

### Impacto consolidado

- Mayor estabilidad operativa y mejor trazabilidad en incidentes.
- Menor riesgo de abuso/spikes en rutas críticas de API.
- Contrato de error consistente para frontend y soporte.

### Verificacion
- `./node_modules/.bin/tsc --noEmit` OK
- `./node_modules/.bin/next build` OK
- lints en archivos tocados: OK

## FASE 8 — Completada (optimizacion de render)

### Objetivo
Reducir renders innecesarios en pantallas de alto uso y estabilizar props/callbacks en componentes pesados.

### Cambios implementados

- `components/chat-screen.tsx`
  - `opportunity` y `chatMessagingOpen` memoizados con `useMemo`.
  - handlers principales estabilizados con `useCallback`:
    - `handleSend`
    - `handleKeyDown`
    - `goBack`
    - `openMatchDetails`
    - `toggleInfo`
    - `openParticipantProfile`
  - Se evita recrear parte de callbacks inline en UI de participantes y header.
  - Se extrajeron filas pesadas memoizadas:
    - `ParticipantRow`
    - `MessageRow`

- `components/match-details-screen.tsx`
  - `opportunity` memoizado con `useMemo`.
  - handlers estabilizados con `useCallback`:
    - `goBack`
    - `openChat`
    - `handleSelfConfirmReservation`
    - `openParticipantProfile`
    - `reloadMyRating`
  - `contactWaHref` movido a `useMemo` para evitar recomputo string/URL costoso en cada render.
  - `StatBox` convertido a `memo(...)` para evitar rerenders cuando sus props no cambian.
  - Se extrajo y memoizo fila de participantes (`ParticipantListItem`) para reducir rerenders por item.

- `components/matches-screen.tsx`
  - Se consolidaron metadatos de tipo de partido en constantes estables (`MATCH_TYPE_META`) para evitar recreacion por render.
  - Callbacks de navegacion estabilizados con `useCallback` (`openChat`, `openDetails`).
  - Componentes reutilizables memoizados:
    - `SoloReserveHubCard`
    - `UpcomingVenueWhatsappCta`
    - `TabButton`
    - `EmptyState`

- `components/revuelta-teams-panel.tsx`
  - `JerseyBadge` memoizado.
  - Derivados de participantes (`joinedParticipants`, `gkCount`) memoizados.
  - `handleRandomize` estabilizado con `useCallback`.

- `components/explore-screen.tsx`
  - `goToQuickCreate` y `clearSearch` estabilizados con `useCallback`.

### Impacto consolidado

- Menor churn de render en pantallas de chat/detalle.
- Menos recreacion de funciones pasadas como props.
- Menor costo de render por elemento en listas largas de chat/participantes.
- Menor trabajo de reconciliacion en tabs de Partidos (proximos/chats/finalizados).
- Fase 8 cerrada sin cambios funcionales ni regresiones de flujo.

### Verificacion
- `./node_modules/.bin/tsc --noEmit` OK
- lints en archivos tocados: OK

## FASE 3 — Completada

Se finalizo el desacople principal de `app-context` sin cambios destructivos y manteniendo compatibilidad.

### Resultado final

- `AppProvider` sigue como **orquestador** de estado y acciones.
- Se separaron responsabilidades en `lib/core/`:
  - `auth-store.ts`: reglas/utilidades de auth y moderacion.
  - `realtime-manager.ts`: suscripciones realtime por dominio, debounce y flush incremental.
  - `navigation-store.ts`: estado transitorio de navegacion (query params, deep links, limpieza de session storage).
- Se redujeron efectos secundarios globales en `app-context.tsx` al delegar:
  - captura de `joinTeam/joinMatch/register`
  - parseo de `?screen=...`
  - consumo de deep links pendientes
  - limpieza centralizada de claves de navegacion
  - administracion de canales realtime de jugador

### Estado tecnico

- Compilacion TypeScript: OK
- Linter: OK
- Compatibilidad funcional: preservada (mismos flujos de auth, onboarding, deep links y realtime).

## FASE 4 — Optimizacion realtime (avance)

### Objetivo
Reducir trafico generado por realtime y evitar refetch completos innecesarios.

### Cambios implementados

- `components/chat-screen.tsx`
  - Reemplazo de refetch completo en evento `messages INSERT` por actualizacion local con `queryClient.setQueryData(...)`.
  - Se conserva invalidacion solo como fallback cuando el payload del evento llega incompleto.
  - Se elimina invalidacion en `onSuccess` de envio de mensaje (el propio evento realtime actualiza cache).

- `components/match-details-screen.tsx`
  - Se elimina `event: '*'` en suscripcion de participantes.
  - Se reemplaza por `INSERT/UPDATE/DELETE` explicitos.
  - Se agrega debounce corto (250 ms) para agrupar rafagas de eventos y evitar multiples refetch seguidos.

- `lib/core/realtime-manager.ts`
  - Se filtran updates de `profiles` para no disparar `scheduleFlush('users')` en cambios no relevantes (ej. `last_seen_at` por heartbeat).
  - Se reduce rerender de `currentUser` devolviendo el estado anterior cuando no hay cambios reales en campos relevantes.
  - Impacto directo: menos fan-out por presencia y menor carga de red/CPU en cliente.

### Verificacion
- `tsc --noEmit` OK
- lints en archivos tocados: OK

## FASE 4 — Completada

### Resultado final del bloque realtime

- Se eliminaron suscripciones con `event: '*'` en componentes auditados y se pasaron a `INSERT/UPDATE/DELETE` explicitos.
- Se aplico batching/throttling en flujos con rafagas:
  - debounce 250 ms en participantes de detalle de partido
  - debounce existente en dashboard de centro conservado (280 ms)
  - debounce + max-wait en realtime global de jugador (250 ms / 2000 ms)
- Se redujo refetch completo en chat:
  - eventos `messages INSERT` actualizan cache con `setQueryData`
  - invalidacion queda solo como fallback ante payload incompleto
- Se redujo ruido de presencia (`profiles.last_seen_at`):
  - updates de `profiles` ahora disparan flush solo si cambian campos relevantes para UI
  - se evita rerender de `currentUser` cuando no hay delta real

### Impacto esperado

- Menos requests repetidos por realtime
- Menor consumo de red y egress (especialmente en sesiones largas con heartbeat activo)
- Menor carga de CPU/render en cliente por menos invalidaciones globales

## FASE 5 — Server-first (avance inicial)

### Objetivo
Reducir requests desde cliente moviendo carga de datos publicos al servidor con cache.

### Cambios implementados

- Se agrego cache de servidor para snapshots publicos en `lib/supabase/`:
  - `fetchPublicVenuePageData` (centro)
  - `fetchPublicTeamSnapshot` (equipo)
  - `fetchPublicRevueltaSnapshot` (revuelta)
  - Implementado con `unstable_cache(..., { revalidate: 60 })`

- Se agrego ISR explicito en paginas publicas:
  - `app/centro/[venueId]/page.tsx`
  - `app/equipo/[teamId]/page.tsx`
  - `app/revuelta/[opportunityId]/page.tsx`
  - `export const revalidate = 60`

- Se elimino dependencia de cookies para carga publica en fetchers de equipo/revuelta:
  - fallback anon ahora usa `createClient(..., { persistSession: false })`
  - mejora cacheabilidad y evita atar snapshots publicos al estado de sesion.

### Impacto esperado

- Menos trabajo por request en paginas publicas de alto trafico.
- Menos latencia promedio para metadata + render inicial.
- Menor egress y menor consumo en cliente al resolver datos en servidor con cache.

### Verificacion
- `tsc --noEmit` OK
- lints en archivos tocados: OK

## FASE 5 — Completada

### Cierre del bloque server-first

- Se completo migracion server-first para vistas publicas clave:
  - `centro/[venueId]`
  - `equipo/[teamId]`
  - `revuelta/[opportunityId]`
  - perfil publico de jugador (sheet) via API server

- Se centralizo cache en servidor con `unstable_cache` + `revalidate`:
  - snapshots publicos de venue/team/revuelta (60s)
  - perfil publico de jugador (60s) en `lib/supabase/public-player-server.ts`
  - endpoint `app/api/public-player-profile/route.ts` con `revalidate = 60`

- El cliente ya no consulta Supabase directo para perfil publico:
  - `components/public-player-profile-sheet.tsx` ahora consume `/api/public-player-profile`
  - disminuye superficie client-heavy y mejora comportamiento de cache.

### Impacto consolidado esperado

- Menos consultas directas desde cliente en flujos publicos.
- Mejor reutilizacion de respuestas en servidor (ISR/cache).
- Menor latencia promedio y menor costo de egress en trafico recurrente.

### Verificacion final
- `tsc --noEmit` OK
- lints en archivos tocados: OK

## FASE 6 — Completada (cache avanzado)

### Objetivo
Evitar descargas repetidas del mismo dato y alinear cache server/client con una estrategia unica.

### Cambios implementados

- Politica de cache centralizada en `lib/cache-policy.ts`:
  - `publicStatic = 300s` (datos publicos con baja volatilidad)
  - `publicDynamic = 60s` (datos publicos sensibles a cambios recientes)
  - `CLIENT_PROFILE_CACHE_TTL_MS = 60_000` (cache local para sheet de perfil)

- Se reemplazaron TTL hardcodeados por politica central en:
  - `lib/supabase/public-venue-server.ts`
  - `lib/supabase/public-team-server.ts`
  - `lib/supabase/public-revuelta-server.ts`
  - `lib/supabase/public-player-server.ts`
  - `app/centro/[venueId]/page.tsx`
  - `app/equipo/[teamId]/page.tsx`
  - `app/revuelta/[opportunityId]/page.tsx`
  - `app/api/public-player-profile/route.ts`

- Cache HTTP explicita en API publica de perfil:
  - `Cache-Control: public, s-maxage=..., stale-while-revalidate=...`

- Prefetch inteligente (on-intent) de perfil publico:
  - nuevo `lib/public-player-prefetch.ts` con dedupe de requests en vuelo
  - usado en `chat-screen` y `match-details-screen` al hover/focus/click de jugador

- Reduccion de duplicacion server/client cache en sheet:
  - `components/public-player-profile-sheet.tsx` ahora mantiene cache local con TTL
  - evita refetch inmediato de un perfil ya visto dentro de la ventana de cache
  - mantiene fetch a API cacheada (`force-cache`) para coherencia con server-first

### Impacto esperado

- Menos requests repetidos al abrir perfiles publicos varias veces.
- Menor egress en trafico de lectura publica y menos latencia percibida.
- Estrategia de cache consistente y mantenible en todo el stack.

### Verificacion
- `tsc --noEmit` OK
- lints en archivos tocados: OK

