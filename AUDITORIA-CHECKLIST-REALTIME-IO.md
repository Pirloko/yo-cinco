# Auditoría checklist — Realtime + I/O

Documento generado a partir del checklist (Bloques 0–4): validación de arquitectura Realtime + I/O frente a reglas explícitas (Realtime como señal, fetch por IDs, decision engine, sync Context/Query, consistency guard, anti-refetch masivo).

**Alcance:** auditoría de código; sin implementar fixes salvo que se decida aplicar los propuestos al final.

---

## 1. Cumple correctamente

- **Realtime como señal (match):** en `runMatchFlush` se acumula en cola, se reduce con `foldMatchRealtimeBatch` y se hacen `fetchMatchOpportunitiesByIds` / `fetchRivalChallengesByIds` y, si aplica, `fetchParticipatingOpportunityIds` — no se inyecta el `payload` de filas de partido al estado.
- **Motor de decisión centralizado:** `if (ev.table === 'match_opportunities')` y `rival_challenges` solo en `lib/architecture/realtime-decision-engine.ts` (no en `realtime-manager` ni en `cache-handlers`); el manager solo nombra tablas en la **suscripción** `postgres_changes` (enrutar a cola, no decidir estrategia).
- **`realtime-manager` y batch:** importa y usa `foldMatchRealtimeBatch` (vía re-export en `cache-handlers` si aplica al import).
- **Consistency guard:** existen `repairMatchOpportunitiesIfNeeded` y `findIncompleteMatchOpportunityIds`; se llama **después** del merge y **antes** de `syncPlayerMatchBundleToContextAndCache` (ver `lib/core/realtime-manager.ts` ~158–189). Valida heurísticamente `creatorName` y `dateTime` (extensible añadiendo condiciones en `matchOpportunityRowLooksIncomplete` o en el mapa de reparación).
- **Orden de merge:** merge MO → `repairMatchOpportunitiesIfNeeded` → merge rival → sync.
- **Anti-refetch masivo en Realtime:** `loadPlayerMatchBundle` **no** aparece en `realtime-manager.ts`.
- **Rival challenges vía SQL:** `from('rival_challenges')` solo en `lib/supabase/rival-challenge-queries.ts` (criterio estricto del checklist **sí** se cumple para esta tabla).
- **Hub limit:** `lib/services/matches-hub.service.ts` importa y aplica `MAX_HUB_SECONDARY_IDS` desde `lib/architecture/limits.ts` antes de la lógica del RPC.
- **Carrera en background:** existe `backgroundMatchBundleTokenRef`; se incrementa al inicio del flush, y tras `await Promise.all` se compara el token **antes** de leer refs y escribir (`if (tokenAtStart !== backgroundMatchBundleTokenRef.current) return`).
- **Espejo Query del bundle:** `writePlayerMatchBundleQueryCache` solo se define en `cache-handlers` y se invoca desde `state-sync.ts` (un solo camino de escritura a `queryKeys.playerSession.matchBundle`).
- **Logs de depuración:** en `realtime-decision-engine.ts` se usa `rtDevLog` con tags `REALTIME_ENGINE`, `FETCH_BY_IDS`, `MERGE_SAFE`, `INVALIDATE_TRIGGERED` (en consola salen como `[REALTIME_ENGINE]`, etc., al formatear con `` `[${tag}]` ``).
- **Participantes (Realtime):** se usa `fetchParticipatingOpportunityIds` cuando el plan lo pide; `fetchParticipantsForOpportunity` en pantallas / admin / merge de participantes (contexto de detalle, no listado global).

---

## 2. Desviaciones detectadas

| Puntos | Dónde / qué | Problema frente al checklist |
|--------|-------------|-------------------------------|
| **1 – `payload.new` / `payload.old`** | `components/chat-screen.tsx` ~269–298: `INSERT` en `messages` → se construye `UiMessage` desde `payload.new` y se hace `queryClient.setQueryData` | **No** es `MatchOpportunity` ni listas derivadas del motor de partidos: es entidad de chat (merge local). Arquitectura de “señal + fetch por ids” del **hub de partidos** no se rompe; el checklist lo marcaría solo si exigiera cero `payload` en toda la app. |
| **1** | `lib/app-context.tsx` (p. ej. ~1383, 1571, 1597) y otras: `.from('match_opportunities')` en flujos admin / mutación | Consultas directas a la tabla, **no** el patrón “fetch por ids del decision engine”. Son rutas distintas al pipeline Realtime jugador. |
| **3** | Varios: `message-queries.ts` ~154; `app-context.tsx`; `admin-*`; `app/api/admin/*`; `public-revuelta-server.ts`; `venue-dashboard-queries.ts`; `seo-rancagua-matches.ts`; `rival-challenge-queries.ts` ~79; etc. | El criterio literal *“solo `fetchMatchOpportunitiesByIds` / `fetchRivalChallengesByIds` / `fetchMatchOpportunities`”* **no** se cumple para `match_opportunities` en todo el repo. `rival_challenges` **sí** está acotada a `rival-challenge-queries.ts`. |
| **5** | `lib/app-context.tsx`: múltiples `setMatchOpportunities` / `setRivalChallenges` / `setParticipatingOpportunityIds` tras `loadPlayerMatchBundle` o mutaciones, **sin** `syncPlayerMatchBundleToContextAndCache` | `syncPlayerMatchBundleToContextAndCache` **solo** se llama desde `lib/core/realtime-manager.ts` (no hay otras importaciones en el repo). Incumple el enunciado estricto “siempre sync tras aplicar cambios”. Hoy el espejo TanStack `playerSession.matchBundle` **no** se lee en componentes (solo se escribe vía `state-sync` en el path Realtime), así que el impacto inmediato es bajo. |

---

## 3. Riesgos arquitectónicos

- **Doble fuente de verdad Context vs Query (futuro):** si en el futuro se lee `useQuery` con `queryKeys.playerSession.matchBundle` sin pasar por el mismo path que el login / `loadPlayerMatchBundle`, el dato de Query podría quedar obsoleto frente al Context. Riesgo **bajo hoy**, **medio** si se adopta esa clave en UI.
- **Lecturas dispersas de `match_opportunities`:** no invalidan el diseño del **canal match** (que ya va por ids + motor), pero sí aumentan la superficie de mantenimiento y de posibles incoherencias si alguien asume que “toda” lectura pasa por `derived-entity-fetches`.
- **Uso de `payload` en chat:** riesgo bajo: es el patrón esperado para mensajes; no sustituye fetches de oportunidades/retos.

**Nada indica** refetch masivo en el `realtime-manager` ni lógica de decisión duplicada fuera del engine + merges.

---

## 4. Fixes mínimos propuestos (solo si hace falta)

1. **Alineación con el checklist §5 (opcional, cuando importe):** en los puntos de `app-context` que ya tienen el bundle completo tras `loadPlayerMatchBundle`, **sustituir** las cuatro asignaciones de estado por **una** llamada a `syncPlayerMatchBundleToContextAndCache` (mismos setters y `userId`), para unificar Context y espejo Query. Hacerlo **por fases** (p. ej. login + un refresh) evita un refactor masivo.
2. **Documentación (si no se toca código):** en `DOCUMENTACION-ARQUITECTURA-REALTIME-Y-IO.md`, una frase explícita de que la regla “solo `sync`” aplica al **flush Realtime** y que login/admin usan `loadPlayerMatchBundle` + setters directos, y que el espejo Query se actualiza hoy principalmente en ese flush.
3. **No** hace falta tocar `chat-screen` salvo que se redefina la política “cero `payload` en toda la app” (sería un cambio de producto, no de bug del hub).

---

## Veredicto global

| Estado |
|--------|
| **Parcialmente correcto respecto al texto literal del checklist** (puntos 3 y 5 y alcance global de `match_opportunities`). |
| **Correcto en el núcleo Realtime + I/O del jugador** (motor, fetch por ids, guard, token, sin `loadPlayerMatchBundle` en Realtime, rival queries acotadas, hub limit). |
| **Sin fallas críticas ocultas** en el camino Realtime actual; el riesgo principal es **evolutivo** (Query mirror vs Context si se usa la query en UI). |

---

## Referencias de código (orientativas)

- `lib/core/realtime-manager.ts` — `runMatchFlush`, token, `repairMatchOpportunitiesIfNeeded`, `syncPlayerMatchBundleToContextAndCache`
- `lib/architecture/realtime-decision-engine.ts` — decisiones y logs
- `lib/architecture/consistency-guard.ts` — heurística incompletos
- `lib/architecture/state-sync.ts` — sync Context + Query
- `components/chat-screen.tsx` — Realtime mensajes con `payload.new`
