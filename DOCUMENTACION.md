# Pichanga — Documentación del proyecto

Plataforma web de matchmaking para fútbol amateur (6 vs 6): rivales, búsqueda de jugadores, revueltas, equipos, centros deportivos y reservas de cancha. Esta documentación resume **stack**, **arquitectura**, **base de datos (Supabase/PostgreSQL)** y **recursos** del repositorio.

---

## 1. Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Framework | **Next.js 16** (App Router) |
| UI | **React 19** |
| Lenguaje | **TypeScript 5.7** |
| Estilos | **Tailwind CSS 4** + **tw-animate-css** |
| Componentes | **Radix UI** (primitivos) + **shadcn/ui** (patrón en `components/ui/`) |
| Backend / datos | **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) |
| Auth | Supabase Auth (email/contraseña); sesión en cliente con persistencia (`lib/supabase/client.ts`) |
| Formularios | **react-hook-form**, **zod**, **@hookform/resolvers** |
| Fechas | **date-fns** |
| Notificaciones UI | **sonner** |
| Temas | **next-themes** |
| Gráficos (admin) | **recharts** |
| Analytics | **@vercel/analytics** |
| Deploy típico | **Netlify** (`@netlify/plugin-nextjs` en devDependencies) |

**Requisitos:** Node.js **≥ 20** (ver `package.json` → `engines`).

---

## 2. Variables de entorno

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase (cliente browser y SSR) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima (solo operaciones permitidas por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** (API routes admin). **No** exponer al frontend ni con prefijo `NEXT_PUBLIC_` |

Archivo local de ejemplo: `.env.local` (no versionar secretos).

---

## 3. Arquitectura de la aplicación

### 3.1 Rutas Next.js (`app/`)

| Ruta | Descripción |
|------|-------------|
| `/` | App principal: **SPA interna** con `AppProvider` (`lib/app-context.tsx`). Pantallas por estado (`currentScreen`), no por rutas anidadas. |
| `/centro/[venueId]` | Página pública del centro: horarios, slots y enlace a crear partido con prefill. |
| `/equipo/[teamId]` | Ficha pública de equipo (invitaciones). |
| `/revuelta/[opportunityId]` | Vista pública de revuelta (tipo `open`). |
| `app/api/admin/metrics` | Métricas de reservas (requiere service role / lógica admin). |
| `app/api/admin/create-venue-user` | Alta de usuario centro (service role). |

### 3.2 Middleware (`middleware.ts`)

Refresca la sesión JWT de Supabase y sincroniza cookies entre request/response (patrón recomendado con `@supabase/ssr`).

### 3.3 Estado global

- **`lib/app-context.tsx`**: usuario, partidos, equipos, chats, pantalla actual, login/logout, creación de oportunidades, reservas RPC, etc.
- **Almacenamiento local**: tema (`pichanga-theme`), última pestaña de navegación (`pichanga-last-nav-screen`), prefill de crear partido, deep links de equipo/partido.

### 3.4 Carpetas relevantes

```
app/                 # Layout, página principal, rutas públicas, API routes
components/          # Pantallas y UI (home, create, teams, matches, venue-dashboard, etc.)
lib/                 # Contexto, tipos, queries Supabase, utilidades
supabase/migrations/ # Esquema PostgreSQL versionado
middleware.ts        # Sesión Supabase en edge
```

---

## 4. Modelo de dominio (TypeScript)

Referencia principal: **`lib/types.ts`**. Incluye entre otros:

- `User`, `MatchOpportunity`, `MatchType`, `MatchStatus`, `Gender`, `Level`, `Position`
- `Team`, `TeamMember`, `TeamInvite`, `TeamJoinRequest`, `TeamPrivateSettings`
- `RivalChallenge`, `SportsVenue`, `VenueCourt`, `VenueWeeklyHour`, `VenueReservationRow`
- `OnboardingData`, `VenueOnboardingData`, `AccountType` (`player` | `venue` | `admin`)

Los mappers DB → app están en **`lib/supabase/mappers.ts`** (y queries específicas en `lib/supabase/*.ts`).

---

## 5. Base de datos (Supabase / PostgreSQL)

Motor: **PostgreSQL** (Supabase). El esquema evoluciona con migraciones en **`supabase/migrations/`** (orden cronológico por prefijo de fecha).

### 5.1 Extensiones

- **`pgcrypto`**: `gen_random_uuid()`, etc.

### 5.2 Tipos ENUM (PostgreSQL)

| Tipo | Valores (resumen) |
|------|-------------------|
| `gender` | `male`, `female` |
| `position` | `portero`, `defensa`, `mediocampista`, `delantero` |
| `skill_level` | `principiante`, `intermedio`, `avanzado`, `competitivo` |
| `match_type` | `rival`, `players`, `open` |
| `match_status` | `pending`, `confirmed`, `completed`, `cancelled` |
| `team_member_status` | `confirmed`, `pending`, `invited` |
| `invite_status` | `pending`, `accepted`, `declined` |
| `participant_status` | `pending`, `confirmed`, `cancelled` |
| `rival_result` | `creator_team`, `rival_team`, `draw` |
| `rival_challenge_mode` | `direct`, `open` |
| `rival_challenge_status` | `pending`, `accepted`, `declined`, `cancelled` |
| `account_type` | `player`, `venue`; luego **`admin`** (migración admin) |
| `venue_reservation_status` | `pending`, `confirmed`, `cancelled` (evolución por migraciones) |
| `venue_payment_status` | `unpaid`, `deposit_paid`, `paid` |

---

### 5.3 Tablas y columnas

#### `public.profiles`

Perfil 1:1 con `auth.users`.

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | UUID PK | FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | TEXT | |
| `age` | INTEGER | CHECK 0–120 |
| `gender` | `gender` | |
| `position` | `position` | |
| `level` | `skill_level` | |
| `city` | TEXT | |
| `availability` | TEXT[] | |
| `photo_url` | TEXT | |
| `bio` | TEXT | nullable |
| `whatsapp_phone` | TEXT | registro / flujo app |
| `account_type` | `account_type` | `player` por defecto; `venue`/`admin` según negocio |
| `created_at`, `updated_at` | TIMESTAMPTZ | trigger `set_updated_at` |

Trigger: **`handle_new_user`** en `auth.users` INSERT → crea fila en `profiles`.

---

#### `public.match_opportunities`

Oportunidades de partido (listados, crear, explorar).

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | UUID PK | |
| `type` | `match_type` | |
| `title` | TEXT | |
| `description` | TEXT | |
| `location` | TEXT | |
| `venue` | TEXT | nombre lugar (texto libre o derivado) |
| `date_time` | TIMESTAMPTZ | |
| `level` | `skill_level` | |
| `creator_id` | UUID FK → `profiles` | |
| `team_name` | TEXT | nullable |
| `players_needed` | INTEGER | nullable; revuelta `open`: típ. 10–12 |
| `players_joined` | INTEGER | mantenido por trigger según participantes |
| `gender` | `gender` | |
| `status` | `match_status` | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |
| `finalized_at` | TIMESTAMPTZ | cierre por organizador (calificaciones 48 h) |
| `rival_result` | `rival_result` | solo tipo rival |
| `casual_completed` | BOOLEAN | players/open “jugado” |
| `suspended_at` | TIMESTAMPTZ | |
| `suspended_reason` | TEXT | longitud validada |
| `players_seek_profile` | TEXT | `gk_only`, `field_only`, `gk_and_field` o NULL |
| `revuelta_lineup` | JSONB | equipos A/B sorteados |
| `sports_venue_id` | UUID FK | nullable → `sports_venues` |
| `venue_reservation_id` | UUID FK | nullable → `venue_reservations` |

Realtime: publicado en migración inicial (y uso en app).

---

#### `public.match_opportunity_participants`

| Columna | Tipo | Notas |
|---------|------|--------|
| `opportunity_id` | UUID | FK → `match_opportunities`, parte de PK |
| `user_id` | UUID | FK → `profiles`, parte de PK |
| `status` | `participant_status` | |
| `created_at` | TIMESTAMPTZ | |
| `is_goalkeeper` | BOOLEAN | revuelta `open`; límites por triggers |

Triggers: refresco de `players_joined`, cupos revuelta, límite arqueros.

---

#### `public.matches` y `public.match_participants`

Instancia opcional de partido confirmado (esquema inicial; políticas RLS enlazan a creador de oportunidad).

---

#### `public.messages`

Chat por oportunidad (`opportunity_id` = id de `match_opportunities` en el front).

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `opportunity_id` | UUID FK |
| `sender_id` | UUID FK → `profiles` |
| `content` | TEXT (1–8000 chars) |
| `created_at` | TIMESTAMPTZ |

---

#### `public.teams`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `name` | TEXT |
| `logo_url` | TEXT |
| `level` | `skill_level` |
| `captain_id` | UUID FK → `profiles` |
| `city` | TEXT |
| `gender` | `gender` |
| `description` | TEXT |
| `created_at`, `updated_at` | TIMESTAMPTZ |

Límite: capitán con máx. 5 equipos (trigger en `teams`).

---

#### `public.team_members`

| Columna | Tipo |
|---------|------|
| `team_id`, `user_id` | PK compuesta, FKs |
| `position` | `position` |
| `photo_url` | TEXT |
| `status` | `team_member_status` |
| `created_at` | TIMESTAMPTZ |

Límite: máx. 5 equipos por usuario (trigger en INSERT).

---

#### `public.team_invites`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `team_id` | UUID FK |
| `inviter_id`, `invitee_id` | UUID FK → `profiles` |
| `status` | `invite_status` |
| `created_at` | TIMESTAMPTZ |

Índice único parcial: un `pending` por `(team_id, invitee_id)`.

---

#### `public.team_join_requests`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `team_id` | UUID FK |
| `requester_id` | UUID FK |
| `status` | `invite_status` |
| `created_at`, `updated_at` | TIMESTAMPTZ |

---

#### `public.team_private_settings`

| Columna | Tipo |
|---------|------|
| `team_id` | UUID PK FK → `teams` |
| `whatsapp_invite_url` | TEXT |
| `rules_text` | TEXT |
| `updated_at` | TIMESTAMPTZ |

RLS: lectura miembros/capitán; escritura capitán.

---

#### `public.rival_challenges`

Desafíos rival (directo u open).

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `opportunity_id` | UUID UNIQUE FK |
| `challenger_team_id` | UUID FK |
| `challenger_captain_id` | UUID FK |
| `challenged_team_id`, `challenged_captain_id` | nullable |
| `accepted_team_id`, `accepted_captain_id` | nullable |
| `mode` | `rival_challenge_mode` |
| `status` | `rival_challenge_status` |
| `created_at`, `responded_at` | TIMESTAMPTZ |

---

#### `public.match_opportunity_ratings`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `opportunity_id` | UUID FK |
| `rater_id` | UUID FK |
| `organizer_rating` | SMALLINT 1–5 o NULL |
| `match_rating` | SMALLINT 1–5 |
| `level_rating` | SMALLINT 1–5 |
| `comment` | TEXT |
| `created_at` | TIMESTAMPTZ |

UNIQUE `(opportunity_id, rater_id)`. Trigger valida ventana 48 h y reglas organizador/participante.

---

#### `public.sports_venues`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `owner_id` | UUID FK → `profiles` |
| `name`, `address`, `phone`, `city` | TEXT |
| `maps_url` | TEXT |
| `slot_duration_minutes` | INTEGER 15–180 |
| `created_at`, `updated_at` | TIMESTAMPTZ |

---

#### `public.venue_courts`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `venue_id` | UUID FK |
| `name` | TEXT |
| `sort_order` | INTEGER |

---

#### `public.venue_weekly_hours`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `venue_id` | UUID FK |
| `day_of_week` | SMALLINT 0–6 |
| `open_time`, `close_time` | TIME |
| UNIQUE `(venue_id, day_of_week)` |

---

#### `public.venue_reservations`

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `court_id` | UUID FK → `venue_courts` |
| `starts_at`, `ends_at` | TIMESTAMPTZ |
| `booker_user_id` | UUID FK → `profiles`, nullable |
| `match_opportunity_id` | UUID FK, nullable |
| `status` | `venue_reservation_status` |
| `notes` | TEXT |
| `created_at` | TIMESTAMPTZ |
| `payment_status` | `venue_payment_status` |
| `price_per_hour` | INTEGER |
| `currency` | TEXT |
| `deposit_amount`, `paid_amount` | INTEGER |
| `confirmed_at`, `cancelled_at` | TIMESTAMPTZ |
| `cancelled_reason` | TEXT |
| `confirmed_by_user_id` | UUID FK |
| `confirmation_source` | TEXT | `venue_owner`, `booker_self`, `admin` |
| `confirmation_note` | TEXT |

Triggers: solapamiento de franjas; cambio de estado (p. ej. cancelar partido vinculado).

---

#### `public.venue_reservation_events` (historial)

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `reservation_id` | UUID FK |
| `actor_user_id` | UUID FK |
| `kind` | TEXT |
| `payload` | JSONB |
| `created_at` | TIMESTAMPTZ |

---

### 5.4 Funciones y RPC destacadas

| Nombre | Rol |
|--------|-----|
| `set_updated_at()` | Trigger genérico `updated_at` |
| `handle_new_user()` | INSERT perfil al registrarse en Auth |
| `refresh_opportunity_players_joined()` | Recalcula `players_joined` |
| `is_match_opportunity_creator(uuid)` | RLS / lógica |
| `can_access_opportunity_thread(uuid)` | Chat: creador o participante |
| `is_team_captain(uuid)` | RLS equipos |
| `is_team_member(uuid, uuid)` | RLS solicitudes |
| `is_venue_owner(uuid)` | Dueño de centro |
| `book_venue_slot(venue, starts, ends)` | Reserva cancha (SECURITY DEFINER); crea fila `pending` + pago |
| `venue_public_reservations_in_range(venue, from, to)` | Solo **confirmed**; uso público `/centro` |
| `venue_public_reservations_in_range` | expuesta a `anon` + `authenticated` |
| `enforce_match_rating_rules` | Trigger ratings |
| `enforce_open_revuelta_*` | Cupos y arqueros revuelta |
| `handle_venue_reservation_status_change` | Cancelación y efecto en partido |
| `is_admin()` | Cuenta `admin` (comparación segura con enum) |

---

### 5.5 Storage (Supabase Storage)

| Bucket | Uso | Política resumida |
|--------|-----|-------------------|
| `profile-avatars` | Fotos de perfil | Lectura pública; escritura solo objeto bajo prefijo `auth.uid()` |
| `team-logos` | Escudos de equipo | Lectura pública; capitán del equipo puede escribir en carpeta `teamId` |

---

### 5.6 Row Level Security (RLS)

- RLS **habilitado** en tablas de aplicación (`profiles`, `match_*`, `teams`, `messages`, `rival_challenges`, `match_opportunity_ratings`, reservas, etc.).
- Políticas detalladas en **`20250322180001_rls_policies.sql`** y migraciones posteriores (venues, anon para `/equipo` y revueltas abiertas, admin sobre reservas, etc.).
- **`anon`**: lectura selectiva de `teams` + `team_members`; oportunidades `open` activas + participantes asociados; ejecución de `venue_public_reservations_in_range`.
- **`authenticated`**: resto según dueño, capitán, creador, participante o `booker`.

---

### 5.7 Realtime (publicación)

Tablas añadidas a `supabase_realtime` (según migraciones): entre otras `messages`, `match_opportunities`, `match_opportunity_participants`, `match_opportunity_ratings`, `rival_challenges`, `sports_venues`, `venue_reservations`.

---

### 5.8 Índice de migraciones (referencia)

Aplicar en orden los archivos bajo `supabase/migrations/`:

1. `20250322180000_initial_schema.sql` — tablas núcleo, triggers perfil/participantes  
2. `20250322180001_rls_policies.sql` — RLS base  
3. `20250322190000_match_completion_and_ratings.sql` — finalización y ratings  
4. `20250322193000_rival_challenges.sql`  
5. `20250322194000_match_suspension_reason.sql`  
6. `20250324120000_team_logos_storage.sql`  
7. `20250325140000_anon_public_team_invite_read.sql`  
8. `20250325160000_revuelta_goalkeeper_and_public_read.sql`  
9. `20250325180000_revuelta_lineup.sql`  
10. `20250326120000_players_seek_profile.sql`  
11. `20250326140000_profile_avatars_storage.sql`  
12. `20250326160000_team_join_requests.sql`  
13. `20250326170000_team_private_settings.sql`  
14. `20250327100000_sports_venues_and_bookings.sql`  
15. `20250327110000_venue_public_reservations_rpc.sql`  
16. `20250327120000_team_members_limit_5.sql`  
17. `20250327120001_teams_limit_5.sql`  
18. `20250327130000_revuelta_roles_and_capacity.sql`  
19. `20260326112000_profiles_whatsapp_required_signup.sql`  
20. `20260326123000_allow_auth_user_creation_without_whatsapp.sql`  
21. `20260326200000_venue_reservations_payments_and_history.sql`  
22. `20260327001000_admin_and_self_confirmed_reservations.sql`  
23. `20260327012000_venue_manual_reservations_insert_policy.sql`  

---

## 6. Scripts npm

| Script | Comando |
|--------|---------|
| Desarrollo | `npm run dev` |
| Build producción | `npm run build` |
| Servidor producción | `npm run start` |
| Lint | `npm run lint` |

---

## 7. Mantenimiento de esta documentación

- El **esquema real** es el que resulta de aplicar **todas** las migraciones en un proyecto Supabase limpio; si añades migraciones nuevas, actualiza las secciones 5.2–5.8.
- Los **tipos TypeScript** pueden adelantarse o diferir ligeramente del SQL; la fuente de verdad en runtime es PostgreSQL + RLS.

---

*Documento generado a partir del código y migraciones del repositorio Pichanga.*
