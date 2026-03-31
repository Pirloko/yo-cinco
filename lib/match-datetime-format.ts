import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'

/**
 * Zona horaria para mostrar partidos/revueltas (coincide con lo que el usuario elige al crear).
 * En servidor (SSR) Node usa UTC por defecto; sin esto se veía hora UTC en enlaces públicos.
 */
export const APP_MATCH_TIMEZONE =
  process.env.NEXT_PUBLIC_APP_TIMEZONE ?? 'America/Santiago'

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d)
}

/** Fecha/hora del partido en la zona de la app (p. ej. Chile), no la del servidor ni del navegador. */
export function formatMatchInTimezone(
  date: Date | string | number,
  pattern: string
): string {
  return formatInTimeZone(toDate(date), APP_MATCH_TIMEZONE, pattern, {
    locale: es,
  })
}
