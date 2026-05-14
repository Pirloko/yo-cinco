# Documentacion completa de BD SQL (Supabase)

Este archivo consolida **todo el estado SQL existente** en `supabase/` del proyecto:

- Migraciones versionadas (`supabase/migrations/*.sql`)
- Scripts manuales SQL (`supabase/manual_*.sql`)
- Objetos de base de datos: enums, tablas, vistas, funciones/RPC, triggers, politicas RLS, buckets de Storage

> Fuente de verdad: archivos SQL del repo.  
> Fecha de inventario: actual a este commit local.

---

## 1) Resumen ejecutivo

- **Archivos SQL totales:** 94
  - **Migraciones:** 91
  - **Scripts manuales:** 3
- **Tablas `public` detectadas:** 28
- **Vistas `public` detectadas:** 3
- **Enums `public` detectados:** 13 (+ alteraciones de valores)
- **Funciones/RPC `public` detectadas:** decenas (dominio match, team, venue, admin, notificaciones, BI)
- **RLS:** activado ampliamente con politicas por tabla/rol/contexto

---

## 2) Enums SQL (`public`)

### Base
- `gender`
- `position`
- `skill_level`
- `match_type`
- `match_status`
- `team_member_status`
- `invite_status`
- `participant_status`
- `rival_result`
- `rival_challenge_mode`
- `rival_challenge_status`
- `account_type`
- `venue_reservation_status`
- `venue_payment_status`
- `revuelta_result`
- `player_report_status`

### Alteraciones de enum relevantes
- `match_type` agrega: `team_pick_public`, `team_pick_private`
- `account_type` agrega: `admin`
- `venue_reservation_status` agrega: `pending` (antes de `confirmed`)

---

## 3) Tablas `public` existentes (catalogo)

## Core app
- `profiles`
- `match_opportunities`
- `match_opportunity_participants`
- `matches`
- `match_participants`
- `messages`
- `teams`
- `team_members`
- `team_invites`

## Match/rival/rating/operacion
- `rival_challenges`
- `match_opportunity_ratings`
- `match_opportunity_reschedules`
- `revuelta_external_join_requests`

## Team gestion
- `team_join_requests`
- `team_private_settings`

## Venue y reservas
- `sports_venues`
- `venue_courts`
- `venue_weekly_hours`
- `venue_reservations`
- `venue_reservation_events`
- `sports_venue_reviews`

## Geo catalogo
- `geo_countries`
- `geo_regions`
- `geo_cities`

## Moderacion / feedback / admin soporte
- `player_reports`
- `app_user_feedback`

## Notificaciones y push
- `notifications`
- `push_subscriptions`

---

## 4) Vistas `public` existentes

- `match_opportunities_masked`
  - Vista para exponer oportunidades con privacidad/control de columnas (incluye ajustes de team_pick y RLS asociada).
- `sports_venue_review_stats`
  - Agregados de reseñas por sede (promedios/volumen).
- `bi_venue_reservations_fact`
  - Fact table logica para BI de sedes (base de snapshots/timeseries/breakdown).

---

## 5) Storage (Supabase Storage) configurado por SQL

Buckets:
- `team-logos`
- `profile-avatars`

Politicas sobre `storage.objects`:
- lectura publica para assets definidos
- insert/update/delete restringido al propietario (segun ruta/uid y politica)

---

## 6) Funciones/RPC por dominio (resumen funcional)

## Seguridad / utilidades base
- `set_updated_at`
- `handle_new_user`
- `is_admin`
- `is_team_captain`, `is_team_primary_captain`, `is_team_staff_captain`
- `is_match_opportunity_creator`
- `can_access_opportunity_thread`
- `is_team_member`, `is_confirmed_team_member`

## Matches / Team pick / Revuelta
- `create_match_opportunity_with_optional_reservation`
- `join_match_opportunity`
- `leave_match_opportunity_with_reason`
- `cancel_match_opportunity_with_reason`
- `reschedule_match_opportunity_with_reason`
- `create_team_pick_match_opportunity`
- `join_team_pick_match_opportunity`
- `resolve_team_pick_private_join_code`
- `set_team_pick_participant_lineup`
- `organizer_remove_team_pick_participant`
- `finalize_revuelta_match`
- `finalize_rival_match`
- `finalize_rival_organizer_override`
- `submit_rival_captain_vote`
- `apply_match_stats_from_outcome`

## Teams / membresias
- `create_team_with_captain`
- `accept_team_invite`
- `respond_team_join_request`
- `request_revuelta_external_join`
- `accept_revuelta_external_request`
- `decline_revuelta_external_request`
- validadores de limites/cupos (`enforce_*`) para roster, teams por usuario, slots/roles

## Venue / reservas
- `book_venue_slot`
- `confirm_venue_reservation_as_owner`
- `cancel_venue_reservation_as_owner`
- `confirm_venue_reservation_as_booker`
- `venue_public_reservations_in_range`
- `venue_reservations_check_overlap`
- funciones de sincronizacion de precios y eventos de reserva

## Notificaciones
- `prune_notifications_for_user`
- `mark_all_notifications_read`
- `notify_match_chat_message`
- `notify_match_finished_review_pending`
- `notify_match_invitation_on_participant_insert`
- `create_match_upcoming_2h_notifications`

## Moderacion / admin
- `admin_apply_card`
- `admin_ban_user`
- `admin_clear_suspension`
- `admin_clear_ban`
- `admin_update_player_report_status`
- `merge_profile_accounts`
- `admin_merge_profile_accounts`
- `self_heal_duplicate_profile_by_email`
- `reassign_match_creators`
- `self_heal_match_creators_by_email`
- `admin_reassign_match_creators`

## BI / dashboard
- `bi_venue_income_timeseries`
- `bi_venue_courts_breakdown`
- `bi_venue_kpis_snapshot`
- `admin_ceo_business_snapshot`
- `admin_players_business_snapshot`
- `matches_hub_secondary_bundle`
- `match_detail_ratings_bundle`

---

## 7) Triggers (patrones principales)

Se usan triggers para:
- mantener `updated_at`
- sincronizar columnas derivadas (ej. conteos o flags)
- aplicar reglas de negocio al insertar/actualizar participantes y oportunidades
- disparar notificaciones automáticas (`messages`, `match_opportunities`, `match_opportunity_participants`)
- auditar/sincronizar eventos de reservas

---

## 8) RLS (Row Level Security): estado y enfoque

RLS se habilita en tablas core y de nuevos modulos (matches, teams, messages, venue, geo, notificaciones, etc.).  
Patron general:

- **Jugador autenticado**: lee lo permitido para su flujo (perfil, matches, mensajes de hilos autorizados, equipos relacionados).
- **Propietario/capitan/staff**: puede mutar solo recursos propios o de su ambito.
- **Admin**: politicas especificas apoyadas en `is_admin()`.
- **Service role**: insercion/dispatch en notificaciones y jobs tecnicos.
- **Anonimo**: acceso limitado a vistas/publicaciones concretas (ej. oportunidades abiertas, lectura publica controlada).

---

## 9) Inventario completo de archivos SQL

## Scripts manuales
- `supabase/manual_delete_users_by_emails.sql`
- `supabase/manual_promote_admin_account.sql`
- `supabase/manual_promote_venue_account.sql`

## Migraciones (inventario literal detectado)
- `supabase/migrations/20250322180000_initial_schema.sql`
- `supabase/migrations/20250322180001_rls_policies.sql`
- `supabase/migrations/20250322190000_match_completion_and_ratings.sql`
- `supabase/migrations/20250322193000_rival_challenges.sql`
- `supabase/migrations/20250322194000_match_suspension_reason.sql`
- `supabase/migrations/20250324120000_team_logos_storage.sql`
- `supabase/migrations/20250325140000_anon_public_team_invite_read.sql`
- `supabase/migrations/20250325160000_revuelta_goalkeeper_and_public_read.sql`
- `supabase/migrations/20250325180000_revuelta_lineup.sql`
- `supabase/migrations/20250326120000_players_seek_profile.sql`
- `supabase/migrations/20250326140000_profile_avatars_storage.sql`
- `supabase/migrations/20250326160000_team_join_requests.sql`
- `supabase/migrations/20250326170000_team_private_settings.sql`
- `supabase/migrations/20250327100000_sports_venues_and_bookings.sql`
- `supabase/migrations/20250327110000_venue_public_reservations_rpc.sql`
- `supabase/migrations/20250327120000_team_members_limit_5.sql`
- `supabase/migrations/20250327120001_teams_limit_5.sql`
- `supabase/migrations/20250327130000_revuelta_roles_and_capacity.sql`
- `supabase/migrations/20260326112000_profiles_whatsapp_required_signup.sql`
- `supabase/migrations/20260326123000_allow_auth_user_creation_without_whatsapp.sql`
- `supabase/migrations/20260326200000_venue_reservations_payments_and_history.sql`
- `supabase/migrations/20260327001000_admin_and_self_confirmed_reservations.sql`
- `supabase/migrations/20260327012000_venue_manual_reservations_insert_policy.sql`
- `supabase/migrations/20260329120000_geo_locations.sql`
- `supabase/migrations/20260329160000_court_price_per_hour.sql`
- `supabase/migrations/20260330140000_team_city_immutable_and_rival_counts.sql`
- `supabase/migrations/20260330180000_team_roster_max_18.sql`
- `supabase/migrations/20260331120000_profiles_player_essentials.sql`
- `supabase/migrations/20260331190000_match_outcomes_stats_votes.sql`
- `supabase/migrations/20260401120000_team_stats_wdl.sql`
- `supabase/migrations/20260401140000_team_rival_streaks.sql`
- `supabase/migrations/20260401170000_public_player_profiles_reports_sanctions.sql`
- `supabase/migrations/20260401183000_sync_team_member_position_from_profile.sql`
- `supabase/migrations/20260403120000_profiles_birth_date.sql`
- `supabase/migrations/20260404120000_private_revuelta_team.sql`
- `supabase/migrations/20260405120000_revuelta_ext_requests_organizer.sql`
- `supabase/migrations/20260406120000_vice_captain_and_team_limit_3.sql`
- `supabase/migrations/20260407120000_finalize_rival_match_organizer.sql`
- `supabase/migrations/20260408120000_realtime_profiles_and_sync_team_photo.sql`
- `supabase/migrations/20260408130000_venue_reservation_rpcs.sql`
- `supabase/migrations/20260408133000_join_match_opportunity_rpc.sql`
- `supabase/migrations/20260408140000_request_private_revuelta_rpc.sql`
- `supabase/migrations/20260408143000_admin_reports_and_clear_sanctions_rpcs.sql`
- `supabase/migrations/20260408150000_create_match_with_reservation_rpc.sql`
- `supabase/migrations/20260408153000_team_invites_and_join_requests_rpcs.sql`
- `supabase/migrations/20260408160000_create_team_with_captain_rpc.sql`
- `supabase/migrations/20260408170000_rival_challenges_rpcs.sql`
- `supabase/migrations/20260409120000_seed_chile_regions_and_communes.sql`
- `supabase/migrations/20260410120000_mod_sanction_alert_timestamps.sql`
- `supabase/migrations/20260411120000_conduct_cards_cumulative_no_reset.sql`
- `supabase/migrations/20260412120000_sports_venues_is_paused.sql`
- `supabase/migrations/20260412143000_app_user_feedback.sql`
- `supabase/migrations/20260414123000_profile_account_merge_and_self_heal.sql`
- `supabase/migrations/20260414133000_match_creator_self_heal.sql`
- `supabase/migrations/20260414150000_match_leave_and_cancel_windows.sql`
- `supabase/migrations/20260414163000_match_reschedule_with_reason.sql`
- `supabase/migrations/20260415100000_participant_leave_reasons_privileged_rpc.sql`
- `supabase/migrations/20260418120000_ensure_reschedule_rpc_postgrest.sql`
- `supabase/migrations/20260418125950_team_pick_match_type_enum_values.sql`
- `supabase/migrations/20260418130000_team_pick_match_schema.sql`
- `supabase/migrations/20260418130100_team_pick_reject_legacy_create_rpc.sql`
- `supabase/migrations/20260418130200_team_pick_reject_legacy_join_rpc.sql`
- `supabase/migrations/20260418140000_team_pick_join_rpc.sql`
- `supabase/migrations/20260418150000_team_pick_resolve_lineup_kick.sql`
- `supabase/migrations/20260418210000_team_pick_team_colors.sql`
- `supabase/migrations/20260419153000_team_pick_private_public_listing.sql`
- `supabase/migrations/20260419170000_team_pick_join_code_column_privileges.sql`
- `supabase/migrations/20260423100000_in_app_notifications.sql`
- `supabase/migrations/20260423110000_notifications_event_triggers.sql`
- `supabase/migrations/20260423113000_notifications_invitation_and_upcoming.sql`
- `supabase/migrations/20260423120000_participant_status_invited_fix.sql`
- `supabase/migrations/20260423123000_notifications_push_dispatch.sql`
- `supabase/migrations/20260424021000_team_pick_outcome_stats.sql`
- `supabase/migrations/20260424023000_team_pick_gk_sync_null_safe.sql`
- `supabase/migrations/20260428120000_bi_kpis_avg_ticket_align_revenue.sql`
- `supabase/migrations/20260429120000_profiles_last_seen_at.sql`
- `supabase/migrations/20260429200000_sports_venue_reviews.sql`
- `supabase/migrations/20260430113000_team_pick_rejoin_reactivate_cancelled.sql`
- `supabase/migrations/20260430120000_fix_revuelta_ext_req_rls_recursion.sql`
- `supabase/migrations/20260431130000_matches_hub_and_detail_ratings_bundle_rpc.sql`
- `supabase/migrations/20260431140000_reschedule_match_unlink_venue_reservation.sql`
- `supabase/migrations/20260431150000_reschedule_preserve_sports_venue_when_same_text.sql`
- `supabase/migrations/20260431160000_backfill_match_opportunities_sports_venue_id.sql`
- `supabase/migrations/20260431170000_rival_match_visibility_masked_and_rls.sql`
- `supabase/migrations/20260431180000_sync_reservation_price_when_court_price_updates.sql`
- `supabase/migrations/20260431180200_ratings_remove_48h_window.sql`
- `supabase/migrations/20260501100000_push_subscriptions.sql`
- `supabase/migrations/20260501113000_admin_organizer_no_slot.sql`
- `supabase/migrations/20260502120000_venue_bi_dashboard_block1.sql`
- `supabase/migrations/20260504130000_add_critical_indexes.sql`
- `supabase/migrations/20260529120000_admin_ceo_business_snapshots.sql`

---

## 10) Nota operativa

- Este documento es un **inventario funcional completo** de lo que existe en SQL.
- Si quieres, en un siguiente paso puedo generar un segundo archivo tipo **diccionario de datos** tabla por tabla (columnas, tipos, defaults, constraints y FK exactas), extraido directamente de cada migracion.

