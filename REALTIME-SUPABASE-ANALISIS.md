# Uso de Supabase Realtime en el proyecto (análisis estático)

**Alcance:** solo código y migraciones en el repositorio. Comportamiento en producción depende de que las tablas estén en la **publicación** `supabase_realtime` del proyecto (ver sección final).

**No es Realtime de Postgres:** `supabase.auth.onAuthStateChange` (p. ej. en `venue-centro-client.tsx`) es suscripción al **estado de sesión Auth**, no `postgres_changes`.

---

## 1. `usePlayerRealtimeManager` — jugador (app global)

| | |
|---|---|
| **Archivo** | `lib/core/realtime-manager.ts` |
| **Montaje** | `lib/app-context.tsx` (hook al proveedor de la app) |
| **Condición** | Usuario `accountType === 'player'` y Supabase configurado. |

### Canales y eventos

Tres canales lógicos (`app-rt:${uid}:match`, `:team`, `:users`), todos con `postgres_changes`:

| Tabla | Eventos | Efecto |
|-------|---------|--------|
| `match_opportunities` | **INSERT, UPDATE, DELETE** | `scheduleFlush('match')` |
| `match_opportunity_participants` | **INSERT, UPDATE, DELETE** | `scheduleFlush('match')` |
| `rival_challenges` | **INSERT, UPDATE, DELETE** | `scheduleFlush('match')` |
| `team_invites` | **INSERT, UPDATE, DELETE** | `scheduleFlush('team')` |
| `team_join_requests` | **INSERT, UPDATE, DELETE** | `scheduleFlush('team')` |
| `team_members` | **INSERT, UPDATE, DELETE** | `scheduleFlush('team')` |
| `teams` | **INSERT, UPDATE, DELETE** | `scheduleFlush('team')` |
| `team_private_settings` | **INSERT, UPDATE, DELETE** | `scheduleFlush('team')` |
| `profiles` | **INSERT, DELETE** | `scheduleFlush('users')` |
| `profiles` | **UPDATE** | Lógica especial (ver abajo) |

**Comentario en código:** el payload WAL **no** se aplica al estado de partidos; se usa solo como señal para volver a cargar por REST (`match_opportunities_masked`, etc.).

### ¿TanStack Query?

**No.** El bundle de partidos vive en **React state** (`setMatchOpportunities`, `setParticipatingOpportunityIds`, `setRivalChallenges`). No hay `setQueryData` ni `invalidateQueries` aquí.

### Qué ocurre al llegar un evento (tras debounce)

1. **Debounce:** 250 ms (`DEBOUNCE_MS`), con **ventana máxima** 2000 ms (`MAX_WAIT_MS`) para forzar flush.
2. **`scheduleFlush('match')`** → `runIncrementalFlush` llama **`loadPlayerMatchBundle(supabase, u.id)`** (`lib/services/match.service.ts`), que ejecuta **`fetchMatchOpportunities`** + IDs de participación + desafíos rivales (refetch **completo** del bundle de partidos).
3. **`scheduleFlush('team')`** → **`loadPlayerTeamBundle`** → equipos, invitaciones, solicitudes (refetch equipo).
4. **`scheduleFlush('users')`** → **`loadOtherPlayersForUser`** (lista “otros jugadores” por género).

Usa **`backgroundMatchBundleTokenRef`** para descartar resultados si hubo una escritura más reciente (evita pisar IDs tras acciones como team pick).

### Perfil propio (`profiles` UPDATE)

- Si hay delta “significativo” (`hasMeaningfulProfileDelta`): `scheduleFlush('users')` + bump de `setProfilePhotoEpochByUser` / `setProfilesRealtimeGeneration`.
- Además **merge directo** en `setCurrentUser` para foto, nombre, campos de moderación **sin** esperar al flush de “users”.

### Patrones de carga (riesgo I/O)

| Patrón | Descripción |
|--------|-------------|
| **Refetch completo de partidos** | Casi cualquier cambio en `match_opportunities`, `match_opportunity_participants` o `rival_challenges` termina en **`loadPlayerMatchBundle`** (misma cadena pesada que `fetchMatchOpportunities` + derivados). |
| **Múltiples bundles en un flush** | Si en el mismo ciclo quedaron marcas `match` + `team` + `users`, **`Promise.all`** ejecuta **hasta tres** cargas grandes en paralelo. |
| **Alta frecuencia** | Muchos UPDATE en participantes (p. ej. team pick / revuelta) pueden **agruparse** por debounce, pero igual generan **un refetch completo** del listado de oportunidades por oleada. |

---

## 2. `useMatchOpportunityParticipantsRealtime` — participantes por partido

| | |
|---|---|
| **Archivo hook** | `lib/hooks/use-match-opportunity-participants-realtime.ts` |
| **Lógica de caché** | `lib/realtime/match-opportunity-participants-realtime.ts` |
| **Usado en** | `components/chat-screen.tsx`, `components/match-details-screen.tsx` |

### Canal y eventos

- Canal: `match-opportunity-participants:${opportunityId}`
- Tabla: `match_opportunity_participants`
- Filtro: `opportunity_id=eq.${oppId}`
- Eventos: **INSERT, UPDATE, DELETE** (todos explícitos).

### TanStack Query

| Acción | Cuándo |
|--------|--------|
| **`setQueryData`** | Tras fusionar en memoria eventos en `applyMatchOpportunityParticipantsRealtime` si devuelve `'ok'`. |
| **`replaceParticipantsCacheFromServer`** | Si no hay caché o la fusión no es segura → **`fetchParticipantsForOpportunity`** (varias queries: `match_opportunities`, participantes, `profiles`) y luego **`setQueryData`** con el resultado completo. |
| **`invalidateQueries`** | Siempre invalida **`queryKeys.matchOpportunity.participantLeaveReasons(oppId)`** tras cada flush de realtime (no invalida la lista principal de participantes si fusionó bien). |

### Lecturas extra por evento

- En **INSERT/UPDATE** de participante **nuevo** en caché: puede llamarse **`fetchProfileBasics`** → **1 SELECT** a `profiles` por usuario nuevo en el lote.

### Debounce

Cola de payloads con **`setTimeout` 250 ms** antes de `flush` (agrupa ráfagas).

### Eficiencia relativa

Es el camino **más optimizado** del proyecto para Realtime: intenta **mutar la query** sin refetch; solo cae en refetch de participantes cuando la fusión no es segura.

---

## 3. Chat — mensajes (`messages`)

| | |
|---|---|
| **Archivo** | `components/chat-screen.tsx` (`useEffect` dedicado) |
| **Canal** | `messages:${opportunityId}` |
| **Evento** | Solo **INSERT** |
| **Filtro** | `opportunity_id=eq.${oid}` |

### Al recibir INSERT

1. Si el payload tiene `id`, `sender_id`, `content`: arma un **`UiMessage`** y hace **`queryClient.setQueryData`** en `queryKeys.chat.messages(oid, uid)` (añade al final si no existe el id).
2. Nombres/fotos del emisor salen de la **caché de participantes** (`getQueryData` participantes); si falla validación del payload → **`invalidateQueries`** sobre mensajes (refetch completo del hilo).

### TanStack Query

- **`setQueryData`**: camino feliz.
- **`invalidateQueries`**: fallback si el INSERT viene incompleto o mal formado.

**No** llama a `loadPlayerMatchBundle` desde este efecto.

---

## 4. Panel centro (`venue-dashboard-screen`) — `venue_reservations`

| | |
|---|---|
| **Archivo** | `components/venue-dashboard-screen.tsx` |

### Suscripción

- Canal: `venue-dashboard-bookings:${venue.id}:${claveDeCanchas}` (clave depende del orden de ids de cancha).
- Tabla: **`venue_reservations`**
- Si hay ≤100 canchas y lista no vacía: **INSERT/UPDATE** con filtro `court_id=in.(...)`.
- **DELETE**: suscripción **sin filtro** (comentario en código: DELETE con filtro no soportado en Realtime) → cualquier DELETE en la tabla dispara reload; el debounce reduce llamadas.

### Al llegar evento

**No usa Query Client global documentado aquí:** ejecuta tras debounce ~280 ms:

- **`loadBookingsForSelectedDay()`**
- Si la pestaña es dashboard: **`loadDashboardRange()`**

→ **Refetch(s)** de datos del centro (lecturas a BD según implementación de esas funciones).

---

## 5. Tablas en publicación Realtime (migraciones del repo)

Según `ALTER PUBLICATION supabase_realtime ADD TABLE` en migraciones:

| Tabla | Migración referencia |
|-------|----------------------|
| `messages` | `20250322180000_initial_schema.sql` |
| `match_opportunities` | idem |
| `match_opportunity_participants` | idem |
| `rival_challenges` | `20250322193000_rival_challenges.sql` |
| `match_opportunity_ratings` | `20250322190000_match_completion_and_ratings.sql` |
| `profiles` | `20260408120000_realtime_profiles_and_sync_team_photo.sql` |
| `sports_venues`, `venue_reservations` | `20250327100000_sports_venues_and_bookings.sql` |
| `sports_venue_reviews` | `20260429200000_sports_venue_reviews.sql` |

**Observación:** el código de `realtime-manager.ts` escucha **`teams`, `team_invites`, `team_join_requests`, `team_members`, `team_private_settings`**, pero **no aparece** `ADD TABLE` para esas tablas en las migraciones buscadas en el repo. Si en tu proyecto no están en la publicación, **`postgres_changes` para equipos no llegará** hasta añadirlas en Supabase/migración. Conviene verificar en el SQL Editor: `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';`

---

## Resumen: dónde puede haber exceso de lecturas

| Origen | Mecanismo | Severidad relativa |
|--------|-----------|---------------------|
| **`usePlayerRealtimeManager`** | Cualquier cambio relevante en partidos/participantes/rivales → **`loadPlayerMatchBundle`** completo | **Alta** (misma cadena que carga inicial de listado). |
| **Mismo hook** | Flush con **match + team + users** → hasta **3 refetches** en paralelo | **Alta** en picos. |
| **`useMatchOpportunityParticipantsRealtime`** | Fallback `refetch` + invalidación de leave reasons; INSERT puede sumar **SELECT profiles** | **Media/baja** frente al bundle global. |
| **Chat `messages` INSERT** | Normalmente **append en caché**; **invalidate** solo si payload inválido | **Baja**. |
| **Venue dashboard reservas** | Cada oleada de cambios → **recarga reservas/día + opcional BI día** | **Media** (dueño de cancha, no todos los usuarios). |

---

## Mapa rápido: `setQueryData` vs `invalidateQueries` vs bundles

| Ubicación | setQueryData | invalidateQueries | loadPlayerMatchBundle / similar |
|-----------|--------------|-------------------|----------------------------------|
| `realtime-manager.ts` | No | No | **Sí** (`loadPlayerMatchBundle`, `loadPlayerTeamBundle`, `loadOtherPlayersForUser`) |
| `use-match-opportunity-participants-realtime.ts` | **Sí** (participantes) | **Sí** (solo leave reasons) | Indirecto: `fetchParticipantsForOpportunity` si `'refetch'` |
| `chat-screen.tsx` (messages) | **Sí** (mensajes) | **Sí** (mensajes, fallback) | No |
| `venue-dashboard-screen.tsx` | — | — | Funciones propias `loadBookings*` / `loadDashboardRange` |

---

*Actualizar este documento si se añaden suscripciones nuevas o se mueven tablas a/desde la publicación Realtime.*
