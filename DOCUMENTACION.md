# Pichanga / SPORTMATCH — Documentación técnica del proyecto

Documento de referencia único: **stack**, **arquitectura de la app**, **módulos y responsabilidades en `lib/`**, **rutas y APIs**, **Supabase (tablas, columnas, enums, funciones RPC y storage)**.  
Actualizar este archivo cuando cambien migraciones, tipos en `lib/types.ts` o dependencias relevantes.

| Campo | Valor |
|--------|--------|
| Paquete npm (`package.json`) | `sportmatch` 0.1.0 (privado) |
| Marca en UI / metadatos | SPORTMATCH (`app/layout.tsx`; URL canónica por defecto `https://www.sportmatch.cl` si no hay `NEXT_PUBLIC_SITE_URL`) |
| Node | `22.x` (`engines`) |
| Gestor de paquetes | Recomendado **pnpm** (`pnpm-lock.yaml`; también puede existir `package-lock.json`) |

---

## 1. Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Framework | **Next.js 16** (App Router) |
| UI | **React 19** |
| Lenguaje | **TypeScript 5.7** |
| Estilos | **Tailwind CSS 4** + **tw-animate-css** |
| Componentes | **Radix UI** + patrón **shadcn/ui** en `components/ui/` |
| Backend / datos | **Supabase** (PostgreSQL, Auth, Storage, RLS, Realtime) |
| Cliente Supabase | `@supabase/supabase-js`, `@supabase/ssr` |
| Formularios | **react-hook-form**, **zod**, **@hookform/resolvers** |
| Fechas | **date-fns**, **date-fns-tz** |
| Iconos | **lucide-react** |
| Carruseles | **embla-carousel-react** |
| Gráficos (admin) | **recharts** |
| Toasts | **sonner** |
| Temas | **next-themes** |
| Analytics | **@vercel/analytics** (típico con `VERCEL=1`) |
| Deploy | Frecuente **Netlify** (`@netlify/plugin-nextjs` en devDependencies) |

**Scripts:** `pnpm dev` / `npm run dev`, `build`, `start`, `lint` (eslint).

---

## 2. Variables de entorno

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** (API routes admin, scripts). Nunca `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | URL pública (metadata, OG, redirects) |
| `NEXT_PUBLIC_APP_TIMEZONE` | Opcional; zona horaria por defecto (p. ej. `America/Santiago`) |

Archivo local: **`.env.local`** (no versionar secretos).

---

## 3. Arquitectura de la aplicación

### 3.1 Rutas Next.js (`app/`)

| Ruta | Descripción |
|------|-------------|
| `/` | App principal tipo **SPA interna**: `AppProvider` (`lib/app-context.tsx`), pantallas por estado `currentScreen`. |
| `/centro/[venueId]` | Ficha pública del centro deportivo. |
| `/equipo/[teamId]` | Ficha pública de equipo. |
| `/revuelta/[opportunityId]` | Vista pública de revuelta (tipo `open`). |
| `/swipe` | Pantalla swipe (experimento / flujo aparte). |
| `/rancagua/*` | Páginas SEO (futbolito, buscar rival, revueltas, faltan jugadores, canchas concretas). |

**API routes** (`app/api/`): ver sección 5.

### 3.2 Proxy / sesión

- **`proxy.ts`**: refresco de sesión JWT de Supabase y sincronización de cookies (patrón `@supabase/ssr` con Next 16).

### 3.3 Estado global

- **`lib/app-context.tsx`**: usuario autenticado, partidos, equipos, chats, pantalla actual, flujos de creación, reservas, etc.
- **LocalStorage (ejemplos)**: tema, última pestaña de navegación, prefill de crear partido, deep links.

### 3.4 Carpetas relevantes

```
app/                 # Layout, páginas, API routes
components/          # Pantallas (*-screen.tsx), UI compuesta, admin, venue, etc.
lib/                 # Tipos, contexto, queries Supabase, utilidades
supabase/migrations/ # Esquema PostgreSQL versionado
public/              # Estáticos (logos, team/*.png, etc.)
```

### 3.5 Pantallas principales (componentes)

Incluyen entre otros: `home-screen`, `explore-screen`, `swipe-screen`, `create-screen`, `matches-screen`, `teams-screen`, `venue-dashboard-screen`, `admin-dashboard-screen`, `admin-geo-catalog-panel`, navegación (`bottom-nav`), etc. La lista exacta evoluciona en `components/`.

---

## 4. Tipos y dominio (TypeScript)

Referencia canónica: **`lib/types.ts`**.

**Enums / unions:** `Gender`, `Position`, `Level`, `MatchType`, `PlayersSeekProfile`, `MatchStatus`, `MatchesHubTab`, `RivalResult`, `RevueltaResult`, `AccountType`, `RivalChallengeMode`, `RivalChallengeStatus`.

**Entidades principales:** `User`, `PublicPlayerProfile`, `SportsVenue`, `VenueCourt`, `VenueWeeklyHour`, `VenueReservationRow`, `Team`, `TeamMember`, `TeamPrivateSettings`, `TeamInvite`, `TeamJoinRequest`, `RivalChallenge`, `MatchOpportunity`, `Match`, `Message`, `OnboardingData`, `VenueOnboardingData`, catálogo geo `GeoCountry`, `GeoRegion`, `GeoCity`.

**Revuelta:** estructura de alineación en `lib/revuelta-lineup.ts` (`RevueltaLineup`).

---

## 5. API routes (servidor)

Todas bajo `app/api/admin/`; suelen exigir **service role** o comprobación admin según implementación.

| Ruta | Rol típico |
|------|------------|
| `admin/metrics` | Métricas / agregados |
| `admin/create-venue-user` | Alta usuario tipo centro |
| `admin/geo` | CRUD / activación catálogo geo |
| `admin/reports` | Moderación de reportes |
| `admin/sanctions` | Sanciones (tarjetas / ban vía backend) |

Revisar cada `route.ts` para body, auth y códigos de error.

---

## 6. Módulos `lib/` (funciones y responsabilidades)

No lista exhaustiva de cada exportación; sí el **propósito** de cada archivo relevante.

| Archivo / área | Función |
|----------------|---------|
| `app-context.tsx` | Estado global de la SPA, auth, datos de negocio en cliente. |
| `types.ts` | Modelos TypeScript del dominio. |
| `utils.ts` | Utilidades generales (p. ej. `cn` para clases). |
| `site-url.ts`, `seo/*` | Origen público del sitio y SEO. |
| `match-datetime-format.ts`, `match-spots.ts`, `time-slot-options.ts`, `venue-options.ts`, `venue-slots.ts`, `court-pricing.ts` | Fechas, cupos, horarios, precios de cancha. |
| `age-birthday.ts` | Edad desde `birth_date`. |
| `organizer-level.ts`, `team-rival-momentum.ts`, `team-membership.ts`, `team-roster.ts` | Reglas de nivel, rivales, membresía y plantilla. |
| `players-seek-profile.ts`, `revuelta-lineup.ts`, `rival-prefill.ts`, `match-invite-url.ts`, `team-invite-url.ts`, `create-prefill.ts`, `player-nav-storage.ts` | Flujos de partidos, revuelta, invitaciones y navegación. |
| `jersey-colors.ts`, `card-shell.ts`, `image-webp.ts` | UI / imágenes. |
| `geo-constants.ts` | Constantes de geo. |
| `mock-data.ts` | Datos de prueba / fallback. |
| `supabase/client.ts` | Cliente browser Supabase. |
| `supabase/server.ts` | Cliente servidor (cookies). |
| `supabase/admin.ts` | Cliente con service role (solo servidor). |
| `supabase/require-admin.ts` | Helpers para rutas admin. |
| `supabase/auth-errors.ts` | Mensajes de error de auth. |
| `supabase/queries.ts` | Consultas generales de oportunidades / app. |
| `supabase/mappers.ts` | Mapeo filas DB → tipos de app. |
| `supabase/message-queries.ts` | Chat por oportunidad. |
| `supabase/team-queries.ts`, `team-logos.ts`, `team-stats-queries.ts` | Equipos, logos, estadísticas. |
| `supabase/rival-challenge-queries.ts` | Desafíos rival. |
| `supabase/rating-queries.ts` | Calificaciones post-partido. |
| `supabase/venue-queries.ts`, `public-venue-server.ts` | Centros y lecturas públicas. |
| `supabase/geo-queries.ts` | Catálogo geo en cliente. |
| `supabase/public-team-server.ts`, `public-revuelta-server.ts` | SSR páginas públicas. |
| `supabase/revuelta-external-requests.ts` | Solicitudes externas a revuelta privada. |
| `supabase/profile-photo.ts` | Subida avatar. |
| `supabase/seo-rancagua-matches.ts` | Datos para SEO Rancagua. |

---

## 7. Base de datos (Supabase / PostgreSQL)

Origen: migraciones en **`supabase/migrations/`** (orden cronológico). Las columnas listadas son el **estado acumulado** tras aplicar todas.

### 7.1 Tipos ENUM (PostgreSQL)

| Tipo | Valores |
|------|---------|
| `gender` | `male`, `female` |
| `position` | `portero`, `defensa`, `mediocampista`, `delantero` |
| `skill_level` | `principiante`, `intermedio`, `avanzado`, `competitivo` |
| `match_type` | `rival`, `players`, `open` |
| `match_status` | `pending`, `confirmed`, `completed`, `cancelled` |
| `team_member_status` | `confirmed`, `pending`, `invited` |
| `invite_status` | `pending`, `accepted`, `declined` |
| `participant_status` | `pending`, `confirmed`, `cancelled` |
| `rival_result` | `creator_team`, `rival_team`, `draw` |
| `revuelta_result` | `team_a`, `team_b`, `draw` |
| `rival_challenge_mode` | `direct`, `open` |
| `rival_challenge_status` | `pending`, `accepted`, `declined`, `cancelled` |
| `account_type` | `player`, `venue`, `admin` |
| `venue_reservation_status` | `pending`, `confirmed`, `cancelled` |
| `venue_payment_status` | `unpaid`, `deposit_paid`, `paid` |
| `player_report_status` | `pending`, `reviewed`, `dismissed`, `action_taken` |

### 7.2 Tabla `profiles`

Extiende `auth.users` (1:1 por `id`).

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | UUID PK | FK → `auth.users.id` ON DELETE CASCADE |
| `name` | TEXT | |
| `age` | INTEGER | CHECK 0–120; puede sincronizarse con `birth_date` |
| `gender` | `gender` | |
| `position` | `position` | |
| `level` | `skill_level` | |
| `city` | TEXT | Texto legado / display; convive con `city_id` |
| `city_id` | UUID FK | → `geo_cities.id` |
| `availability` | TEXT[] | |
| `photo_url` | TEXT | |
| `bio` | TEXT | |
| `created_at`, `updated_at` | TIMESTAMPTZ | `updated_at` vía trigger |
| `account_type` | `account_type` | default `player` |
| `whatsapp_phone` | TEXT | |
| `player_essentials_completed_at` | TIMESTAMPTZ | Onboarding jugador |
| `birth_date` | DATE | Opcional; edad derivada |
| `stats_player_wins`, `stats_player_draws`, `stats_player_losses` | INTEGER | ≥ 0 |
| `stats_organized_completed`, `stats_organizer_wins` | INTEGER | ≥ 0 |
| `mod_yellow_cards`, `mod_red_cards` | INTEGER | Moderación |
| `mod_suspended_until` | TIMESTAMPTZ | |
| `mod_banned_at` | TIMESTAMPTZ | |
| `mod_ban_reason` | TEXT | |

### 7.3 Tabla `match_opportunities`

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | UUID PK | |
| `type` | `match_type` | |
| `title`, `description` | TEXT | |
| `location`, `venue` | TEXT | |
| `date_time` | TIMESTAMPTZ | |
| `level` | `skill_level` | |
| `creator_id` | UUID FK | → `profiles` |
| `team_name` | TEXT | |
| `players_needed`, `players_joined` | INTEGER | `players_joined` mantenido por trigger |
| `gender` | `gender` | |
| `status` | `match_status` | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |
| `sports_venue_id` | UUID FK | → `sports_venues` |
| `venue_reservation_id` | UUID FK | → `venue_reservations` |
| `city_id` | UUID FK | → `geo_cities` |
| `players_seek_profile` | TEXT | p. ej. `gk_only`, `field_only`, `gk_and_field` |
| `revuelta_lineup` | JSONB | Equipos A/B |
| `finalized_at` | TIMESTAMPTZ | Cierre por organizador |
| `rival_result` | `rival_result` | Solo tipo `rival` |
| `casual_completed` | BOOLEAN | Tipos `players` / `open` |
| `suspended_at`, `suspended_reason` | TIMESTAMPTZ, TEXT | |
| `revuelta_result` | `revuelta_result` | |
| `rival_captain_vote_challenger`, `rival_captain_vote_accepted` | `rival_result` | |
| `rival_outcome_disputed` | BOOLEAN | |
| `match_stats_applied_at` | TIMESTAMPTZ | Anti doble conteo stats |
| `private_revuelta_team_id` | UUID FK | → `teams`; solo con `type = open` |

### 7.4 Tabla `match_opportunity_participants`

| Columna | Tipo |
|---------|------|
| `opportunity_id` | UUID FK → `match_opportunities` (PK parte) |
| `user_id` | UUID FK → `profiles` (PK parte) |
| `status` | `participant_status` |
| `created_at` | TIMESTAMPTZ |
| `is_goalkeeper` | BOOLEAN | Revuelta |

### 7.5 Tablas `matches`, `match_participants`

Instancia de partido opcional; enlazada a oportunidad.

| `matches` | `id`, `opportunity_id`, `status`, `created_at` |
|-----------|--------------------------------------------------|
| `match_participants` | `match_id`, `user_id` (PK compuesta) |

### 7.6 Tabla `messages`

Chat por oportunidad (`matchId` en la app = `opportunity_id`).

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `opportunity_id` | UUID FK |
| `sender_id` | UUID FK → `profiles` |
| `content` | TEXT (1–8000 chars) |
| `created_at` | TIMESTAMPTZ |

### 7.7 Tabla `match_opportunity_ratings`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `opportunity_id` | UUID FK |
| `rater_id` | UUID FK |
| `organizer_rating` | SMALLINT NULL (1–5) |
| `match_rating`, `level_rating` | SMALLINT (1–5) |
| `comment` | TEXT NULL |
| `created_at` | TIMESTAMPTZ |
| | UNIQUE (`opportunity_id`, `rater_id`) |

### 7.8 Tabla `rival_challenges`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `opportunity_id` | UUID FK UNIQUE |
| `challenger_team_id` | UUID FK → `teams` |
| `challenger_captain_id` | UUID FK |
| `challenged_team_id`, `challenged_captain_id` | UUID FK NULL |
| `accepted_team_id`, `accepted_captain_id` | UUID FK NULL |
| `mode` | `rival_challenge_mode` |
| `status` | `rival_challenge_status` |
| `created_at`, `responded_at` | TIMESTAMPTZ |

### 7.9 Tablas `teams`, `team_members`, `team_invites`

**`teams`**

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `name` | TEXT |
| `logo_url` | TEXT NULL |
| `level` | `skill_level` |
| `captain_id` | UUID FK → `profiles` |
| `vice_captain_id` | UUID FK NULL → `profiles` |
| `city` | TEXT |
| `city_id` | UUID FK → `geo_cities` |
| `gender` | `gender` |
| `description` | TEXT NULL |
| `created_at`, `updated_at` | TIMESTAMPTZ |
| `stats_wins`, `stats_draws`, `stats_losses` | INTEGER |
| `stats_win_streak`, `stats_loss_streak` | INTEGER |

**`team_members`**

| Columna | Tipo |
|---------|------|
| `team_id`, `user_id` | UUID (PK compuesta) |
| `position` | `position` |
| `photo_url` | TEXT |
| `status` | `team_member_status` |
| `created_at` | TIMESTAMPTZ |

**`team_invites`**

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `team_id`, `inviter_id`, `invitee_id` | UUID FK |
| `status` | `invite_status` |
| `created_at` | TIMESTAMPTZ |

### 7.10 Tablas `team_join_requests`, `team_private_settings`

**`team_join_requests`:** `id`, `team_id`, `requester_id`, `status` (`invite_status`), `created_at`, `updated_at`.

**`team_private_settings`:** `team_id` PK FK, `whatsapp_invite_url`, `rules_text`, `updated_at`.

### 7.11 Centros deportivos

**`sports_venues`:** `id`, `owner_id`, `name`, `address`, `maps_url`, `phone`, `city`, `city_id`, `slot_duration_minutes`, `created_at`, `updated_at`.

**`venue_courts`:** `id`, `venue_id`, `name`, `sort_order`, `price_per_hour` (INTEGER NULL).

**`venue_weekly_hours`:** `id`, `venue_id`, `day_of_week` (0–6), `open_time`, `close_time`, UNIQUE (`venue_id`, `day_of_week`).

**`venue_reservations`:** `id`, `court_id`, `starts_at`, `ends_at`, `booker_user_id`, `match_opportunity_id`, `status` (`venue_reservation_status`), `notes`, `created_at`, `payment_status`, `price_per_hour`, `currency`, `deposit_amount`, `paid_amount`, `confirmed_at`, `cancelled_at`, `cancelled_reason`, `confirmed_by_user_id`, `confirmation_source`, `confirmation_note`.

**`venue_reservation_events`:** `id`, `reservation_id`, `actor_user_id`, `kind`, `payload` JSONB, `created_at`.

### 7.12 Catálogo geográfico

**`geo_countries`:** `id`, `iso_code` (2 minúsculas), `name`, `is_active`, `created_at`.

**`geo_regions`:** `id`, `country_id`, `code`, `name`, `is_active`, `created_at`.

**`geo_cities`:** `id`, `region_id`, `name`, `slug`, `is_active`, `created_at`.

Seed y ampliación: migraciones `20260329120000_*`, `20260409120000_*` (Chile / regiones / comunas).

### 7.13 Revuelta privada — `revuelta_external_join_requests`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `opportunity_id` | UUID FK |
| `requester_id` | UUID FK |
| `is_goalkeeper` | BOOLEAN |
| `status` | TEXT CHECK `pending` / `accepted` / `declined` |
| `created_at`, `responded_at` | TIMESTAMPTZ |

### 7.14 Moderación — `player_reports`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `reporter_id`, `reported_user_id` | UUID FK |
| `context_type` | TEXT |
| `context_id` | UUID NULL |
| `reason` | TEXT |
| `details` | TEXT NULL |
| `status` | `player_report_status` |
| `reviewed_by` | UUID FK NULL |
| `reviewed_at` | TIMESTAMPTZ NULL |
| `resolution` | TEXT NULL |
| `created_at` | TIMESTAMPTZ |

---

## 8. Funciones, triggers y RPC (resumen)

Aplicación de negocio repartida entre triggers y funciones `SECURITY DEFINER`. Lista orientativa (nombre exacto en SQL):

| Nombre | Rol |
|--------|-----|
| `set_updated_at` | Actualiza `updated_at` en tablas con trigger. |
| `handle_new_user` | Crea fila en `profiles` al registrarse en Auth. |
| `refresh_opportunity_players_joined` | Recalcula `players_joined` en oportunidades. |
| `enforce_match_rating_rules` | Valida inserción en `match_opportunity_ratings`. |
| `venue_reservations_check_overlap` | Evita solapamiento de reservas activas en la misma cancha. |
| `handle_venue_reservation_status_change` | Efectos al cambiar estado de reserva. |
| `book_venue_slot` | RPC reserva de franja (evoluciona en migraciones; precio por hora, pending, etc.). |
| `venue_public_reservations_in_range` | Lectura de reservas públicas en rango temporal. |
| `is_venue_owner` | Dueño del centro. |
| `is_admin` | Perfil `account_type = admin`. |
| `is_team_member`, `is_confirmed_team_member` | Pertenencia a equipo. |
| `is_team_captain`, `is_team_primary_captain`, `is_team_staff_captain` | Capitán / vice (políticas y escritura). |
| `enforce_team_roster_max_18`, `enforce_team_members_limit_5`, `enforce_teams_limit_5_on_insert` | Límites de plantilla y equipos por usuario. |
| `enforce_teams_vice_captain_member`, `trg_team_members_clear_vice_on_delete` | Integridad vicecapitán. |
| `prevent_team_city_change` | Ciudad de equipo inmutable tras creación. |
| `team_completed_rival_counts` | Conteos de rivales para UI/momentum. |
| `enforce_open_revuelta_goalkeeper_limit`, `enforce_open_revuelta_role_slots` | Cupos revuelta. |
| `enforce_private_revuelta_creator_is_team_member` | Revuelta privada. |
| `apply_match_stats_from_outcome` | Stats en perfiles/equipos al cerrar partido. |
| `trg_match_completed_apply_stats` | Dispara aplicación de stats. |
| `submit_rival_captain_vote`, `finalize_rival_organizer_override`, `finalize_revuelta_match`, `finalize_rival_match` | Cierre rival/revuelta y desempates. |
| `accept_revuelta_external_request`, `decline_revuelta_external_request` | Solicitudes externas revuelta privada. |
| `fetch_public_player_profile` | Perfil público sin datos sensibles. |
| `admin_apply_card`, `admin_ban_user` | Moderación (solo admin). |
| `default_geo_city_id` | Ciudad por defecto (Chile / VI / Rancagua). |
| `profiles_sync_age_from_birth_date` | Edad desde fecha de nacimiento. |
| `sync_team_member_position_from_profile`, `sync_team_member_photo_from_profile` | Coherencia plantilla ↔ perfil. |

Para firmas y cuerpo exacto, abrir la migración correspondiente en `supabase/migrations/`.

---

## 9. Row Level Security (RLS)

RLS está habilitado en la mayoría de tablas públicas de negocio. Las políticas concretas viven en:

- `20250322180001_rls_policies.sql` (base)
- Migraciones posteriores que hacen `DROP POLICY` / `CREATE POLICY`

El rol **`service_role`** bypass RLS (solo servidor). El cliente usa **`anon`** / **`authenticated`** según políticas.

---

## 10. Realtime (Supabase)

Publicación `supabase_realtime` incluye entre otras (según migraciones): `messages`, `match_opportunities`, `match_opportunity_participants`, `match_opportunity_ratings`, `rival_challenges`, y suscripciones relacionadas en `profiles` / equipos en migraciones recientes. Ver migraciones `*_realtime_*`.

---

## 11. Storage

| Bucket | Uso |
|--------|-----|
| `profile-avatars` | Fotos de perfil (políticas por usuario propietario). |
| `team-logos` | Escudos de equipo (capitán del equipo). |

Definición en `20250324120000_team_logos_storage.sql` y `20250326140000_profile_avatars_storage.sql`.

---

## 12. Mantenimiento de esta documentación

1. Tras **nueva migración**: actualizar secciones 7–11.  
2. Tras **cambios en `lib/types.ts` o APIs**: secciones 4–6.  
3. Tras **cambios en `package.json`**: sección 1.  

El archivo **`DOCUMENTACION-PROYECTO.txt`** es un borrador histórico en texto plano; **esta `DOCUMENTACION.md` es la referencia consolidada** recomendada en el repositorio.
