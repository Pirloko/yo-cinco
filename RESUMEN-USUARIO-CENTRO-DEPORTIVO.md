# Usuario Centro Deportivo en SportMatch — resumen completo

## ¿Qué es?

Es un **tipo de cuenta especial** (`account_type = venue`) para **dueños o gestores de recintos deportivos** (clubes, canchas de fútbol, centros con varias pistas, etc.). No es un jugador: es quien **opera el negocio del recinto** dentro de la app.

Cada cuenta centro está ligada a **un centro deportivo** en la base de datos (`sports_venues`), con sus canchas, horarios, precios y reservas.

---

## ¿Para qué sirve?

SportMatch conecta **jugadores que buscan partido/cancha** con **centros que tienen disponibilidad**. El usuario centro deportivo es el **panel operativo del recinto**: recibe reservas, las confirma, organiza la agenda y ve cómo le va el negocio.

En la práctica sirve para:

1. **Publicar el centro** en la app (ficha pública en `/centro/[id]`).
2. **Recibir reservas** hechas por jugadores desde la app o crear reservas manuales (clientes por teléfono, walk-in, etc.).
3. **Gestionar la operación diaria**: canchas, horarios de apertura, precios por hora.
4. **Coordinar pagos/abonos** con el cliente (WhatsApp + confirmación en panel; no hay pasarela automática).
5. **Ver métricas** de ocupación, ingresos, cancelaciones, etc.
6. **Vincular reservas con partidos** cuando un jugador crea un partido y reserva cancha a la vez.

---

## ¿Cómo entra al sistema?

- **No puede registrarse solo como centro** desde la app pública (el registro normal siempre crea jugador).
- Lo habitual: un **administrador** crea la cuenta + el centro, o se **promueve** una cuenta existente y completa el onboarding.
- Tras login ve **solo su mundo**: onboarding (si falta el centro) o **dashboard del centro**. No ve partidos, equipos ni barra de navegación del jugador.

---

## ¿Qué puede hacer? (funcionalidades)

### Panel principal — 5 áreas

| Área | Qué hace |
|------|----------|
| **Resumen** | Métricas de negocio (ocupación, ingresos, ticket promedio, cancelaciones, alertas), gráficos, export CSV; además vista “en vivo” de cupos libres hoy e historial de reservas |
| **Reservas** | Ver reservas del día o próximas 45 días; confirmar, cancelar, contactar por WhatsApp, crear reservas manuales, copiar link de la ficha pública |
| **Perfil** | Editar nombre del centro, teléfono de contacto y contraseña |
| **Canchas** | Agregar/eliminar canchas, definir precio por hora (CLP) |
| **Horario** | Definir apertura/cierre por día de la semana (con atajos lun–vie, fin de semana, etc.) |

### Reservas — flujo típico

1. Un jugador reserva desde la app → la reserva llega como **pendiente** y **sin pagar**.
2. El centro ve la reserva al instante (**tiempo real** en el dashboard).
3. Contacta al organizador/reservante por **WhatsApp** (mensaje prefabricado pidiendo abono/pago).
4. Cuando cobró (transferencia, efectivo, link externo), pulsa **Confirmar (pagado)**.
5. La reserva queda **confirmada** y marcada como pagada.

También puede:

- **Cancelar** con motivo (si hay partido vinculado, puede cancelarse el partido).
- Crear **reservas manuales** para clientes que no usan la app.
- Ver si la reserva viene de un **partido** (título, organizador, WhatsApp del creador).

### Integración con partidos

Cuando un jugador publica un partido y reserva cancha en el mismo flujo:

- Se crea reserva + partido enlazados.
- El centro ve el partido en la reserva y contacta al **organizador**.
- Reprogramaciones y cancelaciones pueden afectar al partido según reglas del sistema.

### Página pública del centro

Cada centro tiene URL pública donde cualquiera ve:

- Nombre, ubicación, canchas, horarios.
- Disponibilidad del día.
- Reseñas de jugadores.

Desde ahí un jugador logueado puede iniciar reserva o crear partido con ese centro preseleccionado.

---

## Beneficios para el usuario centro deportivo

### Operativos

- **Un solo lugar** para agenda, canchas y precios (no depender solo de WhatsApp suelto).
- **Reservas en tiempo real** cuando entra alguien desde la app.
- **Reservas manuales** para clientes offline.
- **Mensajes WhatsApp listos** para cobrar/confirmar (un clic, abre conversación con texto ya escrito).
- **Control de confirmación**: tú decides cuándo marcar pagado y confirmado.
- **Horarios y precios centralizados**: cambias precio y se propaga a reservas futuras pendientes/confirmadas.

### Comerciales / visibilidad

- **Presencia en SportMatch**: jugadores de la zona te encuentran al buscar cancha o crear partido.
- **Ficha pública compartible** (link para redes, web, cartelería).
- **Reseñas** de jugadores en la ficha (credibilidad; las escriben ellos, tú las recibes en la vitrina pública).

### Analíticos (BI)

- **Ocupación** y uso de canchas.
- **Ingresos** en el periodo (hoy, 7 días, 30 días, rango custom).
- **Ticket promedio**, cancelaciones, clientes recurrentes, alertas.
- **Gráficos** de ingresos y desglose por cancha.
- **Export CSV** para llevar números a Excel/planillas.

### Seguridad y rol claro

- Cuenta **separada del jugador**: no mezclas tu operación con partidos personales.
- **Permisos en base de datos** (RLS): solo ves y gestionas **tu** centro, no el de otros.
- Puedes seguir operando aunque el admin **pause** la visibilidad pública (`is_paused`); tú mantienes acceso al panel.

### Coordinación con jugadores

- Ves **WhatsApp del organizador/reservante** si lo registró en la app.
- Reservas vinculadas a partidos muestran **contexto** (nombre del partido, hora, quién organiza).
- Los jugadores también pueden escribirte con un **mensaje tipo** al confirmar cancha desde su lado.

---

## Qué NO incluye (limitaciones importantes)

Para que tengas la foto completa:

- **No hay cobro automático** integrado (Stripe, Mercado Pago, etc.): el cobro es **fuera de la app** y tú confirmas manualmente.
- **No hay app de WhatsApp Business** integrada: solo enlaces que abren WhatsApp con texto.
- **No hay notificaciones push** dedicadas al dueño (dependes del dashboard abierto + Realtime, o revisar manualmente).
- **No puedes editar** dirección, maps, duración de tramo ni pausarte desde el panel (eso lo hace admin).
- **Un centro por cuenta** (no multi-sede en una sola cuenta hoy).
- **No ves ni respondes reseñas** desde el dashboard (solo en la ficha pública).
- **No te registras solo** como centro desde la landing de jugadores.

---

## Comparación rápida: centro vs jugador vs admin

| | Jugador | Centro deportivo | Admin |
|--|---------|------------------|-------|
| Objetivo | Jugar, armar partidos, equipos | Operar recinto y reservas | Gestionar plataforma |
| Pantalla principal | Home, partidos, crear… | Dashboard del centro | Panel admin |
| Reservas | Solicita / confirma como organizador | Recibe, confirma, cancela | Puede intervenir |
| BI de su negocio | No | Sí | Métricas de red |
| Barra inferior app | Sí | No | No |

---

## En una frase

El **usuario centro deportivo** es el **dueño operador del recinto en SportMatch**: recibe demanda de jugadores, administra canchas y agenda, cobra y confirma por su canal habitual (WhatsApp + transferencia), y mira métricas de cómo rinde su negocio — todo desde un panel pensado solo para centros, sin ruido de la experiencia jugador.
