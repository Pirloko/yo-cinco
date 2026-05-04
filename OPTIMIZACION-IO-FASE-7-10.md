# Optimización de I/O Supabase (Fases 7–10) — registro de cambios

**Fecha de referencia:** documentación alineada con el estado del repositorio tras el trabajo de optimización estructural.  
**Objetivo original:** reducir lecturas a Postgres, eliminar refetch masivo en Realtime para el dominio “partidos del jugador”, añadir índices, acotar fallbacks REST y el volumen de datos en el hub de partidos, **sin cambiar RLS** ni el contrato de tipos de la app.

---

## 1. Resumen ejecutivo

| Fase | Tema | Resultado principal |
|------|------|---------------------|
| **7** | Realtime jugador (canal `match`) | Deja de llamar `loadPlayerMatchBundle` en cada ráfaga; se refrescan **solo** oportunidades y desafíos afectados (por id) y, si aplica, la lista de ids en los que el usuario participa. |
| **8** | Base de datos | Nueva migración con 6 índices `CREATE INDEX IF NOT EXISTS` en tablas críticas. |
| **9** | Último mensaje por chat (fallback REST) | Cada chat se consulta con `limit(1)` en lugar de un único query masivo con `.in()` sin tope. |
| **10** | RPC / hub | Los tres arrays enviados a `matches_hub_secondary_bundle` (y al fallback REST) se **recortan a 20 ids** por categoría. |

**No modificado en esta tanda (a propósito):** canales Realtime de **equipos** y **perfiles (lista “otros jugadores”)** siguen usando `loadPlayerTeamBundle` y `loadOtherPlayersForUser` como antes, para no ampliar el alcance y el riesgo de regresión.

---

## 2. Fase 7 — Realtime: de bundle completo a actualización acotada

### 2.1 Problema previo

En `lib/core/realtime-manager.ts`, cualquier evento en `match_opportunities`, `match_opportunity_participants` o `rival_challenges` provocaba, tras un debounce, la ejecución de `loadPlayerMatchBundle`, que a su vez llama en paralelo a:

- `fetchMatchOpportunities` — **lectura de todas** las oportunidades visibles (vista enmascarada + enriquecimiento),
- `fetchParticipatingOpportunityIds`,
- `fetchRivalChallengesForUser` — en la práctica, desafíos visibles con agregación de equipos y títulos.

Eso multiplicaba I/O aunque solo cambiara **una** fila.

### 2.2 Enfoque nuevo

1. **Cola de eventos:** cada callback de `postgres_changes` en esas tablas empuja un objeto `{ table, eventType, old, new }` y programa un flush con la misma ventana de debounce (250 ms) y tope (2 s) que antes, pero **solo para el subdominio match** (timers `matchDebounceTimer` / `matchMaxWaitTimer` independientes de team/users).

2. **Reducción a conjuntos de trabajo** (`lib/realtime/cache-handlers.ts`, `reduceMatchRealtimeEvents`):
   - borrados de oportunidades y desafíos (ids a eliminar del estado local),
   - ids de oportunidades a **volver a pedir** por REST (insert/update/participantes que implican refrescar esa tarjeta),
   - ids de desafíos a hidratar de nuevo,
   - bandera `refreshParticipatingIds` si hubo cambios en `match_opportunity_participants`.

3. **Lecturas acotadas:**
   - `fetchMatchOpportunitiesByIds(supabase, ids)` en `lib/supabase/queries.ts` — misma cadena de mapeo que el listado global (`buildMatchOpportunitiesFromRows`), pero la primera query a la vista usa `.in('id', ids)`.
   - `fetchRivalChallengesByIds` en `lib/supabase/rival-challenge-queries.ts` — mismo enriquecimiento que el listado completo, filtrado por `.in('id', ids)`.
   - `fetchParticipatingOpportunityIds` solo cuando `refreshParticipatingIds` es verdadero (query ligera a participantes).

4. **Merge en memoria:** `mergeMatchOpportunitiesAfterFetch` y `mergeRivalChallengesAfterFetch` actualizan listas por id, eliminan filas borradas, y si un id se pidió pero la vista no devolvió fila (p. ej. RLS), **se quita** la entrada local para no mostrar datos obsoletos.

5. **Coherencia con acciones optimistas / autoritativas:** se mantiene `backgroundMatchBundleTokenRef`: si el usuario dispara una mutación que incrementa el token, un flush Realtime en vuelo **no aplica** resultados obsoletos (misma semántica que antes con el bundle completo).

6. **TanStack Query:** `writePlayerMatchBundleQueryCache` escribe el objeto `{ matchOpportunities, participatingOpportunityIds, rivalChallenges }` en la clave `queryKeys.playerSession.matchBundle(userId)`. La UI principal sigue leyendo del **Context de React**; la cache sirve como espejo para herramientas / futuros consumidores y cumple el requisito de usar `setQueryData`.

### 2.3 Refs en `AppProvider` (`lib/app-context.tsx`)

Para poder calcular el siguiente estado de forma determinista dentro del flush asíncrono (sin depender de `setState` encadenados ambiguos), se añadieron referencias actualizadas en cada render:

- `matchOpportunitiesRef`
- `participatingOpportunityIdsRef`
- `rivalChallengesRef`

Apuntan siempre al estado actual de esos tres arrays antes de fusionar con los datos frescos.

### 2.4 Claves nuevas (`lib/query-keys.ts`)

- `queryKeyRoot.playerSession`
- `queryKeys.playerSession.matchBundle(userId)`

### 2.5 Dependencias del hook Realtime

`usePlayerRealtimeManager` ahora usa `useQueryClient()` de `@tanstack/react-query` y declara `queryClient` en el array de dependencias del `useEffect` del canal.

---

## 3. Fase 8 — Migración de índices

**Archivo:** `supabase/migrations/20260504130000_add_critical_indexes.sql`

| Índice | Tabla | Columnas | Motivo esperado |
|--------|--------|---------|-----------------|
| `idx_match_opportunities_created_at` | `match_opportunities` | `(created_at)` | Rangos temporales en KPIs / admin sin barrer toda la tabla. |
| `idx_profiles_account_created` | `profiles` | `(account_type, created_at)` | Cohortes y filtros por tipo de cuenta + fecha. |
| `idx_rival_challenges_challenger` | `rival_challenges` | `(challenger_team_id)` | Filtros por equipo retador (p. ej. agregados por equipo). |
| `idx_rival_challenges_challenged` | `rival_challenges` | `(challenged_team_id)` | Igual para equipo retado. |
| `idx_rival_challenges_accepted` | `rival_challenges` | `(accepted_team_id)` | Igual para equipo aceptado. |
| `idx_app_user_feedback_user` | `app_user_feedback` | `(user_id)` | Listados o moderación por usuario sin scan completo. |

Todos usan `IF NOT EXISTS` para aplicación idempotente.

**Acción en proyecto:** ejecutar migración en Supabase (`supabase db push`, migración manual en SQL Editor o pipeline CI).

---

## 4. Fase 9 — `fetchLastMessagesForOpportunities`

**Archivo:** `lib/supabase/message-queries.ts`

### Antes

Una sola petición:

```text
messages WHERE opportunity_id IN (...)
ORDER BY created_at DESC
```

sin `LIMIT` global: Postgres podía devolver **todas** las filas de mensajes de **todos** esos chats; el cliente solo usaba la primera por `opportunity_id` en el bucle, pero el coste de I/O y red ya estaba pagado.

### Después

Para cada `opportunity_id` único (tras deduplicar):

- `eq('opportunity_id', oid)`
- `order('created_at', { ascending: false })`
- `limit(1)`
- `maybeSingle()`

En paralelo con `Promise.all`. El número de chats efectivos queda acotado en la práctica por la **Fase 10** en el hub (máx. 20 ids por lista), de modo que el fallback REST no dispara cientos de round-trips en escenarios extremos.

El camino principal del hub sigue siendo el RPC `matches_hub_secondary_bundle`; esta función solo se usa cuando el RPC falla o no está disponible.

---

## 5. Fase 10 — Límite de arrays en el hub secundario

**Archivo:** `lib/services/matches-hub.service.ts`

- Constante `MAX_HUB_SECONDARY_IDS = 20`.
- Función interna `capHubIdList`: si la lista supera 20 elementos, se conservan **los primeros 20 en el orden que ya trae la pantalla** (`slice(0, 20)`).

Se aplican **tres** listas por separado:

- `finishedOpportunityIds` → ratings de partidos cerrados,
- `activeChatOpportunityIds` → últimos mensajes,
- `pastSoloReservationIds` → reseñas de reserva solo cancha.

Tanto la llamada RPC como `parseHubRpcPayload` / `fetchMatchesHubSecondaryBundleViaRest` usan ya las versiones **capadas** (`finishedIds`, `chatIds`, `reservationIds`).

### Implicación de UX

Si un usuario tuviera más de 20 ítems en alguna de esas categorías a la vez, **no** cargará datos secundarios para los que queden fuera del primer bloque de 20. En uso típico las listas filtradas del hub son más cortas; si en el futuro hace falta priorizar otro criterio (p. ej. fecha), habría que ordenar antes del `slice` en el componente que arma los ids.

---

## 6. Archivos tocados (lista)

| Ruta | Cambio |
|------|--------|
| `lib/realtime/cache-handlers.ts` | **Nuevo:** reducción de eventos, merges, escritura en TanStack Query. |
| `lib/core/realtime-manager.ts` | Refactor canal match: cola, flush acotado, sin `loadPlayerMatchBundle`; uso de `useQueryClient`. |
| `lib/app-context.tsx` | Refs para estado de partidos / participación / desafíos pasadas al Realtime manager. |
| `lib/query-keys.ts` | Claves `playerSession` / `matchBundle`. |
| `lib/supabase/queries.ts` | Refactor interno `buildMatchOpportunitiesFromRows`; nuevas `fetchMatchOpportunitiesByIds`. |
| `lib/supabase/rival-challenge-queries.ts` | `hydrateRivalChallenges`; nueva `fetchRivalChallengesByIds`. |
| `lib/supabase/message-queries.ts` | `fetchLastMessagesForOpportunities` por chat con `limit(1)`. |
| `lib/services/matches-hub.service.ts` | Tope de 20 ids por lista + uso en RPC y fallback. |
| `supabase/migrations/20260504130000_add_critical_indexes.sql` | **Nuevo:** índices Fase 8. |

---

## 7. Validación recomendada

1. **Realtime jugador:** dos clientes o pestañas; crear/editar/cancelar partido; unirse/salir; verificar lista y “mis partidos” sin duplicados ni ids pegados.
2. **Desafíos rival:** aceptar/rechazar; lista de desafíos coherente.
3. **Hub Partidos:** pestañas que dependan del bundle secundario (ratings, último mensaje, reseña solo cancha) con volumen normal y, si es posible, con muchos ids para observar el recorte a 20.
4. **Post-migración:** Supabase → Reports → Query performance; comparar antes/después en consultas por `created_at`, `account_type`, equipos en `rival_challenges`.
5. **Build:** `npm run build` sin errores.

---

## 8. Fuera de alcance / no tocado

- Políticas RLS, vistas SQL y RPC del servidor (salvo nueva migración de índices).
- Realtime de tablas de equipo y flujo `scheduleFlush('team')` / `scheduleFlush('users')`.
- Fase 11 (materializaciones, trocear `admin_ceo_business_snapshot`, etc.) — opcional y dependiente de métricas.

---

*Este documento describe solo las modificaciones descritas arriba; si el código evoluciona, conviene actualizar la lista de archivos y las constantes (`MAX_HUB_SECONDARY_IDS`, timers del flush match).*
