# Sportmatch — Documentación del proyecto (visión, producto y técnica)

Documento orientado a **entender el para qué**, **qué hace la app**, **cómo está armada** y **dónde profundizar**.  
Para el detalle exhaustivo de tablas, columnas, enums y RPC, usar además **`DOCUMENTACION.md`** en la raíz del repo.

---

## 1. Visión del proyecto

| Aspecto | Contenido |
|--------|-----------|
| **Nombre** | **Sportmatch** (paquete npm `sportmatch`; marca en UI y SEO, p. ej. sportmatch.cl) |
| **Problema** | Coordinar fútbol amateur es frágil: falta gente, no hay rival, no se sabe si la cancha está confirmada, el grupo se pierde en WhatsApp sueltos y no hay un lugar único para equipos, centros y partidos. |
| **Público** | Jugadores y organizadores de fútbol amateur en Chile (enfoque regional, p. ej. Rancagua en páginas SEO); equipos que buscan rivales; centros deportivos que publican canchas y reservas. |
| **Propuesta de valor** | Una sola app para **crear o unirse a partidos**, **equipos e invitaciones**, **chat por partido**, **reservas de cancha vinculadas al encuentro**, **revueltas con sorteo de equipos**, **modo selección de equipos (6vs6)** con colores y roles, **perfiles públicos** y **moderación** básica. Menos fricción que grupos dispersos y más contexto que un simple grupo de chat. |
| **Objetivo de negocio** | **Retención** (partidos recurrentes, equipos), **leads** para centros (fichas, reservas), base para **monetización** futura (visibilidad premium, comisiones, etc.); **confianza** vía calificaciones y reportes. |

---

## 2. Funcionalidades principales (core)

Sin entrar a código, la app hoy cubre entre otras:

- **Registro / sesión** con **Supabase Auth** (email y proveedores según configuración del proyecto).
- **Perfil de jugador** (datos, foto, esenciales, WhatsApp Chile `+569`, ciudad/geo, moderación: tarjetas, suspensiones).
- **Crear partidos / oportunidades** según tipo: **rival**, **faltan jugadores** (`players`), **revuelta abierta** (`open`), **selección de equipos pública/privada** (`team_pick_*`).
- **Unirse a partidos** (RPCs, cupos, estados de participante).
- **Revuelta**: arqueros, cupos, **sorteo Equipo A/B**, colores de camiseta; **revuelta privada** con equipo ancla y **solicitudes externas** (organizador acepta/rechaza).
- **Selección de equipos (team pick)**: bando A/B, roles de cancha, colores, código de unión en privado; organizador puede **ajustar alineación** y **expulsar con motivo** en ventana definida.
- **Chat** por oportunidad (mensajes en BD, acceso acotado a quien corresponda por RLS).
- **Tiempo real** (p. ej. participantes del partido vía Supabase Realtime + caché TanStack Query).
- **Reservas de cancha** en centros: estados, pago, confirmación por centro / autoconfirmación organizador, enlace a detalle del partido.
- **Equipos**: plantilla, invitaciones, solicitudes de ingreso, rivales / desafíos, estadísticas y rachas.
- **Centros deportivos**: onboarding, dashboard, canchas, horarios, precios, reservas (jugador y manual).
- **Cierre de partido**: finalizar, resultado (rival/revuelta), votaciones de capitanes donde aplica, **calificaciones** post-partido.
- **Explorar** centros / huecos; **landings SEO** (p. ej. Rancagua).
- **Administración**: métricas, geo, reportes, sanciones, altas de usuario centro (API routes con rol de servicio).
- **Reportes de conducta** entre jugadores y flujo de revisión.

---

## 3. Arquitectura del sistema

### 3.1 Stack por capa

| Capa | Tecnología |
|------|------------|
| **Frontend** | **Next.js 16** (App Router), **React 19**, **TypeScript 5.7** |
| **UI** | **Tailwind CSS 4**, **Radix UI**, componentes estilo **shadcn** (`components/ui/`), **lucide-react**, **sonner** (toasts), **next-themes** |
| **Estado / datos cliente** | **TanStack Query v5**, contexto global en **`lib/app-context.tsx`** |
| **Backend** | **Supabase**: PostgreSQL + **Row Level Security (RLS)** + funciones **RPC** (`SECURITY DEFINER`) + triggers |
| **Auth** | **Supabase Auth** (`@supabase/supabase-js`, `@supabase/ssr` para cookies/SSR) |
| **Tiempo real** | **Supabase Realtime** (canales sobre tablas relevantes) |
| **Storage** | **Supabase Storage** (avatares, logos de equipo, según políticas del proyecto) |
| **Formularios / validación** | **react-hook-form**, **zod** |
| **Fechas / zona** | **date-fns**, **date-fns-tz** (p. ej. `America/Santiago`) |
| **Analytics** | **@vercel/analytics** |
| **Tests** | **Vitest** |
| **Hosting** | Típico **Vercel** o **Netlify** (hay `@netlify/plugin-nextjs` en devDependencies; el despliegue concreto depende del entorno) |

### 3.2 Diagrama lógico (texto)

```
[Usuario] → navegador / PWA
     │
     ▼
[Next.js App Router]
  • Páginas públicas: /centro, /equipo, /revuelta, /rancagua/* 
  • SPA principal en / con AppProvider (pantallas: home, crear, partidos, equipos, perfil…)
  • app/api/admin/* → operaciones servidor (service role / admin)
     │
     ├─► Supabase Auth (JWT, cookies vía SSR)
     │
     └─► Supabase PostgREST + RPC + RLS
              │
              ├─► PostgreSQL (tablas: profiles, match_opportunities, …)
              ├─► Storage (fotos/logos)
              └─► Realtime (sincronización en vivo)
```

### 3.3 Organización del código (resumen)

- **`app/`**: layouts, rutas, API admin, metadata SEO.
- **`components/`**: pantallas `*-screen.tsx`, flujos de negocio, admin, venue.
- **`lib/`**: tipos (`types.ts`), contexto, queries/mutations Supabase, utilidades de dominio.
- **`supabase/migrations/`**: esquema versionado.

---

## 4. Diseño de base de datos (crítico)

La fuente de verdad son las **migraciones SQL**. Resumen de entidades y relaciones; listado de columnas al nivel de **DOCUMENTACION.md §7**.

### 4.1 Tablas principales (mapa mental)

| Tabla / grupo | Rol |
|---------------|-----|
| **`auth.users`** | Identidad Supabase (email, etc.) |
| **`profiles`** | 1:1 con `auth.users`; perfil jugador/centro/admin, stats, moderación, `whatsapp_phone`, geo |
| **`match_opportunities`** | Partido u oportunidad (tipo, fechas, cupos, estado, venue, reserva, revuelta JSON, rival, team pick, join_code, colores, etc.) |
| **`match_opportunity_participants`** | N:N usuario ↔ oportunidad; estado participante; flags revuelta/team pick (arquero, bando, rol) |
| **`messages`** | Chat por `opportunity_id` |
| **`match_opportunity_ratings`** | Calificaciones 1 por usuario y oportunidad |
| **`matches` / `match_participants`** | Instancia opcional de partido confirmado |
| **`teams`, `team_members`, `team_invites`, `team_join_requests`, `team_private_settings`** | Equipos y membresía |
| **`rival_challenges`** | Desafío entre equipos ligado a una oportunidad |
| **`sports_venues`, `venue_courts`, `venue_weekly_hours`, `venue_reservations`, `venue_reservation_events`** | Centros, canchas, horarios, reservas y auditoría |
| **`geo_countries`, `geo_regions`, `geo_cities`** | Catálogo geográfico |
| **`revuelta_external_join_requests`** | Ingreso externo a revuelta privada |
| **`player_reports`** | Reportes y moderación |
| Otros | Reseñas a centros, feedback app, etc. (ver migraciones recientes) |

### 4.2 Relaciones y cardinalidad (resumen)

- **Usuario 1 — 1 Perfil** (`profiles.id` → `auth.users.id`, `ON DELETE CASCADE`).
- **Oportunidad 1 — N Participantes** (`match_opportunity_participants`: PK compuesta `opportunity_id`, `user_id`; FK a oportunidad y perfil; borrado de oportunidad **CASCADE** sobre participantes y mensajes según esquema).
- **Oportunidad N — 1 Creador** (`creator_id` → `profiles`).
- **Oportunidad N — 1 Centro / reserva** (opcional: `sports_venue_id`, `venue_reservation_id`).
- **Equipo 1 — N Miembros** (`team_members`; borrado de equipo **CASCADE** en miembros).
- **Reserva N — 1 Cancha** (`venue_courts`); eventos 1 — N sobre reserva.

### 4.3 Tipos de partido (`match_type`)

Además de `rival`, `players`, `open`, el esquema evolucionó a incluir **`team_pick_public`** y **`team_pick_private`** (colores `team_pick_color_a/b`, `join_code` en privado). Ver migraciones `team_pick_*`.

---

## 5. Flujos clave (user flows)

### 5.1 Crear partido

1. Usuario autenticado entra a **Crear**.
2. Elige tipo (rival / jugadores / revuelta / team pick), fecha, nivel, género, centro o texto de cancha, cupos, etc.
3. El cliente llama a RPC / insert según flujo (p. ej. creación con reserva).
4. Se persiste `match_opportunities` y filas relacionadas; triggers mantienen contadores.
5. El partido aparece en **Partidos** / **Inicio** y puede indexarse en listados públicos según tipo y RLS.

### 5.2 Unirse a partido

1. Usuario ve listado o enlace público (`/revuelta/...`, código team pick, etc.).
2. Confirma unirse (RPC `join_match_opportunity` u otras variantes según tipo).
3. Se inserta/actualiza `match_opportunity_participants`; `players_joined` se actualiza (trigger).
4. Si está lleno, la regla de negocio en RPC/DB impide unirse.

### 5.3 Chat del partido

1. Solo usuarios autorizados (creador o participante según política “thread”) abren **Chat**.
2. Mensajes se guardan en `messages` con `opportunity_id`.
3. Realtime opcional para refrescar sin recargar.

### 5.4 Reserva de cancha y confirmación

1. Organizador (o flujo desde Crear) vincula `venue_reservation_id`.
2. Estados: pendiente / confirmada / cancelada; fuente: centro, autoconfirmación organizador, admin.
3. En detalle del partido todos ven el estado (p. ej. UI “cancha confirmada”).

### 5.5 Revuelta: sorteo de equipos

1. Cupos llenos y dos arqueros (regla de negocio en UI/negocio).
2. Organizador elige colores y **sortea**; se persiste `revuelta_lineup` en la oportunidad.
3. Tras **partido completado**, la UI puede ocultar re-sorteo y solo mostrar equipos finales.

### 5.6 Team pick

1. Jugadores eligen bando y rol (dentro de límites); organizador puede editar y expulsar en ventana previa al partido.
2. Colores A/B visibles en detalle con escudos en UI.

### 5.7 Cierre y calificaciones

1. Organizador / flujo de finalización marca oportunidad **completed** y datos de resultado donde aplica.
2. Jugadores califican (filas en `match_opportunity_ratings`); stats pueden aplicarse una sola vez (`match_stats_applied_at`).

---

## 6. Reglas de negocio (muy importantes)

*(Muchas están en SQL: RLS, RPC y triggers; aquí solo una lista útil para producto y desarrollo.)*

- **Cupos**: no se puede superar `players_needed` en estados válidos; contador `players_joined` es autoritativo vía triggers.
- **Chat**: acceso acotado a quien puede “ver el hilo” del partido (equivalente a políticas de mensajería).
- **Cancelación / salida**: ventanas de tiempo y motivos (RPC de leave/reschedule/cancel según migraciones `match_leave`, `match_reschedule`, etc.).
- **Revuelta privada**: solo miembros del equipo ancla o flujos aprobados; externos pasan por **solicitud** al organizador.
- **Team pick**: límites de alineación (p. ej. 6 por lado, 1 arquero); expulsión solo organizador y no a sí mismo como “expulsado”; ventana **~2 h antes del partido** alineada con copy en UI.
- **Rival**: desafíos, aceptación, votación de capitanes, disputas — ver `rival_challenges` y RPCs.
- **Moderación**: reportes; acumulación de tarjetas amarillas/rojas y posible suspensión o ban en `profiles`.
- **Reservas**: transiciones de estado y quién puede confirmar (centro vs libro vs admin).
- **Perfiles**: tipos de cuenta `player` / `venue` / `admin`; permisos distintos en dashboard centro y admin.

---

## 7. API (visión práctica)

No es un REST propio único: la app usa **PostgREST de Supabase** + **RPC**.

### 7.1 Patrones

- **Lectura/escritura** en tablas con **anon key** sujeto a **RLS**.
- **Operaciones sensibles** como **`join_match_opportunity`**, creación con reserva, finalizar partido, reportes, etc. como **`rpc(nombre_función, payload)`**.

### 7.2 API Routes Next (`app/api/admin/`)

Rutas servidor típicas (requieren auth admin / service role según implementación):

- Métricas, geo, reportes, sanciones, creación usuario centro, etc.

Detalle de cada `route.ts`: cuerpo, headers y códigos en el código fuente.

---

## 8. UI / UX

### 8.1 Estilo

- Tema **oscuro/claro** (`next-themes`).
- Estética **deportiva moderna**: acentos tipo **lima/verde primario**, bordes redondeados, tarjetas, tipografía legible en móvil.
- Iconografía **Lucide**; feedback con **Sonner**.

### 8.2 Pantallas principales (SPA en `/`)

- **Inicio**, **Explorar**, **Partidos** (hub próximos / chats / finalizados), **Crear**, **Equipos**, **Perfil**.
- Pantallas contextuales: detalle de partido, chat, dashboard centro, admin, onboarding venue/jugador.

### 8.3 Público SEO

- Rutas **`/rancagua/*`**, **`/revuelta/[id]`**, **`/centro/[id]`**, **`/equipo/[id]`** para descubrimiento y enlaces compartibles.

---

## 9. Métricas clave (negocio / producto)

Ejemplos de KPIs a instrumentar o revisar en Supabase/Analytics:

- **DAU/WAU**, tiempo de sesión.
- **Partidos creados / día** y por tipo (`open`, `team_pick_*`, `rival`…).
- **Tasa de completitud**: % oportunidades `completed` vs `cancelled`.
- **Unión**: participantes confirmados vs cupo.
- **Retención** a 7/30 días; partidos recurrentes por organizador.
- **Conversión** centro: reservas confirmadas, reseñas.
- **Moderación**: reportes abiertos, tiempo de resolución.

---

## 10. Roadmap sugerido

| Fase | Enfoque |
|------|----------|
| **1 — MVP actual** | Partidos, equipos, chat, revuelta, team pick básico, reservas, perfiles, SEO local. |
| **2 — Crecimiento** | Notificaciones push, mejor descubrimiento, pagos in-app, métricas dashboards para organizadores. |
| **3 — Monetización** | Premium para centros, destacados, comisión por reserva, sponsors locales. |

*(Ajustar según prioridad real del equipo.)*

---

## 11. Tecnologías — checklist explícito

| Área | Tecnología / servicio |
|------|------------------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind 4, Radix UI, TanStack Query |
| **Backend** | Supabase (PostgreSQL, RLS, RPC, triggers) |
| **Base de datos** | PostgreSQL (hosted por Supabase) |
| **Auth** | Supabase Auth |
| **Hosting** | Vercel / Netlify (según despliegue) |
| **Notificaciones** | Principalmente in-app + Realtime; push según integración futura |
| **Storage (imágenes)** | Supabase Storage (avatares, logos, políticas en migraciones) |

---

## 12. Cómo mantener esta documentación

- Tras cambios de **esquema** o **RPC**: actualizar **`DOCUMENTACION.md`** (detalle técnico) y, si cambia el producto, **este archivo** (visiones, flujos, reglas).
- **Node**: 22.x (`package.json` `engines`).
- **Variables de entorno**: ver tabla en `DOCUMENTACION.md` §2 (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, etc.).

---

*Última actualización alineada al estado del repo (migraciones y `package.json`).*
