/** Fecha local YYYY-MM-DD → Date mediodía (evita desfases TZ). */
export function parseBirthDateLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

export function computeAgeFromBirthDate(birth: Date): number {
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return Math.max(0, age)
}

export function isBirthdayToday(birth: Date, now = new Date()): boolean {
  return birth.getMonth() === now.getMonth() && birth.getDate() === now.getDate()
}

/** Límite inferior de birth_date (persona de 60 años cumplidos hoy). */
export function minBirthDateForPlayers(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 60)
  return formatDateInput(d)
}

/** Límite superior (persona que hoy cumple 17). */
export function maxBirthDateForPlayers(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 17)
  return formatDateInput(d)
}

export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateInput(d: Date): string {
  return toIsoDateLocal(d)
}

export function isValidPlayerAgeFromBirthDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false
  const birth = parseBirthDateLocal(isoDate)
  const age = computeAgeFromBirthDate(birth)
  return age >= 17 && age <= 60
}
