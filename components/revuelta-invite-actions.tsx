'use client'

import { toast } from 'sonner'
import type { MatchOpportunity } from '@/lib/types'
import { revueltaInviteAbsoluteUrl } from '@/lib/match-invite-url'
import { Button } from '@/components/ui/button'
import { Share2 } from 'lucide-react'

type Props = {
  opportunity: MatchOpportunity
  className?: string
}

export function RevueltaInviteActions({ opportunity, className }: Props) {
  const url =
    typeof window !== 'undefined'
      ? revueltaInviteAbsoluteUrl(opportunity.id, window.location.origin)
      : ''

  const shareText =
    opportunity.type === 'team_pick_public'
      ? `¡Únete al 6vs6 «${opportunity.title}» en SPORTMATCH!`
      : `¡Únete a la revuelta «${opportunity.title}» en SPORTMATCH!`

  const copyLink = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const inviteOrShare = async () => {
    if (!url) return
    try {
      if (navigator.share) {
        await navigator.share({ title: shareText, text: shareText, url })
        return
      }
      await copyLink()
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      await copyLink()
    }
  }

  return (
    <div className={className ?? ''}>
      <Button
        type="button"
        size="sm"
        className="h-9 w-full sm:w-auto min-w-[12rem] bg-primary hover:bg-primary/90"
        onClick={() => void inviteOrShare()}
      >
        <Share2 className="w-3.5 h-3.5 mr-2 shrink-0" aria-hidden />
        Invitar o compartir
      </Button>
    </div>
  )
}
