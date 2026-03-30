'use client'

import { toast } from 'sonner'
import type { MatchOpportunity } from '@/lib/types'
import { revueltaInviteAbsoluteUrl } from '@/lib/match-invite-url'
import { Button } from '@/components/ui/button'
import { Share2, Link2 } from 'lucide-react'

type Props = {
  opportunity: MatchOpportunity
  className?: string
}

export function RevueltaInviteActions({ opportunity, className }: Props) {
  const url =
    typeof window !== 'undefined'
      ? revueltaInviteAbsoluteUrl(opportunity.id, window.location.origin)
      : ''

  const shareText = `¡Únete a la revuelta «${opportunity.title}» en SPORTMATCH!`

  const copyLink = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const shareNative = async () => {
    if (!url) return
    try {
      if (navigator.share) {
        await navigator.share({ title: shareText, text: shareText, url })
      } else {
        await copyLink()
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      await copyLink()
    }
  }

  const whatsapp = () => {
    if (!url) return
    const text = encodeURIComponent(`${shareText} ${url}`)
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => void copyLink()}
      >
        <Link2 className="w-3.5 h-3.5 mr-1" />
        Copiar enlace
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        onClick={whatsapp}
      >
        WhatsApp
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-8 bg-primary hover:bg-primary/90"
        onClick={() => void shareNative()}
      >
        <Share2 className="w-3.5 h-3.5 mr-1" />
        Compartir
      </Button>
    </div>
  )
}
