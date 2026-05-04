# Sportmatch (Pichanga) — Documentación integral del proyecto

**Generado:** revisión del repositorio (migraciones SQL, `app/`, `components/`, `lib/`, `package.json` y documentación previa).  
**Nombre npm:** `sportmatch` · **Marca en UI:** SPORTMATCH · **Dominio canónico típico:** `https://www.sportmatch.cl`

Este archivo resume **qué es el producto**, **para qué sirve**, **objetivos**, **stack**, **flujos**, **arquitectura** y **modelo de datos** (tablas, columnas relevantes, enums, vistas y RPC destacadas). Para el detalle línea a línea de políticas RLS o cuerpos SQL completos, la fuente de verdad sigue siendo `supabase/migrations/`.

---

## 1. Resumen ejecutivo

**Sportmatch** es una aplicación web (Next.js) orientada al **fútbol amateur en Chile**: conecta **jugadores**, **organizadores de partidos** y **centros deportivos** en un solo lugar. El backend es **Supabase** (PostgreSQL con RLS, Auth, Storage, Realtime y RPC). La app permite crear y descubrir partidos (rival, faltan jugadores, revuelta, selección de equipos 6vs6), gestionar equipos, reservar canchas vinculadas a encuentros, chatear por partido, cerrar resultados, calificar y moderar conducta. Incluye paneles para **dueños de cancha** (dashboard + BI) y **administración** (métricas, geo, reportes, sanciones, CEO snapshot).

---

## 2. De qué se trata y para qué sirve

| Pregunta | Respuesta breve |
|----------|------------------|
| **¿De qué se trata?** | Plataforma de coordinación de **pichangas / partidos amateur**: publicación de oportunidades, inscripciones, chat, reservas de sede y cierre con estadísticas y reputación. |
| **¿Para qué sirve?** | Reducir fricción frente a grupos de WhatsApp dispersos: un **listado confiable**, **cupos claros**, **cancha y horario** asociados al evento, **equipos** con plantilla e invitaciones, y **herramientas para sedes** (reservas, ocupación, ingresos). |
| **¿Quién la usa?** | Jugadores, organizadores, capitanes de equipo, dueños de centros deportivos y administradores de la plataforma. |
| **Contexto geográfico** | Enfoque **Chile** (zonas horarias `America/Santiago`, WhatsApp `+569`, catálogo geo con regiones/comunas, landings SEO p. ej. Rancagua). |

---

## 3. Objetivos (producto y negocio)

1. **Liquidez de partidos:** que sea fácil publicar y llenar cupos (rival, revuelta, “faltan jugadores”, team pick).
2. **Confianza:** perfiles, calificaciones post-partido, reportes y moderación (tarjetas, suspensiones).
3. **Relación con sedes:** fichas públicas de centros, reservas con estados de pago y confirmación, reseñas tras reservar solo cancha.
4. **Retención:** equipos recurrentes, invitaciones, desafíos rivales, notificaciones in-app y push web.
5. **Operación y visión de negocio:** panel admin, métricas, función **`admin_ceo_business_snapshot`** (KPIs agregados con rango de fechas) y BI por venue (`bi_*`).

---

## 4. Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Runtime | **Node.js 22.x** (`engines` en `package.json`) |
| Framework | **Next.js 16** (App Router) |
| UI | **React 19**, **TypeScript 5.7** |
| Estilos | **Tailwind CSS 4**, **tw-animate-css** |
| Componentes | **Radix UI**, patrón **shadcn/ui** (`components/ui/`), **lucide-react** |
| Datos cliente | **TanStack Query v5** |
| Backend / BD | **Supabase**: PostgreSQL, **RLS**, **RPC** (`SECURITY DEFINER`), triggers |
| Auth | **Supabase Auth** (`@supabase/supabase-js`, `@supabase/ssr`) |
| Tiempo real | **Supabase Realtime** (tablas publicadas según migraciones) |
| Archivos | **Supabase Storage** (avatares, logos de equipo) |
| Formularios | **react-hook-form**, **zod**, **@hookform/resolvers** |
| Fechas | **date-fns**, **date-fns-tz** |
| Gráficos | **recharts** (admin / venue BI) |
| Toasts / tema | **sonner**, **next-themes** |
| Push web | **web-push** + rutas API + tabla `push_subscriptions` |
| Analytics | **@vercel/analytics** |
| Tests | **Vitest** |
| Lint | **ESLint** (flat config) |
| Deploy | Típico **Vercel**; también referencia **Netlify** (`@netlify/plugin-nextjs` en devDependencies) |

**Scripts:** `pnpm dev` / `npm run dev`, `build`, `start`, `lint`, `test`.

---

## 5. Arquitectura del código

### 5.1 Directorios principales

```
app/                 # Layout, páginas, metadata SEO, API routes
components/          # Pantallas (*-screen.tsx), flujos, admin, venue, UI compuesta
lib/                 # Tipos (types.ts), AppProvider, queries Supabase, utilidades
supabase/migrations/ # Esquema PostgreSQL versionado
public/              # Estáticos
proxy.ts             # Refresco de sesión Supabase (patrón SSR/cookies)
```

### 5.2 Patrón de la app principal

- La ruta **`/`** actúa como **SPA interna**: `AppProvider` (`lib/app-context.tsx`) gobierna **pantalla actual** (`currentScreen`), usuario, partidos, equipos, chats, flujos de creación, etc.
- Rutas adicionales bajo `app/` sirven **fichas públicas** y **SEO** (SSR donde aplica).

### 5.3 Pantallas principales (`components/*-screen.tsx`)

Incluyen entre otras: `home-screen`, `explore-screen`, `create-screen`, `matches-screen`, `match-details-screen`, `chat-screen`, `teams-screen`, `profile-screen`, `auth-screen`, `onboarding-screen`, `venue-dashboard-screen`, `venue-onboarding-screen`, `admin-dashboard-screen`.

### 5.4 Cliente Supabase (`lib/supabase/`)

- `client.ts` — navegador  
- `server.ts` — servidor con cookies  
- `admin.ts` — **service role** (solo servidor; bypass RLS)  
- Módulos de dominio: `queries`, `mappers`, `message-queries`, `team-queries`, `venue-queries`, `rating-queries`, `rival-challenge-queries`, `public-venue-server`, `public-team-server`, `public-revuelta-server`, etc.

### 5.5 Tipos de dominio

Referencia alineada con la BD: **`lib/types.ts`** (`MatchType` incluye `team_pick_public` y `team_pick_private`; revuelta tipada en `lib/revuelta-lineup.ts`).

---

## 6. Rutas Next.js (`app/`)

| Ruta | Descripción |
|------|-------------|
| `/` | App principal (SPA con `AppProvider`) |
| `/centro/[venueId]` | Ficha pública del centro deportivo |
| `/equipo/[teamId]` | Ficha pública de equipo |
| `/revuelta/[opportunityId]` | Vista pública de revuelta (tipo abierto / reglas de visibilidad según RLS) |
| `/rancagua/*` | Landings SEO: futbolito, buscar rival, revueltas, faltan jugadores, canchas (Energy, San Damián, San Lorenzo, Santa Helena, etc.) |
| `sitemap.ts` | Sitemap |

*Nota:* puede existir lógica de “swipe” u otras pantallas **solo dentro del árbol de componentes** enlazadas desde la SPA, sin página `app/swipe/page.tsx` en el estado actual del repo.

---

## 7. API routes (`app/api/`)

### 7.1 Administración y datos sensibles (suelen usar **service role** o comprobación admin)

| Ruta | Uso típico |
|------|------------|
| `GET/POST …/admin/metrics` | Métricas agregadas |
| `…/admin/business-overview` | Vista de negocio (p. ej. snapshot CEO vía RPC) |
| `…/admin/players-dashboard` | Panel jugadores |
| `…/admin/geo` | Catálogo geográfico |
| `…/admin/reports` | Moderación de reportes |
| `…/admin/sanctions` | Sanciones / tarjetas |
| `…/admin/merge-profiles` | Fusión de perfiles |
| `…/admin/create-venue-user` | Alta usuario tipo centro |
| `…/admin/venues`, `…/admin/venues/[id]`, `…/owner`, `…/owner-email`, `…/owner-password` | Gestión de sedes |

### 7.2 Notificaciones y push

| Ruta | Uso |
|------|-----|
| `…/notifications` | Listado / creación según implementación |
| `…/notifications/read`, `…/notifications/read-all` | Marcar leídas |
| `…/push/subscribe` | Registrar `push_subscriptions` |
| `…/push/send` | Envío (protegido, p. ej. `PUSH_SEND_SECRET`) |
| `…/cron/notifications/upcoming-2h` | Recordatorios (cron; secreto `NOTIFICATIONS_CRON_SECRET`) |
| `…/cron/notifications/push-dispatch` | Cola / envío push |

### 7.3 Público

| Ruta | Uso |
|------|-----|
| `…/public-player-profile` | Perfil público sin datos sensibles |

---

## 8. Flujos principales (end-to-end)

### 8.1 Registro y onboarding

1. **Supabase Auth** crea usuario en `auth.users`.  
2. Trigger **`handle_new_user`** crea fila en **`profiles`**.  
3. El jugador completa datos esenciales (género, WhatsApp Chile, fecha nacimiento, ciudad `geo_cities`, etc.) → columnas como `player_essentials_completed_at`, `birth_date`, `whatsapp_phone`.

### 8.2 Crear partido

1. Organizador elige **tipo** (`rival`, `players`, `open`, `team_pick_public`, `team_pick_private`), fecha, nivel, género, ubicación/texto de cancha, cupos.  
2. Opcional: vincular **`sports_venue_id`** y **`venue_reservation_id`**.  
3. Team pick: `join_code` (4 dígitos si privado), `team_pick_color_a/b`, `players_needed = 12` (restricción BD).  
4. Persistencia en **`match_opportunities`**; triggers mantienen **`players_joined`** vía **`match_opportunity_participants`**.

### 8.3 Unirse / invitaciones

1. RPC típica: **`join_match_opportunity`** o variantes (p. ej. **`join_team_pick_match_opportunity`**).  
2. Participante en **`match_opportunity_participants`** con `status` (`pending`, `confirmed`, `cancelled`, **`invited`**).  
3. Team pick: columnas **`pick_team`** (`A`/`B`), **`encounter_lineup_role`**, **`is_goalkeeper`** (revuelta abierta).

### 8.4 Chat

- Mensajes en **`messages`** (`opportunity_id` = id del partido en la app).  
- Acceso gobernado por RLS / helpers tipo **`can_access_opportunity_thread`**.  
- Realtime: canal tipo `messages:{opportunityId}` (ver `CONTRATO_SUPABASE_Y_API.md`).

### 8.5 Reserva de cancha

1. Franjas en **`venue_reservations`** (cancha, inicio/fin, libro, estado, pago).  
2. RPC **`book_venue_slot`** y relacionadas en migraciones.  
3. Eventos de auditoría en **`venue_reservation_events`**.  
4. Confirmación: `confirmation_source` (`venue_owner`, `booker_self`, `admin`, etc.).

### 8.6 Revuelta abierta / privada

- **Abierta:** cupos, dos arqueros, sorteo → **`revuelta_lineup`** (JSONB).  
- **Privada:** **`private_revuelta_team_id`**; externos usan **`revuelta_external_join_requests`**.

### 8.7 Rival y desafíos

- Tabla **`rival_challenges`** (modo directo u open, estados).  
- Cierre: votaciones de capitanes, **`rival_outcome_disputed`**, RPCs **`submit_rival_captain_vote`**, **`finalize_rival_match`**, **`finalize_rival_organizer_override`**, etc.

### 8.8 Reprogramación y baja

- **`match_opportunity_reschedules`**: historial de cambios de fecha/lugar con motivo; puede resetear participantes a `pending` según reglas.  
- **`leave_match_opportunity_with_reason`**, **`cancel_match_opportunity_with_reason`**: ventanas (p. ej. 2 h antes en casual, 24 h capitanes en rival según migraciones).

### 8.9 Cierre, stats y calificaciones

- Estados **`match_status`**: `pending`, `confirmed`, `completed`, `cancelled`.  
- **`match_stats_applied_at`** evita doble conteo al aplicar estadísticas a **`profiles`** / **`teams`**.  
- **`match_opportunity_ratings`**: una valoración por par (`opportunity_id`, `rater_id`).

### 8.10 Notificaciones

- Tabla **`notifications`**: tipos `chat_message`, `match_invitation`, `match_upcoming_2h`, `match_finished_review_pending`; triggers en inserts/updates relevantes.  
- **Push:** tabla **`push_subscriptions`** + API + **`web-push`**.

### 8.11 Centro deportivo (dueño)

- Onboarding crea **`sports_venues`**; gestión de **`venue_courts`**, **`venue_weekly_hours`**, reservas.  
- **BI:** vista **`bi_venue_reservations_fact`**, RPCs **`bi_venue_income_timeseries`**, **`bi_venue_courts_breakdown`**, etc. (`20260502120000_venue_bi_dashboard_block1.sql`).

---

## 9. Base de datos — enums PostgreSQL (estado acumulado)

Los valores exactos deben coincidir con la BD tras aplicar **todas** las migraciones. Resumen:

| Tipo | Valores (principales) |
|------|------------------------|
| `gender` | `male`, `female` |
| `position` | `portero`, `defensa`, `mediocampista`, `delantero` |
| `skill_level` | `principiante`, `intermedio`, `avanzado`, `competitivo` |
| `match_type` | `rival`, `players`, `open`, **`team_pick_public`**, **`team_pick_private`** |
| `match_status` | `pending`, `confirmed`, `completed`, `cancelled` |
| `participant_status` | `pending`, `confirmed`, `cancelled`, **`invited`** |
| `team_member_status` | `confirmed`, `pending`, `invited` |
| `invite_status` | `pending`, `accepted`, `declined` |
| `rival_result` | `creator_team`, `rival_team`, `draw` |
| `revuelta_result` | `team_a`, `team_b`, `draw` |
| `rival_challenge_mode` | `direct`, `open` |
| `rival_challenge_status` | `pending`, `accepted`, `declined`, `cancelled` |
| `account_type` | `player`, `venue`, `admin` |
| `venue_reservation_status` | `pending`, `confirmed`, `cancelled` |
| `venue_payment_status` | `unpaid`, `deposit_paid`, `paid` |
| `player_report_status` | `pending`, `reviewed`, `dismissed`, `action_taken` |

---

## 10. Tablas `public.*` — roles y columnas

Las columnas listadas reflejan el **modelo acumulado** descrito en `DOCUMENTACION.md` y migraciones posteriores. Si una migración añade columna puntual, debe prevalecer el SQL sobre este documento.

### 10.1 `profiles` (1:1 con `auth.users`)

| Columna | Tipo / notas |
|---------|----------------|
| `id` | UUID PK → `auth.users.id` ON DELETE CASCADE |
| `name`, `age`, `gender`, `position`, `level` | Perfil jugador |
| `city`, `city_id` | Texto display + FK `geo_cities` |
| `availability` | `text[]` |
| `photo_url`, `bio` | |
| `created_at`, `updated_at` | Trigger `set_updated_at` |
| `account_type` | `account_type`, default `player` |
| `whatsapp_phone` | Formato Chile |
| `player_essentials_completed_at` | Onboarding |
| `birth_date` | `DATE`; edad puede sincronizarse con `age` |
| `stats_player_wins/draws/losses`, `stats_organized_completed`, `stats_organizer_wins` | |
| `mod_yellow_cards`, `mod_red_cards`, `mod_suspended_until`, `mod_banned_at`, `mod_ban_reason` | Moderación |
| `mod_last_yellow_at`, `mod_last_red_at` | Alertas ~24h en UI |
| `last_seen_at` | Presencia / admin |

### 10.2 `match_opportunities`

| Columna | Tipo / notas |
|---------|----------------|
| `id` | UUID PK |
| `type` | `match_type` (incl. team pick) |
| `title`, `description`, `location`, `venue`, `date_time` | |
| `level`, `creator_id` | FK `profiles` |
| `team_name`, `players_needed`, `players_joined` | Contador vía trigger |
| `gender`, `status` | |
| `created_at`, `updated_at` | |
| `sports_venue_id`, `venue_reservation_id`, `city_id` | FKs opcionales |
| `players_seek_profile` | `gk_only` / `field_only` / `gk_and_field` |
| `revuelta_lineup` | JSONB |
| `finalized_at` | Cierre organizador |
| `rival_result`, `casual_completed`, `suspended_at`, `suspended_reason` | |
| `revuelta_result`, `private_revuelta_team_id` | Revuelta |
| `rival_captain_vote_challenger`, `rival_captain_vote_accepted` | `rival_result` |
| `rival_outcome_disputed`, `match_stats_applied_at` | |
| `join_code` | 4 dígitos si `team_pick_private` |
| `team_pick_color_a`, `team_pick_color_b` | `#RRGGBB` si team pick |

### 10.3 `match_opportunity_participants`

| Columna | Tipo / notas |
|---------|----------------|
| `opportunity_id`, `user_id` | PK compuesta; FKs |
| `status` | Incl. `invited` |
| `created_at` | |
| `is_goalkeeper` | Revuelta `open` |
| `pick_team` | `'A'` / `'B'` (team pick) |
| `encounter_lineup_role` | `gk`, `defensa`, `mediocampista`, `delantero` |
| `cancelled_at`, `cancelled_reason` | Salida con motivo |

### 10.4 `matches`, `match_participants`

Instancia opcional de partido confirmado: `matches(id, opportunity_id, status, created_at)`; `match_participants(match_id, user_id)` PK compuesta.

### 10.5 `messages`

`id`, `opportunity_id`, `sender_id`, `content` (1–8000 chars), `created_at`.

### 10.6 `match_opportunity_ratings`

`id`, `opportunity_id`, `rater_id`, `organizer_rating` (1–5 nullable), `match_rating`, `level_rating`, `comment`, `created_at`; **UNIQUE** (`opportunity_id`, `rater_id`).

### 10.7 `rival_challenges`

Desafío entre equipos ligado a una oportunidad: modos, estados, equipos y capitanes (retador, retado, aceptado); timestamps `created_at`, `responded_at`. Ver `DOCUMENTACION.md` §7.8.

### 10.8 `teams`, `team_members`, `team_invites`

- **teams:** `name`, `logo_url`, `level`, `captain_id`, `vice_captain_id`, `city`, `city_id`, `gender`, `description`, stats W/D/L y rachas, timestamps.  
- **team_members:** PK (`team_id`, `user_id`), `position`, `photo_url`, `status`, `created_at`.  
- **team_invites:** `team_id`, `inviter_id`, `invitee_id`, `status`, `created_at`.

### 10.9 `team_join_requests`, `team_private_settings`

- **team_join_requests:** `id`, `team_id`, `requester_id`, `status`, `created_at`, `updated_at`.  
- **team_private_settings:** `team_id` PK, `whatsapp_invite_url`, `rules_text`, `updated_at`.

### 10.10 Centros: `sports_venues`, `venue_courts`, `venue_weekly_hours`, `venue_reservations`, `venue_reservation_events`

- **sports_venues:** dueño, nombre, dirección, `maps_url`, teléfono, ciudad / `city_id`, **`is_paused`**, `slot_duration_minutes`, timestamps.  
- **venue_courts:** `venue_id`, `name`, `sort_order`, `price_per_hour`.  
- **venue_weekly_hours:** día 0–6, `open_time`, `close_time`.  
- **venue_reservations:** franja, `booker_user_id`, `match_opportunity_id`, estados de reserva y pago, montos, confirmación/cancelación, notas.  
- **venue_reservation_events:** auditoría (`kind`, `payload` jsonb).

### 10.11 Geo: `geo_countries`, `geo_regions`, `geo_cities`

Catálogo jerárquico con `is_active`; seed Chile (regiones/comunas) en migraciones dedicadas.

### 10.12 `revuelta_external_join_requests`

`id`, `opportunity_id`, `requester_id`, `is_goalkeeper`, `status` (`pending`/`accepted`/`declined`), `created_at`, `responded_at`.

### 10.13 `player_reports`

Reportes entre jugadores: reporter/reported, contexto, motivo, detalle, `status`, revisión (`reviewed_by`, `reviewed_at`, `resolution`), `created_at`.

### 10.14 `match_opportunity_reschedules`

Historial de reprogramación: valores viejos/nuevos de `venue`, `location`, `date_time`, `reason`, `changed_by`, `created_at`.

### 10.15 `app_user_feedback`

`id`, `user_id`, `message`, `app_version`, `created_at` — insert usuario, lectura admin.

### 10.16 `notifications`

`id`, `user_id`, `type` (check: cuatro tipos), `title`, `body`, `payload` jsonb, `is_read`, `created_at`, `read_at`. Políticas: usuario lee/actualiza; inserción/borrado service_role en parte del diseño.

### 10.17 `push_subscriptions`

`id`, `user_id`, `endpoint`, `p256dh_key`, `auth_key`, `created_at`, `updated_at`; UNIQUE (`user_id`, `endpoint`).

### 10.18 `sports_venue_reviews`

Reseña **una por reserva**: `venue_id`, `venue_reservation_id`, `reviewer_id`, tres ratings 1–5, `comment`, `reviewer_name_snapshot`, `created_at`.

### 10.19 Vistas y objetos derivados (no son tablas base)

| Objeto | Descripción |
|--------|-------------|
| `sports_venue_review_stats` | Agregados por `venue_id` (promedios, conteo) |
| `bi_venue_reservations_fact` | Hechos normalizados de reservas para BI |
| RPC `bi_venue_income_timeseries`, `bi_venue_courts_breakdown`, … | Series temporales y desglose por cancha |
| RPC `admin_ceo_business_snapshot(from, to, tz)` | JSON con KPIs de negocio (creación, completitud, retención, revenue reservas, fricción, etc.) |

---

## 11. RPC, triggers y lógica en BD (orientación)

La aplicación delega muchas reglas a **PostgreSQL**:

- **Cupos y conteos:** `refresh_opportunity_players_joined`.  
- **Revuelta / team pick:** límites de arqueros y roles (`enforce_open_revuelta_*`, etc.).  
- **Reservas:** solapes, cambios de estado, precio sincronizado con cancha.  
- **Stats:** `apply_match_stats_from_outcome`, triggers al completar.  
- **Moderación:** `admin_apply_card`, `admin_ban_user`.  
- **Perfil público:** `fetch_public_player_profile`.  
- **Equipo:** límites de plantilla, ciudad inmutable, rivales, `create_team_with_captain`, invitaciones/solicitudes.

Lista orientativa de invocaciones desde el cliente documentada en **`CONTRATO_SUPABASE_Y_API.md`** (`join_match_opportunity`, `book_venue_slot`, `finalize_revuelta_match`, `request_revuelta_external_join`, etc.).

---

## 12. Row Level Security (RLS), Realtime y Storage

- **RLS** activado en tablas de negocio; políticas evolucionan por migración (`DROP POLICY` / `CREATE POLICY`). El rol **`service_role`** bypass RLS (solo servidor).  
- **Realtime:** publicación `supabase_realtime` sobre tablas clave (`messages`, oportunidades, participantes, ratings, etc. según migraciones).  
- **Storage:** buckets `profile-avatars`, `team-logos` (políticas por dueño).

---

## 13. Variables de entorno (referencia)

Ver **`CONTRATO_SUPABASE_Y_API.md`** y `.env.example` si existe. Mínimo cliente: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Servidor: `SUPABASE_SERVICE_ROLE_KEY`. Opcionales: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_TIMEZONE`, claves **VAPID** y secretos de cron/push.

---

## 14. Documentos relacionados en el repositorio

| Archivo | Contenido |
|---------|-----------|
| `DOCUMENTACION.md` | Referencia técnica detallada (tablas §7, RPC §8); conviene mantenerla al día con migraciones |
| `DOCUMENTACION-PROYECTO-COMPLETA.md` | Visión producto + arquitectura |
| `CONTRATO_SUPABASE_Y_API.md` | Contrato para clientes alternativos (p. ej. React Native): tablas, RPC, env, storage |
| `SUPABASE_MIGRACIONES_CONSOLIDADAS.sql` | Volcado concatenado de migraciones (no sustituye historial git) |
| `PLAN_NOTIFICACIONES_E_INVITACIONES.md`, `GUIA_REPLICACION_REACT_NATIVE.md`, etc. | Temas específicos |

---

## 15. Mantenimiento de esta documentación

1. Tras cada **migración** nueva: actualizar §9–10 y enums.  
2. Tras cambios en **`lib/types.ts`** o rutas API: actualizar §5–7.  
3. Tras cambios de producto: actualizar §2–3 y §8.

---

*Fin del documento integral.*
