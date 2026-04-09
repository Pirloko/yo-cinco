# Informe de auditoría e implementación — Sportmatch

**Alcance:** trabajo incremental de rendimiento, datos en cliente (TanStack Query) y Realtime, realizado sobre el repositorio **sportmatch** (Next.js 16, React 19, Supabase).  
**Referencia complementaria:** `DOCUMENTACION_PROYECTO.txt` (visión general del producto y fases 3–4 ya existentes).

Este documento concentra **lo implementado en la auditoría** descrita en conversación: separación de consumo de contexto, ampliación de Fase 5 (Query + mutaciones), ajustes de Realtime y correcciones de tipos asociadas.

---

## 1. Objetivos de la auditoría

| Objetivo | Resultado |
|----------|-----------|
| Reducir re-renders innecesarios en pantallas pesadas | Consumo de contexto **por dominio** (`useAppAuth`, `useAppUI`, `useAppMatch`, `useAppTeam`) en lugar de `useApp()` donde aplica. |
| Cache y fetching predecible | Más pantallas y flujos bajo **TanStack Query** con claves centralizadas e invalidación explícita. |
| Realtime más claro y acotado | **Canales separados** por dominio en jugador; **filtros** en reservas del panel centro cuando la plataforma lo permite. |
| Escrituras repetidas en panel centro | **`useMutation`** con `invalidateQueries` y recarga de listas de reservas cuando corresponde. |

---

## 2. Contexto React por dominio (Fase 1–2 adicional)

### 2.1 Idea

El valor del `AppProvider` era monolítico: cualquier cambio en un dominio podía re-renderizar componentes que solo necesitaban otro dominio. Los contextos en `lib/contexts/domain-contexts.tsx` ya exponían `useAppUI`, `useAppAuth`, `useAppMatch`, `useAppTeam`.

### 2.2 Implementación

- Los componentes de la SPA y hooks relevantes dejaron de usar **`useApp()`** para datos/acciones y pasaron a los hooks de dominio re-exportados desde `@/lib/app-context`.
- **`useApp()`** se mantiene **solo como export** (compatibilidad o depuración); en la aplicación no quedan consumidores en producción.

### 2.3 Ámbitos por hook (resumen)

- **`useAppUI`:** pantalla actual, perfiles públicos, chat/partido seleccionado, onboarding source, foco en equipos, etc.
- **`useAppAuth`:** sesión, usuario, login/logout, onboarding de venue, avatar, etc.
- **`useAppMatch`:** oportunidades de partido, rivales, participación, RPCs de partido/revuelta donde corresponda.
- **`useAppTeam`:** equipos, invitaciones, solicitudes, desafíos desde el lado “equipo”.

### 2.4 Corrección de contrato (match vs team)

Funciones como **`requestJoinPrivateRevuelta`** y **`respondToRevueltaExternalRequest`** pertenecen al contexto de **partidos** (`MatchContextValue`), no al de equipos. Se corrigió su uso en:

- `components/home-screen.tsx`
- `components/match-details-screen.tsx`

para tomarlas de **`useAppMatch()`**, evitando errores de TypeScript y alineando dominio real.

### 2.5 Medición opcional

Validar impacto con **React DevTools → Profiler** en rutas como Partidos o Detalle de partido (antes/después), si se requiere cuantificar.

---

## 3. TanStack Query — ampliación (Fase 5)

### 3.1 Infraestructura ya existente (contexto)

- `lib/query-client-provider.tsx` + `components/providers.tsx` (QueryClient global).
- Uso previo en: Home (ciudades), `/centro/[venueId]`, `match-details-screen`, `matches-screen`, `chat-screen`, etc. (detalle en `DOCUMENTACION_PROYECTO.txt`).

### 3.2 Nuevas claves en `lib/query-keys.ts`

| Prefijo | Uso |
|---------|-----|
| `explore` | Listado público de centros por región; grilla de disponibilidad por conjunto de venues + horizonte de días. |
| `teams` | Ajustes privados de equipo (`privateSettings`). |
| `create` | Lista de centros por geo del jugador; canchas; slots del día; alternativas por hora. |
| `venueDashboard` | Bundle dueño: venue + canchas + horario semanal (`ownerBundle`). |

Sigue existiendo **`stableIdsKey(ids[])`** para claves estables a partir de listas de IDs.

### 3.3 Pantallas y archivos tocados en esta auditoría

**Explorar**

- `components/explore-screen.tsx`
  - Ciudades: `useGeoCitiesWithVenuesInRegion` (misma clave que Home).
  - Centros: `useQuery` + `queryKeys.explore.publicVenues`.
  - Disponibilidad: `useQuery` + `queryKeys.explore.venueAvailabilityGrid` con **`keepPreviousData`**.

**Equipos**

- `components/teams-screen.tsx`
  - `useQuery` para `fetchTeamPrivateSettings`.
  - Tras guardar coordinación: **`queryClient.setQueryData`** en `queryKeys.teams.privateSettings`.

**Crear partido**

- `components/create-screen.tsx`
  - Lista de centros: **`useQuery`** + `queryKeys.create.sportsVenuesForPlayer(regionId, cityId)`.
  - Prefill desde `readCreatePrefill` en efecto aparte; si el venue enlazado no está en la lista, **`fetchVenueById`** y merge vía estado local + `useMemo`.
  - Canchas del venue, horarios del día y centros alternativos: `useQuery` con las claves `create.*` ya definidas.

**Panel centro (dueño)**

- `components/venue-dashboard-screen.tsx`
  - Carga principal: **`useQuery`** `queryKeys.venueDashboard.ownerBundle(ownerId)`; sincronización a estado local para formularios.
  - Sustitución de `reloadAll()` manual por **`invalidateQueries`** sobre esa clave.
  - **Mutaciones** (`useMutation`): confirmar/cancelar reserva, reserva manual, nombre/teléfono, alta/edición/baja de canchas, horario semanal, `updateVenueReservationFields` (p. ej. pagos vía `setReservationPayment` con `mutateAsync`).
  - En éxito: invalidación del bundle + **`refreshBookingsAndDashboard()`** cuando la operación afecta reservas visibles (día seleccionado y tablero si aplica).

**Otros (migración `useApp*`, sin Query nuevo en esta lista)**

Shell, auth, landing, onboarding, navegación inferior, carruseles/paneles auxiliares, hooks como `hooks/use-discover-teams.ts`, paneles admin, etc. — ver historial de git / búsqueda de `useAppAuth` | `useAppUI` | `useAppMatch` | `useAppTeam`.

---

## 4. Supabase Realtime

### 4.1 Jugador (`lib/app-context.tsx`)

- **Antes:** un canal `app-realtime:<userId>` con todas las suscripciones.
- **Ahora:** tres canales:
  - `app-rt:<userId>:match` — `match_opportunities`, `match_opportunity_participants`, `rival_challenges`
  - `app-rt:<userId>:team` — `team_invites`, `team_join_requests`, `team_members`, `teams`, `team_private_settings`
  - `app-rt:<userId>:users` — `profiles` (INSERT/DELETE + UPDATE con lógica de foto/moderación)
- El **debounce incremental** (`scheduleFlush` → `match` | `team` | `users`) **no cambia** en comportamiento.

### 4.2 Panel centro (`venue-dashboard-screen.tsx`)

- Nombre de canal incluye **firma de IDs de cancha** del centro para re-suscribir al cambiar canchas.
- Con **1–100 canchas**: `INSERT` y `UPDATE` en `venue_reservations` con filtro **`court_id=in.(...)`**; **`DELETE` sin filtro** (limitación documentada de Supabase para filtros en DELETE).
- Sin canchas o **>100 canchas**: suscripción `event: '*'` sin filtro de columna (comportamiento conservador).

### 4.3 Sin cambio

- Chat (`messages` filtrado por `opportunity_id`).
- Detalle de partido (participantes filtrados por oportunidad).

---

## 5. Validación técnica

Durante el trabajo se comprobó de forma habitual:

- `npx tsc --noEmit`
- `npm run build`

Conviene repetir tras pulls o cambios en dependencias.

---

## 6. Regresión manual sugerida

1. **Dos sesiones jugador:** crear/unirse a partido, equipos, invitaciones; comprobar que los datos se actualizan entre clientes abiertos.
2. **Perfil:** cambio de foto/nombre y campos de moderación si aplica; comprobar reflejo en sesión actual.
3. **Dueño de centro:** reservas del día y tablero; confirmar/cancelar; reserva manual; cambios de canchas/horarios; otro cliente (jugador) generando reserva y comprobar actualización (Realtime + refetch tras mutaciones).

---

## 7. Pendientes recomendados (fuera de esta auditoría)

- Métricas de producto, tests e2e o ampliar Query a otras pantallas según prioridad (ver cierre de `DOCUMENTACION_PROYECTO.txt`).
- Profiler de React si se necesita evidencia numérica del beneficio de `useApp*`.

---

## 8. Archivos de referencia rápida

| Área | Archivos |
|------|----------|
| Claves Query | `lib/query-keys.ts` |
| Contextos dominio | `lib/contexts/domain-contexts.tsx` |
| Provider / app | `lib/app-context.tsx`, `components/providers.tsx`, `lib/query-client-provider.tsx` |
| Doc general proyecto | `DOCUMENTACION_PROYECTO.txt` |

---

*Documento generado como resumen de la auditoría e implementación en cliente (contexto, TanStack Query, Realtime). Para esquema de BD, RPCs y APIs admin, seguir `DOCUMENTACION_PROYECTO.txt` y migraciones en `supabase/migrations/`.*
