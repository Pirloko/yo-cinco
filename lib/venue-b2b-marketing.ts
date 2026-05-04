/**
 * Bloque 1 — Marketing B2B (centros deportivos): copy y contacto.
 * Las rutas y UI usan estas constantes + helpers para mailto / WhatsApp.
 */

/** Pregunta + promesa (una sola idea; encaja como titular de sección o hero B2B). */
export const VENUE_B2B_MAIN_COPY =
  '¿Gestionas un centro deportivo? Administra reservas, horarios y métricas en un solo lugar.'

/** Misma frase en dos líneas (hero o card con jerarquía visual). */
export const VENUE_B2B_MAIN_COPY_LINES = {
  lead: '¿Gestionas un centro deportivo?',
  support: 'Administra reservas, horarios y métricas en un solo lugar.',
} as const

/** Meta description / Open Graph para /para-centros (snippet en buscadores). */
export const VENUE_B2B_SEO_DESCRIPTION =
  'Sportmatch para centros deportivos en Chile: ficha pública, reservas por cancha y franja, horarios y panel con métricas. Solicita información por WhatsApp.'

/** Palabras clave auxiliares para metadatos (navegadores / algunos crawlers). */
export const VENUE_B2B_SEO_KEYWORDS = [
  'centro deportivo',
  'cancha de fútbol',
  'reservas de cancha',
  'gestión de sede',
  'Sportmatch',
  'Chile',
  'fútbol amateur',
] as const

/** CTA desde la landing jugador hacia la página dedicada (Bloque 3). */
export const VENUE_B2B_LANDING_CTA_LABEL = 'Propuesta para centros'

/** Texto corto en el header de la landing (no compite con “Iniciar sesión” en móvil). */
export const VENUE_B2B_HEADER_LINK_LABEL = 'Centros'

/** CTA secundario / acceso directo a conversación (cuando haya WhatsApp configurado). */
export const VENUE_B2B_WHATSAPP_CTA_LABEL = 'WhatsApp'

/** Botón principal de contacto en la página B2B (más explícito que el label corto). */
export const VENUE_B2B_WHATSAPP_PRIMARY_LABEL = 'Hablar por WhatsApp'

/** Mensaje prefijado al abrir WhatsApp desde /para-centros. */
export const VENUE_B2B_WHATSAPP_PREFILL_MESSAGE =
  'Hola, represento un centro deportivo y quiero información para publicar nuestras canchas en Sportmatch.'

/** Asunto sugerido para el primer contacto por correo. */
export const VENUE_B2B_MAILTO_DEFAULT_SUBJECT = 'Consulta Sportmatch — centro deportivo'

// --- Bloque 4: contenido página /para-centros ---

export const VENUE_B2B_PAGE_HERO_INTRO =
  'Sportmatch conecta jugadores y organizadores con tu sede: ficha pública, reservas con franjas claras y un panel para ver cómo se mueve tu operación.'

export const VENUE_B2B_AUDIENCE_SECTION = {
  title: '¿Para quién es?',
  intro:
    'Pensado para quienes viven de llenar canchas y ordenar el día a día — sin depender solo de mensajes sueltos.',
  bullets: [
    'Dueños y administradores de centros deportivos o complejos multi-cancha.',
    'Gestores que necesitan horarios, precios por hora y reservas con estado (pendiente, confirmada, cancelada).',
    'Sedes que quieren aparecer donde ya se están armando partidos y revueltas.',
  ],
} as const

export const VENUE_B2B_BENEFITS = [
  {
    title: 'Visibilidad donde ya se busca partido',
    description:
      'Tu centro en la red Sportmatch: jugadores y organizadores descubren tu sede cuando crean o buscan encuentros.',
  },
  {
    title: 'Reservas alineadas a la cancha',
    description:
      'Franjas por cancha, duración configurable y reservas vinculadas a partidos cuando corresponde — menos malentendidos.',
  },
  {
    title: 'Horarios y precios en un solo lugar',
    description:
      'Define apertura por día, canchas y precio por hora; el jugador ve la información al reservar.',
  },
  {
    title: 'Panel y métricas para decidir mejor',
    description:
      'Seguimiento de reservas, cobros y señales de ocupación para apoyar tu operación (según plan / región).',
  },
  {
    title: 'Confianza y reputación',
    description:
      'Reseñas y contexto de uso ayudan a que nuevos equipos elijan tu sede con más seguridad.',
  },
  {
    title: 'Menos fricción operativa',
    description:
      'Centraliza lo que hoy se reparte en llamadas y chats: un flujo único para tu equipo y tus clientes.',
  },
] as const

/** Aclaración legal/comercial junto a KPIs de ejemplo. */
export const VENUE_B2B_KPI_DISCLAIMER =
  'Cifras de demostración: ilustran el tipo de indicadores que puedes revisar en el panel. No son resultados reales ni garantías para tu sede.'

export const VENUE_B2B_KPI_EXAMPLES = [
  {
    label: 'Horas reservadas',
    value: '128 h',
    caption: 'ej. ventana de un mes',
  },
  {
    label: 'Ingresos cobrados',
    value: '$2,4M',
    caption: 'ej. CLP período',
  },
  {
    label: 'Ocupación',
    value: '72%',
    caption: 'ej. sobre franjas disponibles',
  },
  {
    label: 'Reservas confirmadas',
    value: '94',
    caption: 'ej. conteo en el período',
  },
] as const

export const VENUE_B2B_MEMBERSHIP_SECTION = {
  title: 'Cómo empezar con Sportmatch',
  intro:
    'Te acompañamos en el alta para que publiques tu sede con buena información desde el primer día.',
} as const

export const VENUE_B2B_MEMBERSHIP_STEPS = [
  {
    title: 'Escríbenos',
    body: 'Por WhatsApp: nombre del centro, comuna y cuántas canchas quieres publicar.',
  },
  {
    title: 'Onboarding',
    body: 'Te explicamos el panel, datos mínimos y cómo cargar horarios, precios y canchas.',
  },
  {
    title: 'Publicación y reservas',
    body: 'Tu ficha queda visible; los jugadores pueden reservar según las reglas que definas.',
  },
] as const

export const VENUE_B2B_FINAL_CTA_TITLE = '¿Quieres ver tu sede en Sportmatch?'
export const VENUE_B2B_FINAL_CTA_SUB =
  'Conversemos sin compromiso: te respondemos con próximos pasos y condiciones según tu región.'

function trimEnv(value: string | undefined): string | undefined {
  const t = value?.trim()
  return t || undefined
}

/** Email público de contacto B2B (solo cliente; puede ser hola@sportmatch.cl). */
export function getVenueB2bContactEmail(): string | undefined {
  return trimEnv(process.env.NEXT_PUBLIC_VENUE_B2B_CONTACT_EMAIL)
}

/**
 * Número solo dígitos, con código país, sin + ni espacios (ej. Chile: 56912345678).
 * Se usa con https://wa.me/&lt;digits&gt;
 */
export function getVenueB2bWhatsAppDigits(): string | undefined {
  const raw = trimEnv(process.env.NEXT_PUBLIC_VENUE_B2B_WHATSAPP)
  if (!raw) return undefined
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 10 ? digits : undefined
}

export function buildVenueB2bMailtoHref(options?: {
  subject?: string
  body?: string
}): string | null {
  const email = getVenueB2bContactEmail()
  if (!email) return null
  const params = new URLSearchParams()
  if (options?.subject) params.set('subject', options.subject)
  if (options?.body) params.set('body', options.body)
  const q = params.toString()
  return q ? `mailto:${email}?${q}` : `mailto:${email}`
}

export function buildVenueB2bWhatsAppHref(prefillMessage?: string): string | null {
  const digits = getVenueB2bWhatsAppDigits()
  if (!digits) return null
  const base = `https://wa.me/${digits}`
  if (!prefillMessage?.trim()) return base
  return `${base}?text=${encodeURIComponent(prefillMessage.trim())}`
}
