# Análisis de consultas Supabase / PostgREST (prioridad I/O)

**Alcance:** inventario a partir del **código del repo** y **migraciones SQL**.  
**No incluye:** frecuencia real, tamaño promedio de payload ni `EXPLAIN` en tu instancia (eso sale de **Supabase → Reports / Query performance**, **logs** o **pg_stat_statements** en el proyecto).

**Leyenda frecuencia aproximada (inferida):**

- **Muy alta:** arranque de sesión, cada vez que se refresca el listado global de partidos, realtime o muchas acciones post-mutación.
- **Alta:** pantallas principales (partidos, detalle, chat) o flujos repetidos.
- **Media:** flujos puntuales (equipos, reservas, admin).
- **Baja / variable:** acciones explícitas del usuario o rutas admin.

---

## 1. Listado de oportunidades + enriquecimiento (el “núcleo” de lectura)

| Campo | Valor |
|--------|--------|
| **Equivalente SQL (resumen)** | `SELECT` columnas + embed `geo_cities` desde la vista `match_opportunities_masked` `ORDER BY date_time ASC`; luego `SELECT ... FROM profiles WHERE id IN (...)`; `SELECT opportunity_id, user_id, status FROM match_opportunity_participants WHERE opportunity_id IN (...)`; opcional `venue_reservations` por `id IN (...)`; `sports_venues` para teléfonos y fallback por ciudad/nombre. |
| **Origen** | `lib/supabase/queries.ts` → `fetchMatchOpportunities` |
| **Invocación** | `lib/services/match.service.ts` → `loadPlayerMatchBundle` / `fetchLatestMatchOpportunities`; `lib/app-context.tsx` (múltiples refrescos); `lib/core/realtime-manager.ts` (tras eventos). |
| **Frecuencia aproximada** | **Muy alta** |
| **Tamaño respuesta (orden de magnitud)** | Proporcional a **N partidos visibles por RLS** + varias sub-consultas; suele ser el **payload más grande** en home/partidos. |
| **Índices (migraciones)** | `match_opportunities`: `idx_match_opportunities_creator`, `idx_match_opportunities_status`, `idx_match_opportunities_city_id`, `idx_match_opportunities_city_id_time`, etc. `profiles`: PK `id`, `idx_profiles_city_id`. `match_opportunity_participants`: `idx_mop_user` (`user_id`); PK compuesta (`opportunity_id`,`user_id`) útil para filtros por `opportunity_id`. |

**Nota I/O:** varias idas en red si no se unifican (1 vista + hasta 4–5 lecturas adicionales en el peor caso).

---

## 2. RPC `matches_hub_secondary_bundle` (consolida ratings + últimos mensajes + reseñas)

| Campo | Valor |
|--------|--------|
| **SQL (definición en BD)** | Función `sql` que arma `jsonb` con: (1) `match_opportunity_ratings` `WHERE opportunity_id = ANY($1)`, (2) `DISTINCT ON (opportunity_id)` en `messages` `WHERE opportunity_id = ANY($2)` ordenado por `opportunity_id, created_at DESC`, (3) `sports_venue_reviews` por `venue_reservation_id = ANY($3)`. |
| **Origen** | Migración `supabase/migrations/20260431130000_matches_hub_and_detail_ratings_bundle_rpc.sql` · Cliente: `lib/services/matches-hub.service.ts` → `fetchMatchesHubSecondaryBundle` |
| **Invocación** | Flujo del **hub de partidos** (pestañas, chats, finalizados) al armar datos secundarios. |
| **Frecuencia aproximada** | **Alta** (cada carga del hub o invalidación de datos). |
| **Tamaño** | Un **solo JSON**; crece con cantidad de IDs en los tres arreglos. |
| **Índices** | `match_opportunity_ratings`: `idx_mor_opportunity`, `idx_mor_rater`. `messages`: `idx_messages_opportunity` = `(opportunity_id, created_at)` — alinea con `DISTINCT ON` + orden. |

**Fallback:** si el RPC falla, se dispara en paralelo REST en `fetchMatchesHubSecondaryBundleViaRest` (hasta **3** lecturas extra).

---

## 3. RPC `match_detail_ratings_bundle`

| Campo | Valor |
|--------|--------|
| **SQL (definición)** | Agrega ratings agregados, últimos comentarios (`LIMIT 4`) y **mi** fila en `match_opportunity_ratings` para `p_opportunity_id`, con `rater_id = auth.uid()`. |
| **Origen** | Misma migración `20260431130000_*` · Cliente: `lib/services/match-detail.service.ts` → `fetchMatchDetailRatingsBlock` |
| **Frecuencia** | **Alta** al abrir **detalle de partido**. |
| **Índices** | `idx_mor_opportunity`; filtro por `rater_id` usa `idx_mor_rater` cuando aplica. |

---

## 4. Mensajes del chat + perfiles emisores

| Campo | Valor |
|--------|--------|
| **Equivalente** | `SELECT id, sender_id, content, created_at FROM messages WHERE opportunity_id = $1 ORDER BY created_at ASC`; `SELECT id, name, photo_url FROM profiles WHERE id IN (...)`. |
| **Origen** | `lib/supabase/message-queries.ts` → `fetchMessagesForOpportunity` |
| **Frecuencia** | **Alta** al abrir chat. |
| **Índices** | `idx_messages_opportunity (opportunity_id, created_at)`; `idx_messages_sender (sender_id)`; PK `profiles(id)`. |

---

## 5. Último mensaje por varias oportunidades (fallback REST del hub)

| Campo | Valor |
|--------|--------|
| **Equivalente** | `SELECT opportunity_id, content, created_at FROM messages WHERE opportunity_id IN (...) ORDER BY created_at DESC` — el cliente se queda con el **primero por `opportunity_id`** (simula “último mensaje”). |
| **Origen** | `lib/supabase/message-queries.ts` → `fetchLastMessagesForOpportunities` |
| **Frecuencia** | **Alta** cuando el RPC del hub no está disponible o falla. |
| **Riesgo I/O** | Sin `LIMIT` global: puede **traer muchas filas** si hay chats activos y muchos mensajes (Postgres debe ordenar/devolver hasta deduplicar en cliente). El RPC usa `DISTINCT ON` en servidor (más eficiente). |

---

## 6. Participantes de un partido + perfiles

| Campo | Valor |
|--------|--------|
| **Equivalente** | `SELECT creator_id FROM match_opportunities WHERE id = $1`; `SELECT user_id, status, ... FROM match_opportunity_participants WHERE opportunity_id = $1`; `SELECT id, name, photo_url, whatsapp_phone, account_type FROM profiles WHERE id IN (...)`. |
| **Origen** | `lib/supabase/message-queries.ts` → `fetchParticipantsForOpportunity` |
| **Frecuencia** | **Alta** en pantalla de detalle / listas de jugadores. |

---

## 7. Perfil del usuario autenticado (embed geo)

| Campo | Valor |
|--------|--------|
| **Equivalente** | `SELECT` `PROFILE_SELECT_WITH_GEO` (string largo con embed `geo_cities`) `FROM profiles WHERE id = $1` **limit 1**. |
| **Origen** | `lib/supabase/queries.ts` → `fetchProfileForUser` · `lib/app-context.tsx` (carga / refresco de usuario). |
| **Frecuencia** | **Muy alta** tras login y tras varias acciones que llaman `refreshCurrentUserProfile`. |
| **Índices** | PK `profiles.id`; `idx_profiles_city_id` si filtras por ciudad en otros queries. |

---

## 8. RPC `fetch_public_player_profile`

| Campo | Valor |
|--------|--------|
| **Equivalente** | `rpc('fetch_public_player_profile', { p_user_id })` — SQL interno en BD (`SECURITY DEFINER`), no repetido en TS. |
| **Origen** | `lib/supabase/queries.ts` → `fetchPublicPlayerProfile` |
| **Frecuencia** | **Media/alta** al abrir ficha pública de jugador. |

---

## 9. Equipos con miembros (plantilla completa)

| Campo | Valor |
|--------|--------|
| **Equivalente** | `SELECT` `teams` con embed geo (`TEAM_SELECT_WITH_GEO`) `ORDER BY created_at DESC`; `SELECT ... FROM team_members WHERE team_id IN (...)`; `SELECT id, name, photo_url FROM profiles WHERE id IN (...)`. |
| **Origen** | `lib/supabase/team-queries.ts` → `fetchTeamsWithMembers` |
| **Frecuencia** | **Media** (pantalla equipos / carga global en contexto). |

---

## 10. Reservas “solo cancha” del jugador (hub) + join a canchas y sedes

| Campo | Valor |
|--------|--------|
| **Equivalente** | `venue_reservations` filtrado por `booker_user_id`, `match_opportunity_id IS NULL`, estados, `ORDER BY starts_at DESC LIMIT 150`; luego `venue_courts` y `sports_venues` por IDs derivados. |
| **Origen** | `lib/supabase/venue-queries.ts` → `fetchPlayerVenueReservationsSoloForHub` |
| **Frecuencia** | **Media** (pestaña partidos / reservas). |
| **Índices** | `idx_venue_reservations_booker (booker_user_id)`; `idx_venue_reservations_court_time (court_id, starts_at)`; extras en `20260502120000_venue_bi_dashboard_block1.sql` (status, payment, booker+starts). |

---

## 11. RPC `venue_public_reservations_in_range` (disponibilidad pública)

| Campo | Valor |
|--------|--------|
| **Tipo** | RPC; lógica en BD para reservas en rango (explorar / reservar). |
| **Origen** | `lib/supabase/venue-queries.ts` (llamada `rpc('venue_public_reservations_in_range', ...)`) |
| **Frecuencia** | **Media/alta** en flujo **explorar / crear con franja**. |

---

## 12. RPC `join_match_opportunity`

| Campo | Valor |
|--------|--------|
| **Tipo** | Escritura + validaciones en servidor (`SECURITY DEFINER`). |
| **Origen** | `lib/app-context.tsx` |
| **Frecuencia** | **Alta** por acción de usuario (cada unión a partido). |
| **I/O** | Menos lectura masiva que los listados; impacto en **locks/triggers** sobre `match_opportunity_participants` y contadores. |

---

## 13. RPC `book_venue_slot`

| Campo | Valor |
|--------|--------|
| **Tipo** | Escritura de `venue_reservations` + reglas de solape. |
| **Origen** | `lib/app-context.tsx` |
| **Frecuencia** | **Media** (reserva explícita). |

---

## 14. Otros perfiles (explorar / swipe)

| Campo | Valor |
|--------|--------|
| **Equivalente** | `SELECT` perfil completo con geo `FROM profiles WHERE gender = $1 AND account_type = 'player' AND id <> $2`. |
| **Origen** | `lib/supabase/queries.ts` → `fetchOtherProfiles` |
| **Frecuencia** | **Media** según uso de explorar. |
| **Índices** | `idx_profiles_gender`; combinación con `account_type` puede no estar cubierta por índice compuesto explícito en migraciones listadas — revisar en BD si hay escaneos grandes. |

---

## 15. Participación del usuario (IDs de oportunidades)

| Campo | Valor |
|--------|--------|
| **Equivalente** | `SELECT opportunity_id FROM match_opportunity_participants WHERE user_id = $1 AND status IN ('pending','confirmed')` (e invitaciones `status = 'invited'` en otra función). |
| **Origen** | `lib/supabase/message-queries.ts` → `fetchParticipatingOpportunityIds`, `fetchInvitedOpportunityIds` |
| **Frecuencia** | **Alta** en bundle inicial de partidos. |
| **Índices** | `idx_mop_user (user_id)` — adecuado para este patrón. |

---

## Resumen: mayor carga de lectura probable

1. **`fetchMatchOpportunities`** (cadena vista + `profiles` + `match_opportunity_participants` + reservas + sedes).  
2. **RPC `matches_hub_secondary_bundle`** (o su fallback triple REST).  
3. **`fetchLastMessagesForOpportunities`** en modo fallback (muchas filas de `messages` posibles).  
4. **Chat completo** `messages` + `profiles`.  
5. **RPC `match_detail_ratings_bundle`** en cada detalle.

## Cómo obtener números reales en tu proyecto

1. **Supabase Dashboard → Reports → API** o **Database → Query performance** (según plan).  
2. Habilitar **`pg_stat_statements`** en la instancia (si no está) y consultar top queries por `total_exec_time`.  
3. En el cliente, **Chrome DevTools → Network**: filtrar `rest/v1` y `rpc` y revisar tamaño de respuesta por pantalla.

---

*Documento generado por análisis estático del repositorio; actualizar tras cambios grandes en `lib/supabase/*` o nuevas migraciones.*
