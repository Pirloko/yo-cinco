# Documentación: arquitectura Realtime + I/O y optimizaciones implementadas

Este documento consolida **todo lo implementado** en el repo relacionado con reducción de lecturas a Postgres, política única ante eventos Realtime y capas de soporte. Complementa archivos más específicos como `OPTIMIZACION-IO-FASE-7-10.md`, `AUDITORIA-REALTIME-IO-DEFINITIVA.md` y `QUERIES-SUPABASE-ANALISIS.md`.

---

## 1. Principio no negociable

- **La UI no usa el payload WAL de Supabase Realtime como fuente de verdad** para entidades derivadas (`MatchOpportunity`, `RivalChallenge`).
- **Realtime es solo una señal de cambio.** Los datos que dependen de vistas enmascaradas, joins (`profiles`, `teams`, `venue_reservations`, `geo_cities`, etc.) se obtienen con **fetch controlado** (`fetchMatchOpportunitiesByIds`, `fetchRivalChallengesByIds`, `fetchParticipantsForOpportunity`).

---

## 2. Capa `lib/architecture/` (punto único de política)

Todos los módulos se reexportan desde `lib/architecture/index.ts` para imports coherentes.

| Archivo | Responsabilidad |
| ------- | --------------- |
| **`limits.ts`** | Constantes globales: `DEBOUNCE_MATCH_MS` (250), `MAX_WAIT_MATCH_MS` (2000), `MAX_HUB_SECONDARY_IDS` / alias `MAX_HUB_IDS` (20), `MAX_REALTIME_BATCH_EVENTS` (50). |
| **`realtime-types.ts`** | Tipo `MatchRealtimeRowEvent` (tablas del canal match: `match_opportunities`, `match_opportunity_participants`, `rival_challenges`). |
| **`entity-classification.ts`** | Clasificación explícita: entidades base vs derivadas vs bundles agregados; metadatos por tabla para nuevas features. |
| **`realtime-decision-engine.ts`** | `handleRealtimeEvent` (decisión documental por evento), `foldMatchRealtimeBatch` (plan único de trabajo sobre un lote). Logs en desarrollo: `[REALTIME_ENGINE]`, `[FETCH_BY_IDS]`, `[INVALIDATE_TRIGGERED]`, `[MERGE_SAFE]`. |
| **`state-sync.ts`** | `syncPlayerMatchBundleToContextAndCache`: aplica `PlayerMatchBundle` al **React Context** y escribe el espejo en TanStack Query (`writePlayerMatchBundleQueryCache`). |
| **`consistency-guard.ts`** | Detección de filas `MatchOpportunity` incompletas (`creatorName` / `dateTime`) y `repairMatchOpportunitiesIfNeeded` con refetch puntual por ids. |
| **`derived-entity-fetches.ts`** | Reexports canónicos: `fetchMatchOpportunitiesByIds`, `fetchRivalChallengesByIds`, `fetchParticipantsForOpportunity` — **única puerta recomendada** para código nuevo que refresque derivadas. |

---

## 3. Integración en tiempo de ejecución

### 3.1 `lib/core/realtime-manager.ts`

- Canal **match**: cola de `MatchRealtimeRowEvent` → debounce con `DEBOUNCE_MATCH_MS` / tope `MAX_WAIT_MATCH_MS`.
- Si la cola supera `MAX_REALTIME_BATCH_EVENTS`, se procesa un bloque y el **excedente se reencola** al inicio (no se pierden eventos).
- Planificación mediante **`foldMatchRealtimeBatch`** (no duplicar reglas en otros archivos).
- Fetches: **`fetchMatchOpportunitiesByIds`** y **`fetchRivalChallengesByIds`** vía `derived-entity-fetches`; **`fetchParticipatingOpportunityIds`** cuando el plan indica cambios en participantes.
- Merge en memoria: `mergeMatchOpportunitiesAfterFetch` / `mergeRivalChallengesAfterFetch` en `lib/realtime/cache-handlers.ts`.
- Tras merge: **`repairMatchOpportunitiesIfNeeded`** (`consistency-guard`).
- Estado final: **`syncPlayerMatchBundleToContextAndCache`** (Context + Query).
- **`backgroundMatchBundleTokenRef`**: sigue invalidando resultados obsoletos si hubo mutación local concurrente.
- Canales **team** / **users**: sin cambio de filosofía — siguen usando `loadPlayerTeamBundle` y `loadOtherPlayersForUser`; mismos límites de tiempo que match (`DEBOUNCE_MATCH_MS`, `MAX_WAIT_MATCH_MS`).

### 3.2 `lib/realtime/cache-handlers.ts`

- Funciones puras de **merge** tras fetch parcial y **`writePlayerMatchBundleQueryCache`**.
- **`reduceMatchRealtimeEvents`** es alias **deprecated** de **`foldMatchRealtimeBatch`** (retrocompatibilidad).
- Tipo **`MatchRealtimeRowEvent`** reexportado desde `realtime-types.ts`.

### 3.3 `lib/app-context.tsx`

- Refs **`matchOpportunitiesRef`**, **`participatingOpportunityIdsRef`**, **`rivalChallengesRef`** para merges deterministas en el flush asíncrono.

### 3.4 `lib/query-keys.ts`

- **`queryKeys.playerSession.matchBundle(userId)`**: caché TanStack que espeja el bundle del jugador tras cada sync.

---

## 4. Optimización I/O (fases 7–10) — resumen técnico

| Fase | Qué se hizo |
| ---- | ------------- |
| **7** | Eliminar `loadPlayerMatchBundle` en el Realtime del canal match; refresco por **ids** + merge + sync Context/Query. |
| **8** | Migración SQL `supabase/migrations/20260504130000_add_critical_indexes.sql` (índices en `match_opportunities`, `profiles`, `rival_challenges`, `app_user_feedback`). |
| **9** | `fetchLastMessagesForOpportunities`: por `opportunity_id`, **una fila** (`limit(1)`), sin scan masivo multi-chat en un solo `.in()` sin tope. |
| **10** | `lib/services/matches-hub.service.ts`: arrays al RPC `matches_hub_secondary_bundle` **capados** con `MAX_HUB_SECONDARY_IDS` desde `limits.ts`. |

Documentación detallada por archivo y checklist: **`OPTIMIZACION-IO-FASE-7-10.md`**.

---

## 5. Consultas y RPC relacionados

- Listado principal y refresco parcial: **`fetchMatchOpportunities`** / **`fetchMatchOpportunitiesByIds`** en `lib/supabase/queries.ts` (vista `match_opportunities_masked`, mismo pipeline de enriquecimiento).
- Hub secundario: **`fetchMatchesHubSecondaryBundle`** en `lib/services/matches-hub.service.ts` (RPC preferida + fallback REST).

Análisis más amplio de patrones PostgREST/RPC: **`QUERIES-SUPABASE-ANALISIS.md`**.

---

## 6. Auditoría de contratos y riesgos

Tablas campo a campo, payload Realtime vs SELECT, y cuándo el fetch es obligatorio: **`AUDITORIA-REALTIME-IO-DEFINITIVA.md`**.

---

## 7. Despliegue y base de datos

- Aplicar migraciones en el proyecto Supabase (incluida la de índices **20260504130000**) para que KPIs y filtros por fecha beneficien los nuevos índices.
- Variables de entorno: seguir **`/.env.example`**; no documentar secretos en este archivo.

---

## 8. Extensión futura (para nuevas features)

1. Importar refrescos de entidades derivadas solo desde **`lib/architecture/derived-entity-fetches.ts`** (o `@/lib/architecture`).
2. No reintroducir reducción WAL duplicada: usar **`foldMatchRealtimeBatch`** o **`handleRealtimeEvent`** según necesidad (unit tests / logs).
3. Cualquier nuevo límite global → **`limits.ts`**.
4. Mantener la regla: **merge en cliente solo para datos planos** acordes con la clasificación en **`entity-classification.ts`**.

---

## 9. Índice de documentos del proyecto (tema Realtime / I/O)

| Documento | Contenido |
| --------- | --------- |
| `DOCUMENTACION-ARQUITECTURA-REALTIME-Y-IO.md` | Este archivo — panorama único. |
| `OPTIMIZACION-IO-FASE-7-10.md` | Cambios por fase y lista de archivos tocados. |
| `AUDITORIA-REALTIME-IO-DEFINITIVA.md` | Contratos UI, payload, estrategia por tabla. |
| `REALTIME-SUPABASE-ANALISIS.md` | Análisis estático previo de suscripciones. |
| `ESQUEMA-INDICES-RPC-ANALISIS.md` | Índices y RPC en migraciones. |
| `QUERIES-SUPABASE-ANALISIS.md` | Patrones de queries en código. |

---

*Última actualización alineada con el estado del código en el repositorio; ante nuevas migraciones o refactors, actualizar las secciones 2–4 y el índice §9.*
