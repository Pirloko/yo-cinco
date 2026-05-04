# Esquema, índices y funciones RPC (análisis estático)

**Fuente:** migraciones en `supabase/migrations` y llamadas `supabase.rpc()` / `admin.rpc()` en el código TypeScript.  
**Límite:** no se dispone de `EXPLAIN (ANALYZE, BUFFERS)` ni de estadísticas reales de producción; las secciones sobre *full scan* y coste son **hipótesis** basadas en el esquema y en los patrones de filtrado.

---

## 1. Índices actuales (por tabla)

Se listan **índices y restricciones únicas** explícitas en migraciones. Las claves primarias (PK) y `UNIQUE` de PostgreSQL generan **índices B-tree** implícitos: si una columna “crítica” es PK o primer campo de un índice compuesto, se anota como cubierta.

| Tabla | Índices / restricciones relevantes |
|-------|-----------------------------------|
| **app_user_feedback** | `idx_app_user_feedback_created` → `(created_at DESC)` |
| **geo_cities** | `geo_cities_region_slug_key` UNIQUE `(region_id, slug)`; `idx_geo_cities_region` |
| **geo_countries** | `geo_countries_iso_code_key` UNIQUE |
| **geo_regions** | `geo_regions_country_code_key` UNIQUE; `idx_geo_regions_country` |
| **match_opportunities** | `idx_match_opportunities_*`: creator, city+time (location, date_time), gender, status, city_id, city_id+date_time; `idx_match_opportunities_private_team`; `idx_match_opportunities_join_code_active_private` (único, parcial) |
| **match_opportunity_participants** | **PK** `(opportunity_id, user_id)`; `idx_mop_user` → `(user_id)` |
| **match_opportunity_ratings** | `idx_mor_opportunity`; `idx_mor_rater` |
| **match_opportunity_reschedules** | `idx_match_opportunity_reschedules_opp_created` → `(opportunity_id, created_at)` |
| **match_participants** | **PK** `(match_id, user_id)` |
| **matches** | Solo **PK** `(id)` |
| **messages** | `idx_messages_opportunity` → `(opportunity_id, created_at)`; `idx_messages_sender` → `(sender_id)` |
| **notifications** | `(user_id, created_at desc)`; `(user_id, is_read, created_at desc)` |
| **player_reports** | `(reported_user_id, created_at desc)`; `(status, created_at desc)`; `(reporter_id, created_at desc)` |
| **profiles** | **PK** `(id)`; `idx_profiles_city`, `idx_profiles_gender`, `idx_profiles_city_id`, `idx_profiles_last_seen_at_recent` |
| **push_subscriptions** | `(user_id)` |
| **revuelta_external_join_requests** | `idx_revuelta_ext_req_opp` → `(opportunity_id, status)`; `idx_revuelta_ext_req_requester` |
| **rival_challenges** | **UNIQUE** `(opportunity_id)`; `idx_rival_challenges_status`; `idx_rival_challenges_challenged_cap` / `challenger_cap` (capitanes) |
| **sports_venue_reviews** | `idx_sports_venue_reviews_venue`; `(venue_id, created_at desc)`; **UNIQUE** `(venue_reservation_id)` |
| **sports_venues** | `idx_sports_venues_owner`, `idx_sports_venues_city`, `idx_sports_venues_city_id` |
| **team_invites** | `idx_team_invites_invitee` → `(invitee_id, status)`; `uq_team_invites_pending` parcial `(team_id, invitee_id)` |
| **team_join_requests** | `uq_team_join_requests_pending` (único parcial); `idx_team_join_requests_team` / `requester` |
| **team_members** | **PK** `(team_id, user_id)`; `idx_team_members_user` → `(user_id)` |
| **team_private_settings** | **PK** `(team_id)` |
| **teams** | `idx_teams_captain`, `idx_teams_city`, `idx_teams_city_id`, `idx_teams_vice_captain` |
| **venue_courts** | `idx_venue_courts_venue`, `idx_venue_courts_venue_id_id` → `(venue_id, id)` |
| **venue_reservation_events** | `idx_vre_reservation_id` → `(reservation_id, created_at desc)` |
| **venue_reservations** | `idx_venue_reservations_court_time` / `court_starts_ends` / `status_starts` / `payment_status_starts` / `booker_starts`; `idx_venue_reservations_booker`; `idx_venue_reservations_match` |
| **venue_weekly_hours** | **UNIQUE** `(venue_id, day_of_week)` (cubre búsquedas por `venue_id` como prefijo) |

*Otras tablas iniciales no listadas arriba suelen depender solo de PK/FK sin índice secundario adicional en el repo.*

---

## 1.1 Tablas críticas: cobertura de `user_id`, `opportunity_id`, `team_id`, `created_at`, `court_id`

Criterio: “cubierto” = la columna es **PK/UNIQUE propia**, **primera columna** de un índice compuesto útil, o tiene **índice propio** con el mismo rol (p. ej. `sender_id` actúa como “usuario emisor” en `messages`).

| Columna / concepto | Tablas con riesgo o lagunas |
|--------------------|----------------------------|
| **user_id** (o `id` perfil) | **app_user_feedback:** tiene `user_id` **sin** índice (solo `created_at`). Filtros por usuario → posible scan. **match_participants:** no hay `user_id` indexado salvo en PK con `match_id` primero; el código app no referencia esta tabla hoy, pero un listado “por jugador” sería caro. |
| **opportunity_id** | **match_opportunities:** PK `id`. **match_opportunity_participants / messages / mor / revuelta_***: cubierto por PK o índices. **matches:** `opportunity_id` **sin** índice explícito (no es PK); poco uso en TS. **rival_challenges:** `opportunity_id` **UNIQUE** → índice implícito. |
| **team_id** | **teams:** PK. **team_members, team_invites (parcial), team_join_requests, team_private_settings:** cubiertos. **rival_challenges:** `challenger_team_id`, `challenged_team_id`, `accepted_team_id` **no** tienen índice en migraciones; las consultas con `OR` por equipo (p. ej. `team_completed_rival_counts`) son candidatas a coste alto. |
| **created_at** | **match_opportunities:** muchas agregaciones admin usan rango sobre `created_at` **sin** índice dedicado (ver §2). **profiles:** rangos de alta de jugadores por `created_at` sin índice. **teams** / varias tablas: sin índice por `created_at` salvo casos compuestos (p. ej. reseñas con `venue_id`). |
| **court_id** | **venue_reservations:** múltiples índices que inician o incluyen `court_id` y ventana temporal → bien orientado a solapes y calendario. |

---

## 2. “Queries” que podrían no usar índices (riesgo de secuencial scan)

**Importante:** confirmar en el proyecto Supabase con `EXPLAIN (ANALYZE, BUFFERS)` sobre las consultas reales (incl. RLS).

| Área | Patrón | Motivo del riesgo |
|------|--------|-------------------|
| **Admin CEO** `admin_ceo_business_snapshot` | Decenas de `SELECT` sobre `match_opportunities` con `WHERE created_at >= ... AND created_at < ...` y a veces `status` | No hay `(created_at)` ni `(created_at, status)` en el repo. El planificador puede usar scan + filtro o bitmap si el dataset es pequeño. |
| **Admin CEO** | `profiles` con `created_at` en rango y `account_type = 'player'` | Sin índice en `(account_type, created_at)` o `created_at`. |
| **Admin CEO** | Subconsultas / joins `match_opportunity_participants` por `opportunity_id` | `opportunity_id` en PK: **bien** para unir por oportunidad. |
| **BI centro** `bi_venue_*` | Filtra `bi_venue_reservations_fact` por `sports_venue_id` y solape temporal | La vista une `venue_reservations` → `venue_courts`. Existe `idx_venue_courts_venue_id_id` e índices por `court_id`+tiempo: **rutas razonables**; validar con EXPLAIN. |
| **Lectura pública** `venue_public_reservations_in_range` | `r` join `c` on `court_id`, filtro `venue` + rango | Depende de plan: nested loop por canchas del venue vs hash. |
| **Hub** `matches_hub_secondary_bundle` | `match_opportunity_ratings` con `opportunity_id = ANY($1)`; `messages` con `ANY` + `DISTINCT ON` | `idx_mor_opportunity` y `idx_messages_opportunity` **alinean** con el filtro. |
| **Carrusel / stats** `team_completed_rival_counts` | Por cada `team_id`, subquery con `OR` en tres columnas de equipo en `rival_challenges` | **Sin índices** en `challenger_team_id` / `challenged_team_id` / `accepted_team_id` → riesgo alto al crecer la tabla. |

---

## 3. Funciones RPC: inventario desde el cliente

Llamadas detectadas en el código (rutas de uso representativas):

| RPC | Dónde se usa (ejemplos) |
|-----|-------------------------|
| `accept_revuelta_external_request` / `decline_revuelta_external_request` | `lib/app-context.tsx` |
| `accept_team_invite` | `lib/app-context.tsx` |
| `admin_apply_card` / `admin_ban_user` / `admin_clear_suspension` / `admin_clear_ban` | `app/api/admin/sanctions/route.ts` |
| `admin_ceo_business_snapshot` | `app/api/admin/business-overview/route.ts` |
| `admin_merge_profile_accounts` / `admin_reassign_match_creators` | `app/api/admin/merge-profiles/route.ts` |
| `admin_players_business_snapshot` | `app/api/admin/players-dashboard/route.ts` |
| `admin_update_player_report_status` | `app/api/admin/reports/route.ts` |
| `bi_venue_courts_breakdown` / `bi_venue_income_timeseries` / `bi_venue_kpis_snapshot` | `lib/supabase/venue-bi-queries.ts` |
| `book_venue_slot` | `lib/app-context.tsx` |
| `cancel_match_opportunity_with_reason` / `cancel_venue_reservation_as_owner` | `lib/app-context.tsx`, `lib/supabase/venue-reservation-mutations.ts` |
| `confirm_venue_reservation_as_booker` / `confirm_venue_reservation_as_owner` | `lib/supabase/venue-reservation-mutations.ts` |
| `create_match_opportunity_with_optional_reservation` | `lib/app-context.tsx`, `components/admin-match-center-panel.tsx`, `admin-match-management-panel.tsx` |
| `create_match_upcoming_2h_notifications` | `app/api/cron/notifications/upcoming-2h/route.ts` |
| `create_rival_challenge` / `respond_rival_challenge` | `lib/app-context.tsx` |
| `create_team_pick_match_opportunity` | `lib/app-context.tsx`, paneles admin |
| `create_team_with_captain` | `lib/app-context.tsx` |
| `fetch_public_player_profile` | `lib/supabase/queries.ts` |
| `finalize_rival_match` / `finalize_rival_organizer_override` / `finalize_revuelta_match` | `lib/app-context.tsx`, `admin-match-management-panel.tsx` |
| `get_match_opportunity_participant_leave_reasons` | `lib/supabase/message-queries.ts` |
| `join_match_opportunity` / `join_team_pick_match_opportunity` | `lib/app-context.tsx` |
| `leave_match_opportunity_with_reason` | `lib/app-context.tsx` |
| `mark_all_notifications_read` | `app/api/notifications/read-all/route.ts` |
| `match_detail_ratings_bundle` | `lib/services/match-detail.service.ts` |
| `matches_hub_secondary_bundle` | `lib/services/matches-hub.service.ts` |
| `organizer_remove_team_pick_participant` | `lib/app-context.tsx`, admin |
| `request_revuelta_external_join` | `lib/app-context.tsx` |
| `reschedule_match_opportunity_with_reason` | `lib/app-context.tsx`, `admin-match-management-panel.tsx` |
| `resolve_team_pick_private_join_code` | `lib/supabase/team-pick-queries.ts` |
| `respond_team_join_request` | `lib/app-context.tsx` |
| `self_heal_duplicate_profile_by_email` / `self_heal_match_creators_by_email` | `lib/app-context.tsx` |
| `set_team_pick_participant_lineup` | `lib/app-context.tsx`, admin |
| `submit_rival_captain_vote` | `lib/app-context.tsx` |
| `team_completed_rival_counts` | `lib/supabase/team-stats-queries.ts` |
| `venue_public_reservations_in_range` | `lib/supabase/venue-queries.ts` |

*Existen muchas más funciones en SQL (triggers, helpers, reemplazos sucesivos de `book_venue_slot`, etc.); arriba solo las **invocadas explícitamente** desde la app/API del repo.*

---

## 3.1 Complejidad y optimización por RPC (resumen)

Leyenda: **J** = joins, **A** = agregaciones, **L** = bucles/efecto N filas, **P** = plpgsql con ramas.

| RPC | Tipo | Carga aproximada | Posibles optimizaciones |
|-----|------|------------------|-------------------------|
| `matches_hub_secondary_bundle` | SQL, `STABLE` | 3 subconsultas: ratings por `ANY`, último mensaje por chat con `DISTINCT ON`, reseñas por `venue_reservation_id ANY`. **J** implícito en agregados. | Índices ya alineados con `opportunity_id`; reducir tamaño de arrays desde el cliente si el hub lista pocas tarjetas. |
| `match_detail_ratings_bundle` | SQL | Varios `SELECT` sobre `match_opportunity_ratings` filtrados por `opportunity_id` y `rater_id = auth.uid()`. | Índices `idx_mor_opportunity` / `rater` suficientes; evitar duplicar lógica en el front con más round-trips. |
| `venue_public_reservations_in_range` | SQL | Join `venue_reservations`–`venue_courts`, filtro temporal + `confirmed`. | Mantener índices `(court_id, starts_at)`; considerar `covering` solo si EXPLAIN lo justifica. |
| `fetch_public_player_profile` | SQL | `profiles` + `LEFT JOIN geo_cities`; una fila. | PK en `profiles`; bajo coste. |
| `get_match_opportunity_participant_leave_reasons` | SQL/PL | Lee motivos de baja; SECURITY DEFINER (definición en migración). | Índice en participantes por `(opportunity_id)` ya en PK. |
| `team_completed_rival_counts` | SQL | **`unnest` + subconsulta correlacionada por equipo**; condiciones `OR` en tres columnas de `rival_challenges`. | **Índices BTREE** en `rival_challenges (challenger_team_id)`, `(challenged_team_id)`, `(accepted_team_id)` o **índice GIN/expression** menos habitual; alternativa: **materializar** conteos por equipo en tabla de stats actualizada por trigger al completar partido. |
| `bi_venue_income_timeseries` | SQL | `generate_series` + **LEFT JOIN** a hechos agregados por día; sumas condicionales. | Índices en `venue_reservations` ya orientados a tiempo; vista `bi_venue_reservations_fact` sin tabla física → cada llamada recalcula desde reservas (aceptable controlado; **materialized view** si el venue tiene histórico enorme). |
| `bi_venue_courts_breakdown` | SQL | `GROUP BY court_id` sobre la vista fact. | Mismo comentario; índice `(court_id)` cubierto por índices existentes. |
| `bi_venue_kpis_snapshot` | **PL/pgSQL** | **P**: bloque largo; **WITH** sobre fact; múltiples agregados; comparación periodo previo; arrays JSON alertas. | Revisar en producción **tiempo de CPU**; opciones: snapshots diarios en tabla `venue_bi_cache`, o simplificar métricas poco usadas. |
| `admin_ceo_business_snapshot` | **PL/pgSQL** | **P + A + J**: muchos pas sobre `match_opportunities`, `profiles`, `match_opportunity_participants`, `venue_reservations`, etc. Subconsultas correlacionadas (p. ej. `MAX(mop.created_at)` por partido). | **Índice** `(created_at)` o `(created_at, status)` en `match_opportunities`; **`(account_type, created_at)`** en `profiles`; revisión de planes de las subconsultas más repetidas; **job batch** que persista KPIs en tabla `ceo_snapshots` si el dashboard se consulta a menudo. |
| `admin_players_business_snapshot` | PL (archivo largo) | Similar: agregados multi-tabla; depende de filtros `p_city_ids`. | Índices geo ya en `city_id` para entidades clave; EXPLAIN con datos reales. |
| `create_match_opportunity_with_optional_reservation` / `create_team_pick_match_opportunity` | **PL** | Inserciones, locks en `match_opportunities`, posible `book_venue_slot` encadenado; validaciones y triggers (equipo, cancha, solapes). | Optimización principal: **reducir llamadas** duplicadas desde cliente; índices en reservas/canchas ya presentes para anti-solape. |
| `join_match_opportunity` | PL | `SELECT ... FOR UPDATE` en oportunidad; `EXISTS` en participantes; `INSERT`. | PK/participantes bien indexados. |
| `join_team_pick_match_opportunity` | PL | Lógica extendida (team pick); varias lecturas/escrituras. | Perfilado en staging; índices estándar en `match_opportunities` / participantes. |
| `book_venue_slot` | PL | Busca cancha libre, inserta reserva, checks solape (trigger). | Iteración sobre canchas en función (revisar definición actual en la última migración que la reemplace); índices `court_id` + tiempo críticos. |
| `finalize_*` / `submit_rival_captain_vote` | PL | Updates + posibles stats (`apply_match_stats_from_outcome` en triggers). | Asegurar índices en tablas de votos/outcomes (según migraciones de stats). |
| `self_heal_*` | PL | Recorridos de corrección; uso admin/login esporádico. | Bajo volumen; no prioridad I/O frecuente. |
| `mark_all_notifications_read` | PL típico | Update masivo por `user_id`. | Índices en `notifications (user_id, ...)` ya alineados. |
| `create_match_upcoming_2h_notifications` | PL (cron) | Escaneo de partidos próximos + inserciones. | Depende de consulta interna: valorar **índice** en `match_opportunities (date_time)` o expresión según cómo filtre el SQL (revisar migración `notifications`). |

---

## 4. Objetivo cumplido: foco I/O

1. **Huecos de índice más sospechosos en el repo:** `match_opportunities.created_at`, `profiles (account_type, created_at)` para KPIs, **`rival_challenges` por columnas de equipo**, **`app_user_feedback.user_id`**.  
2. **RPC más pesadas “por diseño”:** `admin_ceo_business_snapshot`, `bi_venue_kpis_snapshot`, `team_completed_rival_counts` (N subconsultas + OR).  
3. **Siguiente paso técnico:** ejecutar en Supabase `EXPLAIN ANALYZE` sobre las 5–10 consultas/RPC que más volumen tengan y comparar con esta lista.

---

*Documento generado a partir del estado del repositorio; las migraciones posteriores pueden añadir índices o sustituir funciones.*
