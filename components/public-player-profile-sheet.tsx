'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ShieldAlert,
  Flag,
  Calendar,
  MapPin,
  Star,
  Trophy,
  Shield,
  AlertTriangle,
  OctagonAlert,
  Ban,
} from 'lucide-react'

import { useApp } from '@/lib/app-context'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchPublicPlayerProfile } from '@/lib/supabase/queries'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getOrganizerTierProgress } from '@/lib/organizer-level'
import type { Level, Position, PublicPlayerProfile } from '@/lib/types'

const LEVEL_LABELS: Record<Level, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  competitivo: 'Competitivo',
}

const POSITION_LABELS: Record<Position, string> = {
  portero: 'Portero',
  defensa: 'Defensa',
  mediocampista: 'Mediocampista',
  delantero: 'Delantero',
}

function formatDayLabel(day: string): string {
  const map: Record<string, string> = {
    lunes: 'Lun',
    martes: 'Mar',
    miercoles: 'Mié',
    jueves: 'Jue',
    viernes: 'Vie',
    sabado: 'Sáb',
    domingo: 'Dom',
  }
  return map[day.toLowerCase()] ?? day
}

export function PublicPlayerProfileSheet() {
  const {
    publicProfileUserId,
    closePublicProfile,
    currentUser,
    profilesRealtimeGeneration,
    avatarDisplayUrl,
  } = useApp()
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('conducta')
  const [reportDetails, setReportDetails] = useState('')

  const open = !!publicProfileUserId

  useEffect(() => {
    if (!open || !publicProfileUserId || !isSupabaseConfigured()) {
      setProfile(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const p = await fetchPublicPlayerProfile(createClient(), publicProfileUserId)
        if (!cancelled) setProfile(p)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, publicProfileUserId, profilesRealtimeGeneration])

  const organizerProgress = useMemo(() => {
    const n = profile?.statsOrganizedCompleted ?? 0
    return getOrganizerTierProgress(n)
  }, [profile?.statsOrganizedCompleted])

  const isAdminViewer = currentUser?.accountType === 'admin'
  const canReport =
    !!currentUser &&
    !!profile &&
    currentUser.id !== profile.id &&
    !isAdminViewer

  const submitReport = async () => {
    if (!canReport || !profile || !isSupabaseConfigured()) return
    const supabase = createClient()
    const details = reportDetails.trim()
    const { error } = await supabase.from('player_reports').insert({
      reporter_id: currentUser!.id,
      reported_user_id: profile.id,
      context_type: 'public_profile',
      context_id: null,
      reason: reportReason,
      details: details.length > 0 ? details : null,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Reporte enviado. Gracias por ayudarnos a moderar.')
    setReportOpen(false)
    setReportDetails('')
  }

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? null : closePublicProfile())}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle>Perfil del jugador</SheetTitle>
        </SheetHeader>

        {loading && !profile ? (
          <div className="p-4 text-sm text-muted-foreground">Cargando…</div>
        ) : !profile ? (
          <div className="p-4 text-sm text-muted-foreground">
            No se pudo cargar el perfil.
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-16 w-16 rounded-2xl overflow-hidden border border-border bg-secondary/30 shrink-0">
                {profile.photo ? (
                  <img
                    src={avatarDisplayUrl(profile.photo, profile.id)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-muted-foreground">
                    <Star className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-foreground truncate">
                  {profile.name}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {LEVEL_LABELS[profile.level] ?? profile.level}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
                    {profile.city}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {POSITION_LABELS[profile.position] ?? profile.position}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" aria-hidden />
                Estadísticas del jugador
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">Victorias</p>
                  <p className="text-xl font-bold tabular-nums">
                    {profile.statsPlayerWins}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">Empates</p>
                  <p className="text-xl font-bold tabular-nums">
                    {profile.statsPlayerDraws}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">Derrotas</p>
                  <p className="text-xl font-bold tabular-nums">
                    {profile.statsPlayerLosses}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" aria-hidden />
                Disponibilidad
              </p>
              {profile.availability.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.availability.map((d) => (
                    <span
                      key={d}
                      className="rounded-full bg-primary/15 text-primary border border-primary/25 px-2.5 py-1 text-xs font-medium"
                    >
                      {formatDayLabel(d)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sin disponibilidad registrada.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" aria-hidden />
                Organización de partidos
              </p>
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {profile.statsOrganizedCompleted}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Partidos organizados finalizados
                  </p>
                </div>
                <span className="text-xs font-medium text-primary text-right max-w-[55%] leading-snug">
                  {organizerProgress.tier.label}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/80 to-accent/90 transition-[width]"
                  style={{
                    width: `${Math.round(organizerProgress.progress * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Victorias al organizar:{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {profile.statsOrganizerWins}
                </span>
              </p>
            </div>

            {isAdminViewer ? (
              <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" aria-hidden />
                  Historial de amonestaciones por reportes
                </p>
                {profile.modBannedAt ? (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 flex items-start gap-2">
                    <Ban className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                      Cuenta baneada
                    </p>
                  </div>
                ) : null}
                {profile.modSuspendedUntil &&
                new Date(profile.modSuspendedUntil) > new Date() ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2">
                    Suspensión activa hasta{' '}
                    {new Date(profile.modSuspendedUntil).toLocaleString('es-CL')}.
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-center">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                    <p className="text-xl font-bold tabular-nums">{profile.modYellowCards}</p>
                    <p className="text-[11px] text-muted-foreground">Amarillas</p>
                  </div>
                  <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-3 text-center">
                    <OctagonAlert className="w-4 h-4 text-red-600 dark:text-red-400 mx-auto mb-1" />
                    <p className="text-xl font-bold tabular-nums">{profile.modRedCards}</p>
                    <p className="text-[11px] text-muted-foreground">Rojas</p>
                  </div>
                </div>
              </div>
            ) : null}

            {canReport ? (
              <div className="rounded-2xl border border-border bg-secondary/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Flag className="h-4 w-4 text-red-400" aria-hidden />
                    Reportar
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setReportOpen((v) => !v)}
                  >
                    {reportOpen ? 'Cancelar' : 'Reportar jugador'}
                  </Button>
                </div>
                {reportOpen ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={reportReason === 'conducta' ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => setReportReason('conducta')}
                      >
                        Conducta
                      </Button>
                      <Button
                        type="button"
                        variant={reportReason === 'spam' ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => setReportReason('spam')}
                      >
                        Spam
                      </Button>
                      <Button
                        type="button"
                        variant={reportReason === 'suplantacion' ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => setReportReason('suplantacion')}
                      >
                        Suplantación
                      </Button>
                      <Button
                        type="button"
                        variant={reportReason === 'otro' ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => setReportReason('otro')}
                      >
                        Otro
                      </Button>
                    </div>
                    <textarea
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      className="w-full min-h-[90px] rounded-xl border border-border bg-background p-3 text-sm"
                      placeholder="Describe brevemente qué ocurrió (opcional)."
                      maxLength={800}
                    />
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => void submitReport()}
                    >
                      Enviar reporte
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Los reportes llegan al equipo admin para revisión.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

