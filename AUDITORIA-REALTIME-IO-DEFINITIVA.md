# Auditoría técnica: Realtime + I/O (código actual del proyecto)

Este documento responde al cuestionario de auditoría **solo con base en el repositorio**. Donde no hay métricas de producción (frecuencias reales, cardinalidades), se indica explícitamente **inferido / sin datos en repo**.

**Referencias de código principales:** `lib/types.ts`, `lib/supabase/mappers.ts`, `lib/supabase/geo-queries.ts`, `lib/supabase/queries.ts`, `lib/supabase/message-queries.ts`, `lib/supabase/rival-challenge-queries.ts`, `lib/core/realtime-manager.ts`, `lib/realtime/cache-handlers.ts`, `lib/app-context.tsx`, `lib/query-keys.ts`.

---

## 1. Contrato final de datos que consume la UI

### 1.1 `MatchOpportunity` (`lib/types.ts` → `mapMatchOpportunityFromDb` en `lib/supabase/mappers.ts`)

La lista principal del jugador viene de **`fetchMatchOpportunities` / `fetchMatchOpportunitiesByIds`**, que leen la vista **`match_opportunities_masked`** (`MATCH_OPPORTUNITIES_CLIENT_VIEW`) con select geo (`MATCH_OPPORTUNITY_SELECT_WITH_GEO`).

| Campo UI | Origen | Tabla / vista / join | ¿Reconstruible solo con payload Realtime sobre `match_opportunities`? |
| -------- | ------ | --------------------- | --------------------------------------------------------------- |
| `id` | Columna | `match_opportunities` / vista | **Sí** (id en WAL). |
| `type` | Columna | `match_opportunities` | **Sí**. |
| `title` | Columna | `match_opportunities` | **Sí**. |
| `description` | Columna | `match_opportunities` | **Sí** (puede ser null). |
| `cityId` | Columna | `match_opportunities.city_id` | **Sí**. |
| `cityRegionId` | Join embed | `geo_cities` vía `geo_city:geo_cities!city_id` en select | **No** sin fetch/embed: Realtime no envía embed; haría falta join aparte o segunda query. |
| `location` | Derivado | `geo_city.name` si existe, si no `match_opportunities.location` | **Parcial**: WAL tiene `location`; la UI prefiere nombre catálogo — sin embed **no** coincide con contrato actual. |
| `venue` | Columna | `match_opportunities` | **Sí**. |
| `sportsVenueId` | Columna | `match_opportunities` (+ fallback nombre/ciudad en `queries.ts`) | **Parcial**: columna sí en WAL; **resolución por nombre de centro en misma ciudad** (`queries.ts`) es **solo REST**. |
| `venueContactPhone` | Join / derivado | `sports_venues.phone` por id resuelto (+ fallback venue) | **No** sin query a `sports_venues`. |
| `venueReservationId` | Columna | `match_opportunities` | **Sí**. |
| `dateTime` | Columna | `match_opportunities.date_time` | **Sí**. |
| `level` | Columna | `match_opportunities` | **Sí**. |
| `creatorId` | Columna | `match_opportunities` | **Sí**. |
| `creatorName` | Join | `profiles` (snippets en `fetchMatchOpportunities*`) | **No** sin fetch de perfil (Realtime `profiles` distinto canal). |
| `creatorPhoto` | Join | `profiles.photo_url` (+ sustitución admin en queries) | **No** igual que arriba. |
| `teamName` | Columna | `match_opportunities.team_name` | **Sí**. |
| `privateRevueltaTeamId` | Columna | `match_opportunities` | **Sí**. |
| `joinCode` | Columna | Vista **enmascarada** / política de visibilidad (`geo-queries` comenta join_code oculto en privado) | **Riesgo**: WAL Realtime es sobre tabla base; **contrato UI sigue vista enmascarada**. No reconstruir solo desde WAL sin aplicar las mismas reglas que la vista. |
| `teamPickColorA` / `teamPickColorB` | Columna | `match_opportunities` | **Sí** en tabla base. |
| `playersNeeded` | Columna | `match_opportunities` | **Sí**. |
| `playersJoined` | Columna + **recount** | Trigger en BD + **recount en cliente** desde `match_opportunity_participants` en `queries.ts` | **No** sin query participantes: el código **sobrescribe** conteo con regla especial admin organizador. |
| `playersSeekProfile` | Columna parseada | `match_opportunities.players_seek_profile` → `parsePlayersSeekProfile` | **Sí** si WAL incluye columna (JSON/text). |
| `gender` | Columna | `match_opportunities` | **Sí**. |
| `status` | Columna | `match_opportunities` | **Sí**. |
| `createdAt` | Columna | `match_opportunities` | **Sí**. |
| `finalizedAt` | Columna | `match_opportunities` | **Sí**. |
| `rivalResult` | Columna | `match_opportunities` | **Sí**. |
| `casualCompleted` | Columna | `match_opportunities` | **Sí**. |
| `suspendedAt` / `suspendedReason` | Columna | `match_opportunities` | **Sí**. |
| `revueltaLineup` | Columna parseada | `match_opportunities.revuelta_lineup` → `parseRevueltaLineup` | **Sí** si viene completa en fila. |
| `revueltaResult` | Columna | `match_opportunities` | **Sí**. |
| `rivalCaptainVoteChallenger` / `rivalCaptainVoteAccepted` | Columna | `match_opportunities` | **Sí**. |
| `rivalOutcomeDisputed` | Columna | `match_opportunities` | **Sí**. |
| `matchStatsAppliedAt` | Columna | `match_opportunities` | **Sí**. |
| `venueReservationPricing` | Join | `venue_reservations` (`starts_at`, `ends_at`, `price_per_hour`, `currency`) por `venue_reservation_id` | **No** sin fetch reserva. |

**Conclusión §1.1:** La UI **no** puede alinearse al contrato actual solo aplicando filas WAL de `match_opportunities` sin refetch enriquecido: faltan **embed geo**, **creator**, **teléfono centro**, **pricing reserva**, **playersJoined ajustado**, y la vista **masked** para `join_code`.

---

### 1.2 `RivalChallenge` (`lib/types.ts` → `hydrateRivalChallenges` en `lib/supabase/rival-challenge-queries.ts`)

| Campo UI | Origen | Tabla / join | ¿Realtime tabla `rival_challenges` solo? |
| -------- | ------ | ------------- | ---------------------------------------- |
| `id` | Columna | `rival_challenges` | **Sí**. |
| `opportunityId` | Columna | `rival_challenges` | **Sí**. |
| `opportunityTitle` | Join | `match_opportunities.title` | **No** — requiere segunda lectura o cache previo. |
| `mode` | Columna | `rival_challenges` | **Sí**. |
| `status` | Columna | `rival_challenges` | **Sí**. |
| `challengerTeamId` | Columna | `rival_challenges` | **Sí**. |
| `challengerTeamName` | Join | `teams.name` | **No**. |
| `challengerCaptainId` | Derivado | Preferencia `teams.captain_id`, fallback columna | **Parcial** — nombre no; capitán por tabla teams sí si se fetch equipos. |
| `challengedTeamId` / `acceptedTeamId` | Columna | `rival_challenges` | **Sí** (nullable). |
| `challengedTeamName` / `acceptedTeamName` | Join | `teams.name` | **No**. |
| `challengedCaptainId` / `acceptedCaptainId` | Columna | `rival_challenges` | **Sí** (nullable). |
| `createdAt` | Columna | `rival_challenges` | **Sí**. |
| `respondedAt` | Columna | `rival_challenges` | **Sí**. |

---

### 1.3 Participante en contexto de partido (`OpportunityParticipantRow`, `lib/supabase/message-queries.ts`)

Usado en detalle/chat vía TanStack Query `queryKeys.matchOpportunity.participants(opportunityId)` y `fetchParticipantsForOpportunity`.

| Campo UI | Origen | Tabla / join | ¿Solo WAL `match_opportunity_participants`? |
| -------- | ------ | ------------- | --------------------------------------------- |
| `id` | Derivado | `user_id` como id en UI | Participante: sí `user_id`; fila organizador sintética usa `creator_id`. |
| `name` | Join | `profiles.name` (+ etiqueta organizador) | **No**. |
| `photo` | Join | `profiles.photo_url` | **No**. |
| `whatsappPhone` | Join | `profiles.whatsapp_phone` (RLS) | **No**. |
| `status` | Derivado / columna | Mix `match_opportunity_participants.status` + fila especial `creator` | **Parcial** — reglas en TS (`creator`, excluir admin como cupo, etc.). |
| `isGoalkeeper` | Columna | `match_opportunity_participants.is_goalkeeper` | **Sí**. |
| `pickTeam` | Columna | `pick_team` | **Sí**. |
| `encounterLineupRole` | Columna | `encounter_lineup_role` | **Sí**. |
| `cancelledReason` | Columna | `cancelled_reason` | **Sí**. |

El proyecto ya tiene **`applyMatchOpportunityParticipantsRealtime`** (`lib/realtime/match-opportunity-participants-realtime.ts`) que fusiona eventos y puede llamar **`fetchParticipantsForOpportunity`** cuando la fusión no es segura.

---

## 2. Frecuencia de cambios por columna

**Nota:** el repo **no contiene** series temporales ni histogramas de UPDATE. La columna **Frecuencia** es **inferencia funcional** (flujo de negocio / uso en código), no telemetría.

### 2.1 `match_opportunities` (columnas relevantes para UI)

| Tabla | Columna | Frecuencia (inferida) | Impacta UI lista/detalle | Requiere Realtime | Se puede ignorar en señal genérica |
| ----- | ------- | ---------------------- | ------------------------ | ----------------- | ---------------------------------- |
| mo | `status`, `date_time`, `venue_reservation_id` | **Alta** en vida del partido | Sí | Sí | No |
| mo | `players_joined` | **Media** (trigger + recount cliente) | Sí | Sí | No |
| mo | `join_code`, `team_pick_color_*`, `revuelta_lineup` | **Media** (modo team_pick / revuelta) | Sí | Sí | No en esos modos |
| mo | `finalized_at`, `rival_result`, votos, `match_stats_applied_at` | **Media** al cerrar | Sí | Sí | No al cerrar |
| mo | `title`, `description`, `location`, `venue` | **Baja** tras crear | Sí (detalle) | Sí | A veces |
| mo | `sports_venue_id` | **Baja-media** (reserva / reprogramación) | Sí | Sí | No si cambia centro |

### 2.2 `match_opportunity_participants`

| Tabla | Columna | Frecuencia (inferida) | Impacta UI | Requiere Realtime | Ignorable |
| ----- | ------- | ---------------------- | ---------- | ----------------- | --------- |
| mop | INSERT / DELETE / status | **Alta** (uniones/salidas) | Sí | Sí | No |
| mop | `pick_team`, `encounter_lineup_role`, `is_goalkeeper` | **Media** (team_pick / revuelta) | Sí | Sí | No en esos flujos |
| mop | `cancelled_reason` | **Baja-media** | Sí (organizador) | Sí | Para vista no org: filtrar |

### 2.3 `rival_challenges`

| Tabla | Columna | Frecuencia (inferida) | Impacta UI | Requiere Realtime | Ignorable |
| ----- | ------- | ---------------------- | ---------- | ----------------- | --------- |
| rc | `status` | **Alta** en ventana de decisión | Sí | Sí | No |
| rc | `accepted_*`, `challenged_*` | **Media** | Sí | Sí | No |

### 2.4 `profiles`

| Tabla | Columna | Frecuencia (inferida) | Impacta UI jugador | Requiere Realtime | Ignorable |
| ----- | ------- | ---------------------- | ------------------- | ----------------- | --------- |
| profiles | `photo_url`, `name` | **Alta** edición | Sí (avatar, listas) | UPDATE canal users | No |
| profiles | moderación `mod_*` | **Baja** por usuario | Sí | Sí | No si afecta sesión |
| profiles | `gender`, `city_id`, stats | **Media-baja** | Sí filtros / tarjetas | Sí | Contexto dependiente |

### 2.5 `teams`

**Realtime:** el código suscribe `teams`, `team_members`, etc., pero el repo **no** documenta publicación Realtime de `teams` en migraciones antiguas (ver análisis previo). Asumiendo que los eventos llegan:

| Tabla | Columna | Frecuencia (inferida) | Impacta UI | Requiere Realtime | Ignorable |
| ----- | ------- | ---------------------- | ---------- | ----------------- | --------- |
| teams | `name`, `logo_url` | Media | Sí | Sí | No |
| teams | stats W/D/L | Baja | Sí equipos | Tras partido | No para carrusel |

---

## 3. Dependencias cruzadas entre tablas

| Entidad UI | Tablas involucradas | Dependencia | ¿Sin fetch? |
| ---------- | -------------------- | ------------ | ----------- |
| **MatchOpportunity (lista)** | `match_opportunities_masked` (+ embed), `profiles` (creador), `match_opportunity_participants` (recount), `venue_reservations`, `sports_venues` (tel/fallback) | **Alta** | **No** para igualar contrato actual |
| **OpportunityParticipantRow** | `match_opportunity_participants`, `profiles`, `match_opportunities` (creator_id) | **Alta** | Solo merge parcial + fetch puntual |
| **RivalChallenge** | `rival_challenges`, `teams`, `match_opportunities` | **Media-alta** | No para nombres de equipo y título |
| **User** (lista “otros jugadores”) | `profiles` (+ geo) | **Media** | Realtime `profiles` + flush actual sigue con **fetch** completo de `loadOtherPlayersForUser` |

---

## 4. Cobertura del payload Realtime (Supabase `postgres_changes`)

Comportamiento típico en Supabase: eventos sobre **tablas base**; payload con `new` / `old` según `INSERT`/`UPDATE`/`DELETE`. **RLS:** si el cliente no puede “ver” la fila con SELECT, el comportamiento de entrega de eventos debe validarse en el proyecto (políticas + Realtime). El código **no** documenta un bypass: se asume **coherencia con permisos del rol `authenticated`**.

| Tabla | Columnas “completas” en práctica | Columnas faltantes / parciales | Riesgos sin refetch |
| ----- | -------------------------------- | ------------------------------- | ------------------- |
| `match_opportunities` | Columnas físicas de la fila en WAL (no embed `geo_city`) | Sin embed; **vista masked** no es el WAL | join_code / visibilidad distinta a `match_opportunities_masked`; sin `playersJoined` corregido por cliente |
| `match_opportunity_participants` | `opportunity_id`, `user_id`, `status`, columnas team_pick, etc. | No nombres/fotos | obligatorio join `profiles` para UI de participantes |
| `rival_challenges` | Columnas de la tabla | No `teams.name`, no `match_opportunities.title` | lista desafíos incompleta vs contrato |
| `profiles` | Campos de fila perfil | No embeds opcionales si no vienen en fila | OK para merge ligero de usuario actual en `realtime-manager` |

**SELECT normal vs Realtime:** el SELECT usa vistas/embeds (`match_opportunities_masked`, `geo_cities`); Realtime emite **tabla base** → **no equivalente** para campos enmascarados o embeds.

---

## 5. Consistencia y orden de eventos

1. **¿UPDATE antes que INSERT?** En un mismo `opportunity_id` no debería ocurrir en Postgres lógico; entre tablas (p. ej. crear `match_opportunities` y luego `participants`) el orden puede ser INSERT mo → INSERT mop en distintos eventos. El código **debouncea** (250 ms / max 2 s) y **reduce** a conjuntos de ids — amortigua orden parcial.

2. **¿Pérdida de eventos?** Posible por red, reconexión, o límites del servicio Realtime. El código **no** implementa log persistido ni replay; riesgo de **brecha** si el cliente estuvo offline.

3. **¿Duplicados?** La cola puede recibir el mismo cambio si el servidor reenvía; el **merge por Map (`id`)** y sets de ids **deduplican** al aplicar listas.

4. **Manejo actual:** `reduceMatchRealtimeEvents` + `mergeMatchOpportunitiesAfterFetch`; token `backgroundMatchBundleTokenRef` para descartar resultados obsoletos tras mutaciones locales; participantes con hook dedicado y fallback `fetchParticipantsForOpportunity`.

**Riesgos:** carrera entre RPC de join y flush Realtime (mitigado por token); inconsistencia temporal entre lista global y query de participantes si solo uno se actualiza (mitigado por invalidaciones en otros flujos).

---

## 6. Tamaño de datos en producción

**No hay** dumps ni métricas en el repo. Tabla de **estimación orientativa** para diseño (no evidencia):

| Entidad | Promedio (hipótesis) | Máximo (hipótesis) | Riesgo de escala |
| ------- | -------------------- | ------------------ | ---------------- |
| Partidos visibles por jugador (lista) | decenas | centenas (filtros geo) | Lista + N queries secundarias hub |
| Participantes por partido | 6–14 según formato | cap reglas team_pick / revuelta | Chat + detalle |
| Mensajes por chat | crece con uso | ilimitado upper bound | **Antes** fallback REST sin límite era peligroso; ahora último mensaje acotado por chat |
| `rival_challenges` activos por usuario | pocos | decenas | Join equipos |

---

## 7. Arquitectura de estado actual

1. **React Context (`AppProvider`):** `matchOpportunities`, `participatingOpportunityIds`, `rivalChallenges`, `teams`, invitaciones, `users`, `currentUser`, etc. Es lo que consumen pantallas vía `useAppMatch()` / dominios.

2. **TanStack Query:** participantes por partido, mensajes de chat, hub secundario (`matches_hub_secondary_bundle`), ratings session, reservas públicas, BI centro, etc. (`lib/query-keys.ts`).

3. **Fuente de verdad:** para **lista de partidos del jugador**, la autoridad práctica es el **estado React** del Context tras carga inicial y tras Realtime incremental. TanStack **`queryKeys.playerSession.matchBundle`** es **espejo** opcional (escrito en flush Realtime).

4. **Duplicación:** mismo bundle lógico puede existir en Context y en `playerSession.matchBundle` si se escribe el cache; no hay suscripción automática de la UI al Query para la lista principal.

5. **Riesgos:** divergencia si en el futuro una pantalla lee solo Query y otra solo Context sin sincronizar.

---

## 8. Cuándo es **inseguro** actualizar solo con Realtime (sin fetch)

| Caso | Por qué | Solución ya alineada al repo |
| ---- | ------- | ------------------------------ |
| Tarjeta `MatchOpportunity` completa | Faltan embed geo, creator, venue phone, pricing reserva, recount participantes, vista masked | `fetchMatchOpportunitiesByIds` tras eventos (implementado) |
| Lista de participantes con nombres/fotos | Payload mop no incluye `profiles` | `fetchParticipantsForOpportunity` en hook participantes |
| `RivalChallenge` con nombres de equipo y título | Payload rc sin `teams`/`match_opportunities` | `fetchRivalChallengesByIds` |
| Usuario ve `join_code` correcto en privado | WAL vs `match_opportunities_masked` | No confiar en merge manual desde WAL; mantener fetch vista |
| Post-reprogramación / cambio reserva | Múltiples tablas (`venue_reservations`, mo) | Refetch acotado por id o invalidación selectiva |

---

## 9. Mapa de estrategia recomendada por tabla

| Tabla | Estrategia recomendada |
| ----- | ---------------------- |
| `match_opportunities` | **Híbrido:** Realtime como señal + **`fetchMatchOpportunitiesByIds`** para conservar contrato (vista + joins). No merge directo WAL→UI. |
| `match_opportunity_participants` | **Híbrido:** merge en Query donde exista hook por `opportunity_id`; si incierto → **`fetchParticipantsForOpportunity`**; lista global solo necesita ids refrescados (`fetchParticipatingOpportunityIds`) cuando cambia membresía. |
| `rival_challenges` | **Híbrido:** evento + **`fetchRivalChallengesByIds`** para enriquecer nombres/título. |
| `profiles` | **Parcial + fetch:** merge campos del usuario actual en Context (ya); lista “otros jugadores” sigue necesitando **fetch** si quieres consistencia total sin simplificar modelo. |
| `teams` / miembros / invitaciones | **Refetch bundle equipo** (`loadPlayerTeamBundle`) mientras el modelo UI sea agregado pesado — o futura normalización a Query por entidad. |

---

## 10. Propuesta de arquitectura final (política de actualización)

| Mecanismo | Cuándo usar |
| --------- | ----------- |
| **`setQueryData`** | Participantes (merge seguro), mensajes chat (append), cache `playerSession.matchBundle` como espejo, hub secundario cuando el RPC devuelve payload parseado. |
| **`invalidateQueries`** | Cuando la superficie afectada es desconocida o RLS puede haber ocultado filas (p. ej. motivos de salida privilegiados); motivos `participantLeaveReasons` ya se invalidan en realtime participantes. |
| **Fetch puntual** | Siempre que el contrato UI exija joins (`fetchMatchOpportunitiesByIds`, `fetchRivalChallengesByIds`, `fetchParticipantsForOpportunity`). |
| **No hacer nada** | Eventos duplicados tras merge por id; actualizaciones no significativas en `profiles` para lista otros jugadores sin cambiar campo observado (opcional; hoy se hace flush users). |
| **Evitar refetch masivo** | No llamar `loadPlayerMatchBundle` en Realtime match (hecho); mantener acotación de ids y debounce; opcionalmente extender misma filosofía a **team** con merges por id en una iteración futura. |

---

## Resumen ejecutivo

- El **contrato UI** de `MatchOpportunity` depende de **vista enmascarada + joins + recount**: Realtime sobre tabla base **no sustituye** un SELECT enriquecido.
- **`OpportunityParticipantRow`** siempre cruza **`profiles`** para datos mostrables.
- **`RivalChallenge`** cruza **`teams`** y **`match_opportunities`** para campos de presentación.
- La arquitectura actual correcta para reducir I/O sin romper UX es **señal Realtime + fetch acotado por ids**, que es lo que implementa la Fase 7 en `realtime-manager` + `queries` / `rival-challenge-queries`.

---

*Documento interno de auditoría; actualizar si cambian vistas SQL, mappers o políticas RLS.*
