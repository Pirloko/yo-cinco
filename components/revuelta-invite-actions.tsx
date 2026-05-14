'use client'

import { toast } from 'sonner'
import type { MatchOpportunity } from '@/lib/types'
import {
  matchAppJoinAbsoluteUrl,
  matchHasPublicInvitePage,
  revueltaInviteAbsoluteUrl,
} from '@/lib/match-invite-url'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { Button } from '@/components/ui/button'
import { Share2 } from 'lucide-react'

type Props = {
  opportunity: MatchOpportunity
  className?: string
}

function buildMatchInviteShareBody(
  opportunity: MatchOpportunity,
  origin: string
): { title: string; body: string; appJoinUrl: string; publicPageUrl: string | null } {
  const t = opportunity.title.trim() || 'Partido'
  const when = formatMatchInTimezone(
    opportunity.dateTime,
    "EEEE d MMM yyyy · HH:mm 'h'"
  )
  const place = [opportunity.venue.trim(), opportunity.location.trim()]
    .filter(Boolean)
    .join(' · ')

  let title: string
  switch (opportunity.type) {
    case 'team_pick_public':
      title = `6vs6 «${t}» — SPORTMATCH`
      break
    case 'team_pick_private':
      title = `6vs6 privado «${t}» — SPORTMATCH`
      break
    case 'rival':
      title = `Duelo de equipos «${t}» — SPORTMATCH`
      break
    case 'players':
      title = `Búsqueda de jugadores «${t}» — SPORTMATCH`
      break
    default:
      title = `Revuelta «${t}» — SPORTMATCH`
  }

  const lines: string[] = []
  switch (opportunity.type) {
    case 'team_pick_public':
      lines.push(`¡Únete al 6vs6 «${t}» en SPORTMATCH!`)
      break
    case 'team_pick_private':
      lines.push(`¡Cupos en el 6vs6 privado «${t}» en SPORTMATCH!`)
      break
    case 'rival':
      lines.push(`¡Nos jugamos el duelo «${t}» en SPORTMATCH!`)
      break
    case 'players':
      lines.push(`¡Sumate a «${t}» (búsqueda de jugadores) en SPORTMATCH!`)
      break
    default:
      lines.push(`¡Únete a la revuelta «${t}» en SPORTMATCH!`)
  }
  if (place) lines.push(`📍 ${place}`)
  lines.push(`🗓 ${when}`)
  if (opportunity.type === 'team_pick_private' && opportunity.joinCode?.trim()) {
    lines.push(`🔑 Código en la app al unirse: ${opportunity.joinCode.trim()}`)
  }

  const appJoinUrl = matchAppJoinAbsoluteUrl(opportunity.id, origin)
  const publicPageUrl = matchHasPublicInvitePage(opportunity.type)
    ? revueltaInviteAbsoluteUrl(opportunity.id, origin)
    : null

  lines.push('')
  if (publicPageUrl) {
    lines.push(
      'Ficha pública del partido (detalle, cupos y desde ahí puedes entrar a la app para unirte):'
    )
    lines.push(publicPageUrl)
  } else {
    lines.push('Abre o instala SPORTMATCH con este enlace:')
    lines.push(appJoinUrl)
  }

  return { title, body: lines.join('\n'), appJoinUrl, publicPageUrl }
}

export function RevueltaInviteActions({ opportunity, className }: Props) {
  const origin =
    typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : ''

  const pack =
    origin.length > 0
      ? buildMatchInviteShareBody(opportunity, origin)
      : { title: '', body: '', appJoinUrl: '', publicPageUrl: null as string | null }

  const copyFullMessage = async () => {
    if (!pack.body) return
    try {
      await navigator.clipboard.writeText(pack.body)
      toast.success('Mensaje copiado (listo para pegar en WhatsApp u otra app)')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const inviteOrShareNative = async () => {
    if (!pack.body.trim()) return
    try {
      if (navigator.share) {
        // No pasar `url`: muchos SO concatenan `url` al `text` y duplican el enlace.
        await navigator.share({
          title: pack.title,
          text: pack.body,
        })
        return
      }
      await copyFullMessage()
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      await copyFullMessage()
    }
  }

  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap ${className ?? ''}`}>
      <Button
        type="button"
        size="sm"
        className="h-9 w-full sm:w-auto min-w-[10rem] bg-primary hover:bg-primary/90"
        onClick={() => void inviteOrShareNative()}
      >
        <Share2 className="w-3.5 h-3.5 mr-2 shrink-0" aria-hidden />
        Compartir o copiar
      </Button>
    </div>
  )
}
