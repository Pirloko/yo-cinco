# Documentación: bundle del jugador — Context + TanStack Query unificados

Este documento describe la implementación que **centraliza** cualquier cambio al bundle de partidos del jugador (`matchOpportunities`, `participatingOpportunityIds`, `rivalChallenges`) para que **React Context** y el **espejo en TanStack Query** permanezcan alineados.

---

## Objetivo

- **Una sola regla de escritura:** todo cambio del bundle debe pasar por la misma función que actualiza Context y la clave `playerSession.matchBundle`.
- **Context = fuente principal** para la UI.
- **Query = espejo** (DevTools, futuros hooks; no sustituir al Context como fuente de verdad).

---

## Función canónica: `syncPlayerMatchBundleToContextAndCache`

**Ubicación:** `lib/architecture/state-sync.ts`

Recibe:

- `queryClient`
- `userId`
- `bundle` (`PlayerMatchBundle` desde `lib/services/match.service`)
- `setters` (los tres `setState` del bundle en `AppProvider`)

**Comportamiento:**

1. Aplica `bundle` al estado React (`setMatchOpportunities`, `setParticipatingOpportunityIds`, `setRivalChallenges`).
2. Escribe el mismo bundle en `queryKeys.playerSession.matchBundle(userId)` vía `writePlayerMatchBundleQueryCache` (`lib/realtime/cache-handlers.ts`).

---

## Capa en `AppProvider`: `applyPlayerMatchBundle`

**Ubicación:** `lib/app-context.tsx`

`applyPlayerMatchBundle(userId, bundle)` envuelve `syncPlayerMatchBundleToContextAndCache` con el `queryClient` del árbol (`QueryProvider` envuelve `AppProvider` en `components/providers.tsx`) y los setters memorizados del bundle.

### Bundle vacío

Constante de módulo `EMPTY_PLAYER_MATCH_BUNDLE` para resets (logout, sesión venue/admin sin catálogo jugador en memoria, etc.).

### Solo lista de partidos (`fetchLatestMatchOpportunities`)

Cuando solo se refresca la lista global de oportunidades (p. ej. tras finalizar partido, votación rival, admin), se usa **`applyPlayerMatchBundleWithMatchesList(userId, matches)`**, que conserva `participatingOpportunityIds` y `rivalChallenges` actuales mediante refs (`participatingOpportunityIdsRef`, `rivalChallengesRef`), igual que antes solo actualizaba `matchOpportunities`.

---

## Realtime

**Ubicación:** `lib/core/realtime-manager.ts`

El hook ya **no** recibe los tres setters ni `useQueryClient` para el bundle. Recibe **`applyPlayerMatchBundle`**.

Tras el pipeline habitual (cola → `foldMatchRealtimeBatch` → fetches por IDs → merge → `repairMatchOpportunitiesIfNeeded` → …), se llama:

`applyPlayerMatchBundle(userId, { matchOpportunities, participatingOpportunityIds, rivalChallenges })`.

Así, el path Realtime y el resto de la app comparten la misma ruta de escritura.

---

## Lectura en componentes: `usePlayerMatchBundleSafe`

**Ubicación:** `lib/hooks/use-player-match-bundle-safe.ts`  
**Reexport:** `lib/app-context.tsx` (`export { usePlayerMatchBundleSafe } from '...'`)

```ts
usePlayerMatchBundleSafe(expectedUserId: string)
```

Devuelve `matchOpportunities`, `rivalChallenges` y `participatingOpportunityIds` desde **`useAppMatch()`** (Context). En desarrollo, si `expectedUserId` no coincide con el usuario autenticado, se emite un aviso en consola.

**Recomendación:** no usar `useQuery(queryKeys.playerSession.matchBundle)` como fuente principal en UI; preferir Context o este hook.

---

## Documentación en claves y state-sync

- **`lib/query-keys.ts`:** JSDoc en `queryKeys.playerSession.matchBundle` indicando que es **solo espejo** y que la escritura la hace `syncPlayerMatchBundleToContextAndCache`.
- **`lib/architecture/state-sync.ts`:** comentario de cabecera actualizado (Context principal, Query espejo).

---

## Accesos directos a `match_opportunities` (auditoría / trazabilidad)

Donde el flujo no pasa por el pipeline Realtime “oficial” de listas enriquecidas, se añadieron comentarios del estilo:

`// ⚠️ DIRECT DB ACCESS — fuera del pipeline Realtime oficial (...)` con una breve motivación.

**Archivos tocados a modo de ejemplo:** `lib/app-context.tsx` (updates de organizador), `lib/supabase/message-queries.ts` (lectura mínima de `creator_id` para participantes), `lib/supabase/rival-challenge-queries.ts` (títulos para hidratar desafíos).

Rutas admin, API, SEO, etc. no se reescribieron; la política es documentar y centralizar el **estado en memoria del bundle** en `AppProvider`, no eliminar toda SQL directa del repositorio.

---

## Casos borde

- **Logout / `clearSessionState`:** se captura `userId` desde `currentUserRef` **antes** de limpiar sesión; si existe, se llama `applyPlayerMatchBundle(uid, EMPTY_PLAYER_MATCH_BUNDLE)`. Si no hay `userId`, se vacían los tres estados con los setters (sin escribir Query sin usuario).
- **Participantes por oportunidad / chat:** siguen en TanStack con `queryKeys.matchOpportunity.participants` y el realtime de participantes; **no** forman parte de `PlayerMatchBundle` (ver comentario en `state-sync`).

---

## Archivos clave (referencia rápida)

| Archivo | Rol |
|--------|-----|
| `lib/architecture/state-sync.ts` | `syncPlayerMatchBundleToContextAndCache` |
| `lib/realtime/cache-handlers.ts` | `writePlayerMatchBundleQueryCache` |
| `lib/app-context.tsx` | `applyPlayerMatchBundle`, `EMPTY_PLAYER_MATCH_BUNDLE`, todos los flujos que actualizan el bundle |
| `lib/core/realtime-manager.ts` | Recibe `applyPlayerMatchBundle` |
| `lib/query-keys.ts` | Documentación del espejo `matchBundle` |
| `lib/hooks/use-player-match-bundle-safe.ts` | Hook de lectura segura desde Context |
| `lib/services/match.service.ts` | Tipo `PlayerMatchBundle`, `loadPlayerMatchBundle` |

---

## Qué quedó fuera de este cambio

- No se modificaron **RPC de Supabase**, **RLS** ni contratos públicos de API.
- No se añadió un wrapper tipo `safeMatchOpportunitiesQuery` (opcional / futuro).
- Las consultas SQL dispersas en admin, métricas o SEO permanecen; la unificación aplica al **estado del bundle del jugador en cliente** y a su **espejo en Query**.
