/** Horarios en bloques de 1 hora (09:00–23:00). Valor = HH:00 en 24 h para combinar con la fecha. */

/**
 * Etiqueta tipo `09:00 am`, `12:00 pm`, `13:00 pm` (hora 24 h + am si h<12, pm si h≥12).
 */
export function formatHmAmPm(hours24: number, minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const suffix = hours24 < 12 ? 'am' : 'pm'
  return `${pad(hours24)}:${pad(minutes)} ${suffix}`
}

export const TIME_SLOT_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = []
  for (let h = 9; h <= 23; h++) {
    out.push({
      value: `${String(h).padStart(2, '0')}:00`,
      label: formatHmAmPm(h, 0),
    })
  }
  return out
})()
