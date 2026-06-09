# Usuario Jugador en SportMatch — contexto completo

**Última revisión:** junio 2026 · **Marca:** SPORTMATCH · **Dominio:** [https://www.sportmatch.cl](https://www.sportmatch.cl)

Documento de referencia con **todo el contexto de SportMatch orientado al usuario jugador**: qué es la plataforma, para qué sirve, objetivos, cómo entrar, qué puede hacer, tipos de partido, equipos, reservas, reseñas, moderación y limitaciones.

---

## ¿Qué es SportMatch?

**SportMatch** es una plataforma digital (app web y app móvil) orientada al **fútbol amateur en Chile**. Conecta en un solo lugar a:

- **Jugadores** que buscan partido, equipo o cancha.
- **Organizadores** que publican oportunidades y coordinan encuentros.
- **Centros deportivos** que ofrecen canchas y reciben reservas.

Para el jugador, SportMatch es **la app donde encuentras pichangas, te apuntas, chateas con el grupo, reservas cancha y cierras el partido con estadísticas y reputación** — sin depender de grupos de WhatsApp dispersos.

**SportMatch no es** un club, federación, árbitro ni organizador presencial. Los acuerdos sobre horarios, reglas, pagos en cancha y conducta en el terreno son responsabilidad de los participantes. La app **facilita la coordinación**, no reemplaza la relación directa entre jugadores y centros.

---

## ¿Para qué sirve? (propuesta de valor para el jugador)

| Problema real | Cómo lo resuelve SportMatch |
|---------------|----------------------------|
| “Faltan jugadores para completar la pichanga” | Publicas o encuentras partidos tipo **faltan jugadores** con cupos claros. |
| “No tenemos rival este fin de semana” | Desafíos **equipo vs equipo** y búsqueda abierta de rival. |
| “No sé si la cancha está confirmada” | Reservas vinculadas al partido con estado visible (pendiente / confirmada). |
| “Todo se pierde en WhatsApp” | **Listado centralizado**, chat por partido, invitaciones y notificaciones. |
| “No conozco el nivel del grupo” | Perfiles con nivel, posición, ciudad; filtros y reseñas post-partido. |
| “Quiero armar equipos parejos al tiro” | **Revuelta** con sorteo A/B, **selección de equipos 6vs6** con colores y roles. |

En una frase: **SportMatch es el lugar único para crear o unirse a partidos, gestionar equipos, reservar cancha y construir reputación deportiva en tu zona.**

---

## Objetivos (producto y negocio desde la mirada del jugador)

1. **Liquidez de partidos:** que sea fácil publicar y llenar cupos (rival, revuelta, faltan jugadores, team pick).
2. **Confianza:** perfiles públicos, reseñas post-partido, reportes y moderación (tarjetas, suspensiones).
3. **Menos fricción:** cupos visibles, chat integrado, invitaciones proactivas, recordatorios.
4. **Relación con sedes:** explorar centros, ver disponibilidad, reservar cancha al crear partido o solo cancha.
5. **Retención:** equipos recurrentes, desafíos rivales, estadísticas (W/D/L, MVPs, partidos organizados).
6. **Comunidad local:** enfoque Chile (WhatsApp `+569`, zona horaria `America/Santiago`, catálogo geo por región/comuna).

---

## ¿Quién es el usuario jugador?

Es la cuenta por defecto (`account_type = player`). Cualquier persona que se registra desde la app pública obtiene este tipo de cuenta.

| Aspecto | Detalle |
|---------|---------|
| **Edad** | Entre **17 y 60 años** (validado con fecha de nacimiento). |
| **Contacto** | WhatsApp chileno obligatorio: `+569` + 8 dígitos. |
| **Ubicación** | Ciudad/región del catálogo geo (`geo_cities`, `geo_regions`). |
| **Perfil deportivo** | Posición (portero, defensa, mediocampista, delantero), nivel (principiante → competitivo), disponibilidad por día. |
| **Foto** | Obligatoria para completar onboarding (avatar en Storage). |

El jugador puede ser a la vez **participante** y **organizador** de partidos. No necesita cuenta especial para crear partidos.

---

## ¿Cómo entra al sistema?

### Registro e inicio de sesión

1. **Landing pública** → pantalla de auth.
2. **Supabase Auth:** email/contraseña o **Google OAuth**.
3. Tras crear cuenta, trigger en BD crea fila en `profiles`.
4. Si faltan datos esenciales → **onboarding** (3 pasos).
5. Si el perfil está completo → **Home** (feed de partidos).

### Onboarding del jugador (obligatorio)

Datos que debe confirmar:

- Nombre, fecha de nacimiento, género.
- WhatsApp (`+569XXXXXXXX`).
- Posición, nivel, ciudad, días disponibles.
- Foto de perfil.

Marca `player_essentials_completed_at` en BD. Usuarios OAuth (Google) **deben** pasar por onboarding porque la red social no entrega WhatsApp ni género.

### Navegación principal

Barra inferior con 5 pestañas (`PLAYER_NAV_SCREENS`):

| Pestaña | Pantalla | Función |
|---------|----------|---------|
| **Inicio** | `home` | Feed de partidos disponibles, filtros, unirse rápido. |
| **Partidos** | `matches` | Hub personal: próximos, invitaciones, chats, finalizados. |
| **Crear** | `create` | Publicar partido o reservar solo cancha. |
| **Equipos** | `teams` | Mis equipos, descubrir, invitaciones, desafíos rivales. |
| **Perfil** | `profile` | Datos, estadísticas, ajustes, logout. |

Pantallas contextuales (sin barra inferior): **detalle de partido**, **chat**, **onboarding**, **perfil público de otro jugador**.

**Explorar** (`explore`) existe como pantalla adicional accesible desde flujos de reserva/centros: busca centros deportivos, disponibilidad de canchas y enlaces a fichas públicas.

---

## Tipos de partido que puede crear o unirse

SportMatch soporta **5 tipos de oportunidad** (`match_type`):

### 1. Faltan jugadores (`players`) — “Yo + cinco”

- El organizador ya tiene grupo parcial y **busca completar cupos**.
- Puede indicar qué busca: solo arquero, solo campo, o ambos (`players_seek_profile`).
- Cualquier jugador elegible puede apuntarse según cupos y filtros (género, nivel, ciudad).

### 2. Revuelta abierta (`open`)

- Partido **abierto a desconocidos** que se juntan para formar dos equipos.
- Requiere **dos arqueros** antes del sorteo.
- El organizador elige colores de camiseta y **sortea Equipo A / Equipo B**.
- Se persiste `revuelta_lineup` (JSON) con la formación final.
- Enlace público compartible: `/revuelta/[opportunityId]`.

### 3. Revuelta privada (variante de `open`)

- Anclada a un **equipo** (`private_revuelta_team_id`).
- Solo miembros del equipo entran directo; **externos solicitan ingreso** y el organizador acepta/rechaza (`revuelta_external_join_requests`).

### 4. Rival vs rival (`rival`)

- Encuentro entre **dos equipos** registrados en SportMatch.
- Modos:
  - **Directo:** desafías a un equipo concreto (capitán retador vs capitán retado).
  - **Abierto:** tu equipo “busca rival” y otro equipo acepta el desafío.
- Plantilla interactiva: formación **1-2-2-1** + suplentes por bando; cada jugador ocupa un **cupo** (`lineup_slot`) de su equipo (A = local, B = visita).
- Cierre con resultado, votación de capitanes y posible disputa → moderación.
- Solo miembros de los equipos del desafío pueden inscribirse en cupos.

### 5. Selección de equipos 6vs6 (`team_pick_public` / `team_pick_private`)

- **12 jugadores** (6 por bando), colores A/B personalizables.
- Jugadores eligen **bando y rol** (arquero, defensa, mediocampista, delantero).
- **Público:** cualquiera puede unirse por enlace.
- **Privado:** código de 4 dígitos (`join_code`) para entrar.
- Organizador puede **ajustar alineación** y **expulsar con motivo** en ventana previa (~2 h antes del partido).

### Reserva solo cancha (`reserve`)

- Desde **Crear**, opción aparte de los tipos anteriores.
- Reservas cancha en un centro **sin** publicar partido.
- Aparece en **Partidos > Próximos** como reserva propia; al terminar la franja puedes **reseñar el centro**.

---

## Flujo típico: crear un partido

1. Ir a **Crear** y elegir tipo.
2. Definir título, fecha/hora, nivel, género, descripción.
3. Elegir **centro deportivo** (opcional) o texto libre de ubicación/cancha.
4. Si hay centro: seleccionar cancha, franja horaria y crear **reserva vinculada**.
5. Publicar → aparece en listados (Inicio, Explorar según reglas) y en **Partidos > Próximos**.
6. Compartir enlace o invitar jugadores desde el detalle.
7. Coordinar por **chat del partido** y WhatsApp con el centro si aplica.
8. Jugar → **finalizar** → **reseñar** (participantes) → stats aplicadas al perfil.

**Lineamientos al crear** (mostrados en UI): respeto, cero violencia, compromiso de asistencia, nivel honesto, responsabilidad de pagos de cancha, reglas del recinto.

---

## Flujo típico: unirse a un partido

1. Ver partido en **Inicio**, enlace compartido o invitación.
2. Pulsar unirse (según tipo: diálogo de rol, cupo en plantilla rival, código team pick, etc.).
3. RPC `join_match_opportunity` (o variantes) valida cupos, estado y reglas.
4. Quedas como participante (`match_opportunity_participants`) con status `confirmed` o `pending`.
5. Accedes al **chat** y al **detalle** con info de cancha, reserva y compañeros.
6. Si no puedes ir: **salir con motivo** dentro de las ventanas permitidas (p. ej. ~2 h antes en partidos casuales).

---

## Pantalla Partidos (hub personal)

Cuatro pestañas (`MatchesHubTab`):

| Pestaña | Contenido |
|---------|-----------|
| **Próximos** | Partidos/reservas futuros donde participas u organizas. |
| **Invitaciones** | Cupos donde te invitaron (`status = invited`). |
| **Chats** | Partidos con mensajes recientes; acceso rápido al chat. |
| **Finalizados** | Historial; pendientes de reseña destacados. |

Incluye reservas **solo cancha** del jugador y bloques para confirmar pago/contacto con el centro vía WhatsApp.

---

## Chat del partido

- Un hilo por oportunidad (`messages` en BD).
- Acceso: organizador y participantes autorizados (RLS).
- **Tiempo real** vía Supabase Realtime.
- Desde el chat: compartir enlace de invitación, ver panel de equipos (revuelta), acciones de reclutamiento.
- Notificación `chat_message` cuando llega mensaje nuevo (campanita + push opcional).

---

## Reservas de cancha (perspectiva jugador)

### Al crear partido con centro

1. Eliges centro, cancha y horario según disponibilidad (`venue_weekly_hours`, reservas existentes).
2. Se crea `venue_reservation` en estado **pendiente**, **sin pagar**.
3. El **centro deportivo** ve la reserva en tiempo real y te contacta por WhatsApp para abono/pago.
4. Cuando pagan, el centro marca **Confirmar (pagado)** → reserva **confirmada**.
5. En el detalle del partido todos ven si la cancha está confirmada.

### Reserva solo cancha

- Sin partido asociado; útil cuando solo quieres jugar con tu grupo privado.
- Tras la franja, puedes dejar **reseña del centro** (`sports_venue_reviews`).

### Confirmación desde el jugador

- El organizador puede usar mensaje WhatsApp prefabricado hacia el centro.
- En algunos flujos puede autoconfirmar según reglas (`confirmation_source = booker_self`).

**Importante:** SportMatch **no cobra automáticamente**. El pago es **fuera de la app** (transferencia, efectivo, etc.) y el centro confirma manualmente.

---

## Explorar centros deportivos

- Listado de centros en tu región con búsqueda y filtro por comuna.
- Grilla de **disponibilidad** (hoy, 3, 7 o 14 días).
- Enlace a ficha pública `/centro/[venueId]`: nombre, dirección, canchas, horarios, reseñas.
- Desde ahí: iniciar reserva o crear partido con centro preseleccionado.

---

## Equipos

### Qué puedes hacer

| Acción | Descripción |
|--------|-------------|
| **Crear equipo** | Nombre, logo, nivel, ciudad, género, descripción. Eres capitán. |
| **Invitar jugadores** | Invitaciones a perfiles de la app. |
| **Solicitar unirme** | A equipos descubiertos en tu región. |
| **Gestionar plantilla** | Capitán/vice: aceptar solicitudes, expulsar, asignar vice. |
| **Configuración privada** | Link WhatsApp del grupo, reglas internas. |
| **Desafiar rival** | Como capitán/vice, lanzar desafío → flujo partido `rival`. |
| **Responder desafíos** | Aceptar/rechazar retos a tus equipos. |

### Estadísticas de equipo

- Victorias, empates, derrotas, rachas.
- Ficha pública compartible: `/equipo/[teamId]`.

### Límites

- Tope de plantilla por equipo (`TEAM_ROSTER_MAX`).
- Solo **capitán o vicecapitán** puede desafiar a otro equipo.

---

## Perfil del jugador

### Datos visibles (propio perfil)

- Foto, nombre, edad (desde `birth_date`), ciudad, posición, nivel.
- Días de disponibilidad, bio opcional.
- WhatsApp (solo tú; **nunca** en perfil público).
- Estadísticas acumuladas.
- Estado de moderación (tarjetas, suspensiones).

### Estadísticas (`profiles`)

| Stat | Significado |
|------|-------------|
| `stats_player_wins/draws/losses` | Resultados como jugador en partidos cerrados. |
| `stats_organized_completed` | Partidos que organizaste y se jugaron. |
| `stats_organizer_wins` | Victorias de tu bando/equipo como organizador. |
| `stats_mvp_wins` | Veces elegido MVP en reseñas (más votos por partido). |

### Nivel de organizador

- Progresión/tiers según partidos organizados completados (`getOrganizerTierProgress`).
- Visible en perfil como reconocimiento a quien arma pichangas de forma recurrente.

### Perfil público

- Otros jugadores ven: nombre, foto, ciudad, nivel, posición, disponibilidad, stats, tarjetas de moderación (sin contacto privado).
- RPC `fetch_public_player_profile`.
- Desde perfil ajeno: **reportar conducta** (`player_reports`).

### Ajustes en perfil

- Editar datos (vuelve a onboarding en modo edición).
- Tema claro/oscuro.
- **Notificaciones push** web (activar/desactivar).
- Enviar feedback a la app (`app_user_feedback`).
- Cerrar sesión.

---

## Reseñas (post-partido)

Existen **dos sistemas**; el jugador los usa en contextos distintos:

| Sistema | Cuándo | Tabla |
|---------|--------|-------|
| **Reseña de partido** | Partido **finalizado** (`status = completed`) | `match_opportunity_ratings` |
| **Reseña de centro** | Reserva **solo cancha**, franja ya pasada | `sports_venue_reviews` |

### Reseña de partido (formato actual, junio 2026)

Formulario único con **4 campos obligatorios** + comentario opcional:

1. **Recinto deportivo** → `venue_rating` (1–5)
2. **Ambiente del partido** → `match_rating` (1–5)
3. **Nivel del partido** → `level_rating` (1–5)
4. **MVP del partido** → `mvp_user_id` (otro participante; **no auto-voto**)
5. **Comentario** → opcional, máx. 2000 caracteres

**Reglas:**

- Solo organizador o participante **confirmado**.
- **Ventana de 24 horas:** desde `finalized_at` tienes 24 h para reseñar; después se cierra el plazo.
- **Una reseña por usuario y partido**; no se puede editar después.
- MVP: gana quien tenga más votos; si hay **empate**, **cada empatado suma +1** a `stats_mvp_wins` (sin desempate).
- Tras finalizar el partido, **chat y reseñas** comparten la misma ventana de **24 horas**.

Notificación `match_finished_review_pending` te recuerda reseñar.

---

## Notificaciones

### Centro in-app (campanita en Inicio)

Tipos iniciales:

| Tipo | Cuándo | Te lleva a |
|------|--------|------------|
| `chat_message` | Mensaje nuevo en chat de partido | Partidos > Chats |
| `match_invitation` | Organizador te invita a un cupo | Partidos > Invitaciones |
| `match_upcoming_2h` | Faltan ~2 h para tu partido | Partidos > Próximos |
| `match_finished_review_pending` | Partido cerrado sin tu reseña | Partidos > Finalizados |

- Historial: hasta **30** notificaciones, **10 visibles** en el modal.
- Acción: marcar todas como leídas.

### Push web

- Opcional desde perfil (`push_subscriptions`).
- Mismos eventos críticos si el navegador lo permite.

### Invitaciones proactivas

- El **organizador** ve cupos libres en detalle del partido y puede **invitar** jugadores filtrados por ciudad del partido.
- El invitado recibe notificación in-app (+ push si activo).

---

## Cierre de partido y resultados

### Partidos casuales (revuelta, faltan jugadores, team pick)

- Organizador marca partido como **jugado** o **suspendido** (con motivo).
- Resultado revuelta: Equipo A / B / empate.
- Stats aplicadas una sola vez (`match_stats_applied_at`).

### Partidos rival

- Propuesta de resultado por organizador o capitanes.
- Capitán rival **confirma** o **discrepa** → moderación si hay conflicto.
- Votaciones registradas en BD (`rival_captain_vote_*`, `rival_outcome_disputed`).

### Suspensión

- Si no se juega: motivo obligatorio, partido cancelado/suspendido visible para participantes.

---

## Moderación y conducta

### Reportes

- Puedes **reportar** a otro jugador desde su perfil público.
- Tabla `player_reports`: motivo, contexto, revisión por admin.

### Sanciones

- **Tarjetas amarillas/rojas** acumulables en `profiles`.
- **Suspensión temporal** (`mod_suspended_until`) o **ban** (`mod_banned_at`).
- Alertas en tu perfil ~24 h tras tarjeta reciente.
- Usuario suspendido/baneado tiene limitaciones de uso según reglas de la app.

### Buenas prácticas (términos de uso)

- Veracidad del perfil, respeto, cero violencia, no acoso.
- No bots, cuentas falsas ni contenido ilegal.
- Responsabilidad por tu conducta en cancha y en chat.

---

## Tiempo real y experiencia fluida

- **Supabase Realtime** actualiza participantes, mensajes y listados sin recargar.
- El bundle de partidos del jugador (`matchOpportunities`, `participatingOpportunityIds`, `rivalChallenges`) se sincroniza entre Context y caché TanStack Query.
- Avatares y logos con cache-bust al actualizar foto.

---

## Rutas públicas útiles para el jugador

| URL | Uso |
|-----|-----|
| `/` | App principal (requiere login para acciones). |
| `/revuelta/[id]` | Ver/unirse a revuelta compartida. |
| `/centro/[id]` | Ficha del centro, reservar. |
| `/equipo/[id]` | Ficha del equipo. |
| `/rancagua/*` | Landings SEO locales (futbolito, rivales, revueltas…). |
| `/terminos`, `/privacidad` | Legal. |

---

## Comparación rápida: jugador vs centro vs admin

| | Jugador | Centro deportivo | Admin |
|--|---------|------------------|-------|
| **Objetivo** | Jugar, armar partidos, equipos | Operar recinto y reservas | Gestionar plataforma |
| **Registro** | Público (email/Google) | Solo vía admin | Solo vía admin |
| **Pantalla principal** | Home, partidos, crear… | Dashboard del centro | Panel admin |
| **Partidos/equipos** | Sí, completo | No (solo reservas vinculadas) | Supervisión global |
| **Reservas** | Solicita / confirma como organizador | Recibe, confirma, cancela | Puede intervenir |
| **Reseñas** | Escribe (partido y centro) | Recibe en ficha pública | Modera reportes |
| **BI de negocio** | No | Sí | Métricas de red |
| **Barra inferior app** | Sí | No | No |

---

## Qué NO incluye hoy (limitaciones para el jugador)

Para tener la foto completa:

- **No hay cobro in-app** de canchas (Stripe, Mercado Pago, etc.): pagas por tu canal acordado con el centro.
- **No hay árbitro ni VAR**: resultados dependen de acuerdo entre capitanes/organizador.
- **No hay matchmaking automático** tipo Tinder de jugadores; descubres partidos en feed/filtros o invitaciones.
- **Push móvil nativo** depende de la app móvil (Expo/RN) y permisos del dispositivo; en web es push del navegador.
- **Edición de reseñas** no permitida tras enviar.
- **Límite de equipos** por jugador según reglas de plantilla.
- SportMatch **no garantiza** que la cancha esté disponible hasta que el centro confirme la reserva pagada.

---

## Contexto geográfico y legal

- **Chile:** WhatsApp `+569`, fechas en `America/Santiago`, catálogo de regiones/comunas.
- **Edad mínima** y capacidad legal según términos chilenos.
- **Privacidad:** Supabase, Google OAuth si aplica; WhatsApp no se expone en perfiles públicos.
- **Dominio oficial:** [https://www.sportmatch.cl](https://www.sportmatch.cl)

---

## Glosario rápido

| Término | Significado |
|---------|-------------|
| **Pichanga / partido amateur** | Encuentro informal de fútbol. |
| **Oportunidad** | Publicación en `match_opportunities` (partido o evento). |
| **Revuelta** | Partido donde desconocidos se mezclan y se sortean equipos. |
| **Team pick** | Selección manual o semi-manual de bandos 6vs6 con roles. |
| **Rival** | Duelo entre dos equipos registrados. |
| **Organizador** | Creador del partido (`creator_id`); coordina cancha y cierre. |
| **MVP** | Mejor jugador votado en reseñas del partido. |
| **Centro / venue** | Recinto deportivo con canchas reservables. |

---

## En una frase

El **usuario jugador** es el corazón de SportMatch: **encuentra o publica pichangas, forma equipos, reserva cancha, coordina por chat, juega y deja huella** con estadísticas, MVPs y reseñas — todo en una sola app pensada para el fútbol amateur chileno, con menos caos que WhatsApp y más confianza que un grupo suelto.

---

## Documentos relacionados en el repo

| Archivo | Contenido |
|---------|-----------|
| `DOCUMENTACION-PROYECTO-COMPLETA.md` | Visión general producto + técnica |
| `DOCUMENTACION-INTEGRAL-PROYECTO.md` | Stack, flujos, BD, RPC |
| `DOCUMENTACION-RESEÑAS-SISTEMA-COMPLETO.md` | Detalle reseñas partido y centro |
| `documentacion-plantillarival.md` | Partidos rival y plantilla en cancha |
| `RESUMEN-USUARIO-CENTRO-DEPORTIVO.md` | Rol centro deportivo (contraste) |
| `terminos-de-uso.md` / `politicas-de-privacidad.md` | Legal |
