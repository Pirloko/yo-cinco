# Plan de implementacion: Notificaciones + Reclutamiento guiado

## Bloque 1 - Objetivo y alcance

Implementar un centro de notificaciones desde la campanita y el flujo de invitacion proactiva del organizador en `Detalle del partido > Participantes`, manteniendo UX limpia y sin romper flujos existentes.

Incluye:

- Modal desplegable al tocar la campanita.
- Notificaciones con redireccion inteligente por tipo (deep links a pestanas de `Partidos`).
- Recordatorio de proximos partidos cuando falten 2 horas.
- Notificacion de partido finalizado pendiente de resena.
- Invitaciones proactivas del organizador para cupos libres.
- Push al smartphone cuando el usuario tenga notificaciones activadas.

No incluye en esta etapa:

- Sistema de preferencias avanzadas por tipo de notificacion.
- Centro historico infinito.

## Bloque 2 - Reglas de producto (confirmadas)

- Historial por usuario: **30 guardadas** maximo.
- Modal de campanita: **10 visibles** (mas recientes).
- Retencion temporal: **30 dias**.
- Accion global: **Marcar todas como leidas**.
- Priorizacion en UI: no leidas primero, luego leidas.

Tipos de notificacion iniciales:

1. `chat_message`
2. `match_invitation`
3. `match_upcoming_2h`
4. `match_finished_review_pending`

## Bloque 3 - Arquitectura funcional

### 3.1 Campanita (centro de notificaciones)

- Reemplazar accion actual (ir directo a `Partidos`) por apertura de modal desplegable.
- Cada item del modal contiene:
  - titulo
  - descripcion breve
  - fecha relativa
  - estado leida/no leida
  - payload de navegacion
- Click en item:
  - marca como leida
  - cierra modal
  - navega a `Partidos` con subpestana correcta.

### 3.2 Deep links internos por tipo

- `chat_message` -> `Partidos > Chats`
- `match_invitation` -> `Partidos > Invitaciones`
- `match_finished_review_pending` -> `Partidos > Finalizados` (foco al partido)
- `match_upcoming_2h` -> `Partidos > Proximos` (foco al partido)

### 3.3 Reclutamiento guiado por organizador

En `Detalle del partido > Participantes`:

- Si hay cupos libres, renderizar filas de "Cupo disponible".
- Si usuario es organizador, mostrar boton `Invitar` en cada cupo.
- Al tocar `Invitar`:
  - abrir selector de jugadores filtrados por ciudad del partido
  - permitir abrir perfil del jugador antes de invitar
  - confirmar invitacion
- Al confirmar:
  - guardar invitacion en BD
  - notificacion in-app para invitado
  - push al smartphone (si habilitado)

## Bloque 4 - Modelo de datos (Supabase)

Crear tabla `notifications` (o equivalente) con:

- `id` (uuid)
- `user_id` (destinatario)
- `type` (`chat_message`, `match_invitation`, `match_upcoming_2h`, `match_finished_review_pending`)
- `title`
- `body`
- `payload` (jsonb con `targetTab`, `matchId`, `chatId`, etc.)
- `is_read` (boolean, default false)
- `created_at`
- `read_at` (nullable)

Indices recomendados:

- `(user_id, created_at desc)`
- `(user_id, is_read, created_at desc)`

Politicas RLS:

- usuario autenticado solo puede `select/update` sus notificaciones.
- inserts realizados por backend seguro (service role o RPC con seguridad controlada).

Tabla para invitaciones (si no existe):

- `match_invitations` con `match_id`, `inviter_user_id`, `invited_user_id`, `status`, timestamps.
- restriccion unica para evitar duplicados activos por `match_id + invited_user_id`.

## Bloque 5 - Backend y eventos

### 5.1 Endpoints / RPC

- `GET /api/notifications?limit=10`
- `POST /api/notifications/mark-read` (una)
- `POST /api/notifications/mark-all-read`
- `POST /api/matches/invite-player` (organizador)

### 5.2 Generacion de notificaciones

- `chat_message`: al crear mensaje nuevo para participantes relevantes.
- `match_invitation`: al invitar jugador.
- `match_finished_review_pending`: al finalizar partido, para participantes sin resena.
- `match_upcoming_2h`: job programado que detecta partidos en ventana de 2 horas.

### 5.3 Programador 2h antes

Usar cron server-side (Vercel Cron o equivalente):

- corre cada X minutos (ej. 10 min)
- detecta partidos que inician entre `now + 1h50` y `now + 2h10`
- evita duplicados con control idempotente por `match_id + user_id + type`

## Bloque 6 - Push notifications (smartphone)

Reusar infraestructura web push ya implementada:

- Al crear notificacion relevante, opcionalmente disparar push con:
  - `title`, `body`, `openPath`
- `openPath` debe enrutar al contexto correcto:
  - chat/invitacion/proximos/finalizados
- Si push falla, la notificacion in-app permanece (no bloquear flujo principal).

## Bloque 7 - UX/UI detallada

### 7.1 Modal campanita

- Cabecera: "Notificaciones" + contador no leidas.
- Lista (max 10).
- CTA secundario: `Marcar todas como leidas`.
- Estado vacio: mensaje amigable y sin ruido visual.

### 7.2 Item de notificacion

- Icono por tipo.
- Titulo corto + detalle.
- Timestamp relativo.
- Indicador visual de no leida.

### 7.3 Participantes con cupos libres

- Mostrar "Cupo disponible" como fila uniforme.
- Boton `Invitar` solo para organizador.
- En selector de jugadores:
  - filtro por ciudad del partido
  - busqueda por nombre
  - acceso a perfil antes de confirmar invitacion

## Bloque 8 - Antispam y reglas de seguridad

- Evitar notificaciones duplicadas por misma causa en ventana corta.
- Limitar frecuencia de invitaciones por organizador (throttle basico).
- Verificar permisos estrictos:
  - solo organizador/admin puede invitar en ese partido
  - no invitar usuarios bloqueados/no elegibles
- Sanitizar payloads para no exponer datos sensibles.

## Bloque 9 - Limpieza automatica (retencion)

Job diario:

- borrar notificaciones con `created_at < now - 30 dias`
- mantener maximo 30 por usuario:
  - conservar las mas recientes
  - eliminar excedentes antiguas

## Bloque 10 - Estrategia de implementacion sin romper

Orden recomendado:

1. Migraciones BD (tablas, indices, RLS, constraints).
2. Capa API/RPC de notificaciones e invitaciones.
3. Modal campanita con lectura/listado real.
4. Deep links a pestanas `Partidos` (incluyendo nueva pestana `Invitaciones`).
5. Flujo de `Invitar` en `Detalle del partido`.
6. Disparo de notificacion in-app por invitacion.
7. Integracion push.
8. Cron de recordatorio 2h y finalizado sin resena.
9. QA completo y ajustes visuales.

## Bloque 11 - Plan de pruebas (QA)

Casos minimos:

- Campanita abre modal, lista 10, marca individual y masiva.
- Deep link correcto para cada tipo.
- Invitacion desde cupo libre:
  - aparece al organizador
  - invitado la ve en `Invitaciones`
  - recibe push si esta habilitado
- Notificacion 2h:
  - se genera una sola vez por partido/usuario
- Finalizado sin resena:
  - notifica solo a quien no califico
- Retencion:
  - no supera 30 por usuario
  - limpia >30 dias

## Bloque 12 - Riesgos y mitigaciones

- Riesgo: duplicados por cron o reintentos.
  - Mitigacion: claves idempotentes y constraints unicos.
- Riesgo: sobrecarga visual del modal.
  - Mitigacion: 10 visibles, copy corto, jerarquia clara.
- Riesgo: romper navegacion actual de campanita.
  - Mitigacion: feature flag y pruebas por etapas.

## Bloque 13 - Definition of Done

Se considera completo cuando:

- Campanita opera como centro de notificaciones (10 visibles).
- Se guardan maximo 30 por usuario con retencion de 30 dias.
- Existe `Marcar todas como leidas`.
- Deep link por tipo funciona de extremo a extremo.
- Reclutamiento guiado por organizador funcionando en cupos libres.
- Invitaciones visibles al jugador en su flujo y con push activo.
- Build/lints/tests principales en verde.
