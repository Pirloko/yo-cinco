/** Prefill rápido "Crear partido" desde perfil de centro (`/centro/[id]`). */
export const CREATE_PREFILL_STORAGE_KEY = 'pichanga_create_prefill'

/** Tras `/?prefillCreate=1`: abrir pantalla Crear cuando el jugador ya puede usar la app. */
export const OPEN_CREATE_AFTER_AUTH_KEY = 'pichanga_open_create_after_auth'

/** Llamar al montar la app si la URL trae `prefillCreate=1` (el prefill ya debe estar en sessionStorage). */
export function capturePrefillCreateQuery() {
  if (typeof window === 'undefined') return
  try {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('prefillCreate') === '1') {
      sessionStorage.setItem(OPEN_CREATE_AFTER_AUTH_KEY, '1')
      const path = window.location.pathname || '/'
      window.history.replaceState({}, '', path)
    }
  } catch {
    // ignore
  }
}

/** Si venimos de un centro con prefill listo, indicar que hay que ir a Crear (no borra el prefill). */
export function tryNavigateCreateAfterPlayerReady(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (sessionStorage.getItem(OPEN_CREATE_AFTER_AUTH_KEY) !== '1') return false
    if (!readCreatePrefill()) return false
    sessionStorage.removeItem(OPEN_CREATE_AFTER_AUTH_KEY)
    return true
  } catch {
    return false
  }
}

export type CreatePrefillPayload = {
  sportsVenueId: string
  venueLabel: string
  city: string
  date: string
  time: string
  /** Si true, al publicar se intenta `book_venue_slot`. */
  bookCourtSlot: boolean
}

export function writeCreatePrefill(payload: CreatePrefillPayload) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CREATE_PREFILL_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

export function readCreatePrefill(): CreatePrefillPayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CREATE_PREFILL_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as CreatePrefillPayload
    if (!o.sportsVenueId || !o.date || !o.time) return null
    return o
  } catch {
    return null
  }
}

export function clearCreatePrefill() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(CREATE_PREFILL_STORAGE_KEY)
  } catch {
    // ignore
  }
}
