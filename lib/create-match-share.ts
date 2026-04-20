import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { MatchType } from '@/lib/types'

export function formatCreateMatchWhenLine(dateStr: string, timeStr: string): string {
  const d = new Date(`${dateStr}T${timeStr}`)
  if (Number.isNaN(d.getTime())) return `${dateStr} ${timeStr}`
  try {
    return format(d, "EEEE d MMMM · HH:mm 'h'", { locale: es })
  } catch {
    return `${dateStr} ${timeStr}`
  }
}

/**
 * Texto listo para WhatsApp / copiar / Web Share tras publicar un partido.
 * En `team_pick_private` incluye siempre el código de unión.
 */
export function buildCreateMatchSuccessShareText(args: {
  title: string
  venue: string
  location: string
  whenLine: string
  /** Enlace público al detalle/revuelta (si existe). */
  publicPageUrl: string | null
  matchType: MatchType | 'reserve' | null
  /** Solo selección de equipos privado: código de 4 dígitos. */
  joinCode: string | null
}): string {
  const t = args.title.trim() || 'Partido'
  const lines: string[] = []
  lines.push(`¡Únete a «${t}» en SPORTMATCH!`)
  const place = [args.venue.trim(), args.location.trim()].filter(Boolean).join(' · ')
  if (place) lines.push(`📍 ${place}`)
  if (args.whenLine.trim()) lines.push(`🗓 ${args.whenLine}`)
  if (args.matchType === 'team_pick_private' && args.joinCode?.trim()) {
    lines.push(`🔑 Código para unirse en la app: ${args.joinCode.trim()}`)
  }
  if (args.publicPageUrl?.trim()) {
    lines.push(args.publicPageUrl.trim())
  }
  return lines.join('\n')
}
