'use client'

import { useMemo, useState, useRef } from 'react'
import { toast } from 'sonner'
import { useAppAuth, useAppTeam, useAppUI } from '@/lib/app-context'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Settings,
  LogOut,
  MapPin,
  Calendar,
  Star,
  Edit,
  ChevronRight,
  Users,
  Trophy,
  Minus,
  TrendingDown,
  Clock,
  Bell,
  Shield,
  Info,
  Loader2,
  Camera,
  Phone,
  Palette,
  AlertTriangle,
  OctagonAlert,
  Ban,
  MessageSquare,
} from 'lucide-react'
import type { Level } from '@/lib/types'
import { getOrganizerTierProgress } from '@/lib/organizer-level'
import {
  computeAgeFromBirthDate,
  isBirthdayToday,
} from '@/lib/age-birthday'
import { ThemeSegmentedControl } from '@/components/theme-controls'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import { insertAppUserFeedback } from '@/lib/supabase/app-feedback-queries'
import { APP_DISPLAY_VERSION } from '@/lib/constants/app-release'

const LEVEL_LABELS: Record<Level, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  competitivo: 'Competitivo',
}

const DAY_ORDER = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const

const MS_24H = 24 * 60 * 60 * 1000

function within24hSince(d?: Date | null): boolean {
  if (!d) return false
  const t = d.getTime()
  const now = Date.now()
  return now >= t && now - t < MS_24H
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

export function ProfileScreen() {
  const {
    setCurrentScreen,
    openProfileEditor,
    setInitialMatchesTab,
  } = useAppUI()
  const {
    currentUser,
    logout,
    updateProfilePhoto,
    avatarDisplayUrl,
  } = useAppAuth()
  const { getUserTeams } = useAppTeam()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoWorking, setPhotoWorking] = useState(false)

  const pickProfilePhoto = () => photoInputRef.current?.click()

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoWorking(true)
    try {
      await updateProfilePhoto(file)
    } finally {
      setPhotoWorking(false)
    }
  }

  const playerStats = useMemo(() => {
    if (!currentUser) {
      return { v: 0, e: 0, d: 0, equipos: 0 }
    }
    return {
      v: currentUser.statsPlayerWins ?? 0,
      e: currentUser.statsPlayerDraws ?? 0,
      d: currentUser.statsPlayerLosses ?? 0,
      equipos: getUserTeams().length,
    }
  }, [currentUser, getUserTeams])

  const organizerProgress = useMemo(() => {
    const n = currentUser?.statsOrganizedCompleted ?? 0
    return getOrganizerTierProgress(n)
  }, [currentUser?.statsOrganizedCompleted])

  const displayAge = useMemo(() => {
    if (!currentUser) return 0
    if (currentUser.birthDate) {
      return computeAgeFromBirthDate(currentUser.birthDate)
    }
    return currentUser.age
  }, [currentUser])

  const isBirthday = useMemo(() => {
    if (!currentUser?.birthDate) return false
    return isBirthdayToday(currentUser.birthDate)
  }, [currentUser?.birthDate])

  const statItems = [
    {
      label: 'Victorias',
      value: playerStats.v,
      hint: 'Como jugador (V)',
      icon: Trophy,
    },
    {
      label: 'Empates',
      value: playerStats.e,
      hint: 'Como jugador (E)',
      icon: Minus,
    },
    {
      label: 'Derrotas',
      value: playerStats.d,
      hint: 'Como jugador (D)',
      icon: TrendingDown,
    },
    {
      label: 'Equipos',
      value: playerStats.equipos,
      hint: 'Tus equipos',
      icon: Users,
    },
  ] as const

  const sortedAvailability = useMemo(() => {
    const raw = currentUser?.availability ?? []
    return [...raw].sort(
      (a, b) =>
        DAY_ORDER.indexOf(a.toLowerCase() as (typeof DAY_ORDER)[number]) -
        DAY_ORDER.indexOf(b.toLowerCase() as (typeof DAY_ORDER)[number])
    )
  }, [currentUser?.availability])

  const isBanned = Boolean(currentUser?.modBannedAt)

  const showYellowAlert = useMemo(
    () => !isBanned && within24hSince(currentUser?.modLastYellowAt ?? null),
    [currentUser?.modLastYellowAt, isBanned]
  )
  const showRedAlert = useMemo(
    () => !isBanned && within24hSince(currentUser?.modLastRedAt ?? null),
    [currentUser?.modLastRedAt, isBanned]
  )

  const menuItems: Array<{
    label: string
    icon: typeof Edit
    description?: string
    onClick: () => void
  }> = [
    {
      label: 'Editar perfil',
      icon: Edit,
      description: 'Nombre, posición, nivel, foto…',
      onClick: () => {
        if (isBanned) {
          toast.error('No disponible mientras tu cuenta está restringida.')
          return
        }
        openProfileEditor()
      },
    },
    {
      label: 'Mis equipos',
      icon: Users,
      description: 'Crear o gestionar equipos',
      onClick: () => {
        if (isBanned) {
          toast.error('No disponible mientras tu cuenta está restringida.')
          return
        }
        setCurrentScreen('teams')
      },
    },
    {
      label: 'Historial de partidos',
      icon: Clock,
      description: 'Partidos terminados',
      onClick: () => {
        if (isBanned) {
          toast.error('No disponible mientras tu cuenta está restringida.')
          return
        }
        setInitialMatchesTab('finished')
        setCurrentScreen('matches')
      },
    },
    {
      label: 'Configuración',
      icon: Settings,
      description: 'Ajustes y app',
      onClick: () => setSettingsOpen(true),
    },
    {
      label: 'Sugerencias, opiniones, errores',
      icon: MessageSquare,
      description: 'Envía un mensaje al equipo SPORTMATCH',
      onClick: () => {
        if (isBanned) {
          toast.error('No disponible mientras tu cuenta está restringida.')
          return
        }
        setFeedbackOpen(true)
      },
    },
  ]

  const submitFeedback = async () => {
    if (!currentUser) return
    const trimmed = feedbackText.trim()
    if (trimmed.length < 1) {
      toast.error('Escribe un mensaje antes de enviar.')
      return
    }
    if (trimmed.length > 4000) {
      toast.error('El mensaje no puede superar 4000 caracteres.')
      return
    }
    if (!isSupabaseConfigured()) {
      toast.error('La app no está conectada al servidor.')
      return
    }
    const sb = getBrowserSupabase()
    if (!sb) {
      toast.error('No se pudo conectar al servidor.')
      return
    }
    setFeedbackSubmitting(true)
    try {
      const { error } = await insertAppUserFeedback(sb, {
        userId: currentUser.id,
        message: trimmed,
        appVersion: APP_DISPLAY_VERSION,
      })
      if (error) {
        toast.error(error.message || 'No se pudo enviar el mensaje.')
        return
      }
      toast.success('Gracias, tu mensaje fue enviado.')
      setFeedbackOpen(false)
      setFeedbackText('')
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  const getLevelColor = () => {
    switch (currentUser?.level) {
      case 'principiante':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'intermedio':
        return 'bg-primary/20 text-primary border-primary/30'
      case 'avanzado':
        return 'bg-accent/20 text-accent border-accent/30'
      case 'competitivo':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      default:
        return ''
    }
  }

  const getPositionLabel = () => {
    switch (currentUser?.position) {
      case 'portero':
        return 'Portero'
      case 'defensa':
        return 'Defensa'
      case 'mediocampista':
        return 'Mediocampista'
      case 'delantero':
        return 'Delantero'
      default:
        return ''
    }
  }

  const levelLabel =
    (currentUser?.level && LEVEL_LABELS[currentUser.level]) || 'Intermedio'

  const nameTokens = currentUser?.name
    ? currentUser.name.trim().split(/\s+/).filter(Boolean)
    : []
  const profileFirstName = nameTokens[0] || 'Jugador'
  const profileShowFullNameHeading = nameTokens.length > 1

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-muted-foreground">Inicia sesión para ver tu perfil.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="relative overflow-hidden border-b border-border">
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary/25 via-background to-accent/15"
          aria-hidden
        />
        <div className="relative z-[1] flex items-center justify-between gap-3 px-4 pt-12 pb-5 sm:pt-14">
          <AppScreenBrandHeading
            className="min-w-0 flex-1"
            title="Perfil"
            titleAs="p"
            titleClassName="text-lg font-semibold tracking-tight sm:text-xl"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full border border-border bg-card/80 shadow-sm backdrop-blur-sm"
            onClick={() => setSettingsOpen(true)}
            aria-label="Configuración"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(ev) => void handlePhotoChange(ev)}
      />

      <div className="px-4 pt-4 pb-2 relative z-[2]">
        <div className="bg-card rounded-2xl border border-border shadow-lg shadow-black/20 p-6 pt-8">
          {isBanned ? (
            <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400">
                <Ban className="h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">Cuenta restringida</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Por moderación solo puedes ver esta pantalla. El resto de la app está deshabilitado.
                {currentUser.modBanReason?.trim()
                  ? ` Motivo: ${currentUser.modBanReason.trim()}`
                  : ''}
              </p>
            </div>
          ) : null}
          {!isBanned && showRedAlert ? (
            <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3">
              <div className="flex gap-2">
                <OctagonAlert className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                    Recibiste una tarjeta roja
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Se aplicó una suspensión de acceso de 3 días según las reglas de la comunidad.
                    Este aviso desaparece en 24 horas; el contador de tarjetas se mantiene en tu
                    perfil.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {!isBanned && showYellowAlert ? (
            <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <div className="flex gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Recibiste una tarjeta amarilla
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Es un aviso por reportes de conducta. Cada 3 amarillas acumuladas suman además
                    una roja automática; el total de amarillas no se borra. Este mensaje se oculta en
                    24 horas.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex flex-col items-center">
            <h1 className="mb-6 w-full text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Hola,{' '}
              <span className="text-primary">{profileFirstName}</span>
            </h1>

            <div className="relative mb-1">
              <button
                type="button"
                onClick={() => pickProfilePhoto()}
                disabled={photoWorking || isBanned}
                className="group rounded-full p-1 bg-gradient-to-br from-primary/40 to-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70"
                aria-label="Cambiar foto de perfil"
              >
                <span className="relative block w-28 h-28 rounded-full border-4 border-card overflow-hidden">
                  <img
                    src={avatarDisplayUrl(
                      currentUser.photo ||
                        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
                      currentUser.id
                    )}
                    alt=""
                    className="w-full h-full object-cover transition-opacity group-hover:opacity-90"
                  />
                  {photoWorking && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  pickProfilePhoto()
                }}
                disabled={photoWorking || isBanned}
                className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-card transition-transform active:scale-95 hover:bg-primary/90 disabled:opacity-60"
                aria-label="Subir nueva foto"
              >
                {photoWorking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground mb-3 h-auto py-1"
              onClick={() => pickProfilePhoto()}
              disabled={photoWorking || isBanned}
            >
              Cambiar foto
            </Button>

            {isBirthday && (
              <div className="mt-3 mb-1 w-full max-w-sm mx-auto rounded-xl border border-primary/35 bg-gradient-to-br from-primary/15 to-primary/5 px-4 py-3 text-center shadow-sm">
                <p className="text-sm font-semibold text-primary">
                  ¡Feliz cumpleaños, {profileFirstName}!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Que tengas un gran día en la cancha.
                </p>
              </div>
            )}

            {profileShowFullNameHeading ? (
              <h2 className="mt-4 text-lg font-bold text-foreground text-center border-t border-border/60 pt-4 w-full">
                {currentUser.name}
              </h2>
            ) : null}
            <p
              className={`flex items-center justify-center gap-1.5 text-sm text-muted-foreground ${
                profileShowFullNameHeading ? 'mt-1' : 'mt-4'
              }`}
            >
              <MapPin className="w-4 h-4 shrink-0 text-primary" />
              {currentUser.city || 'Rancagua'}
            </p>
            {currentUser.whatsappPhone?.trim() && (
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <Phone className="w-4 h-4 shrink-0 text-primary" />
                {currentUser.whatsappPhone}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Badge variant="outline" className={getLevelColor()}>
                <Star className="w-3 h-3 mr-1" />
                {levelLabel}
              </Badge>
              <Badge
                variant="secondary"
                className="bg-secondary/80 text-foreground border border-border/60"
              >
                {getPositionLabel() || 'Mediocampista'}
              </Badge>
              {displayAge > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-secondary/80 text-foreground border border-border/60"
                >
                  {displayAge} años
                </Badge>
              )}
            </div>

            {sortedAvailability.length > 0 && (
              <div className="mt-5 w-full">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Disponibilidad
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {sortedAvailability.map((d) => (
                    <span
                      key={d}
                      className="rounded-full bg-primary/15 text-primary border border-primary/25 px-2.5 py-1 text-xs font-medium"
                    >
                      {formatDayLabel(d)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-8 pt-6 border-t border-border">
            {statItems.map(({ label, value, hint, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl bg-secondary/40 border border-border/50 px-2 py-3 text-center"
              >
                <Icon className="w-4 h-4 text-primary mx-auto mb-1 opacity-90" />
                <p className="text-xl font-bold text-foreground tabular-nums">
                  {value}
                </p>
                <p className="text-[11px] font-medium text-foreground/90 leading-tight">
                  {label}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-3">
              <Shield className="w-3.5 h-3.5 text-primary" />
              Historial de amonestaciones por reportes
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-center">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {currentUser.modYellowCards ?? 0}
                </p>
                <p className="text-[11px] font-medium text-foreground">Amarillas</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Acumuladas en cuenta</p>
              </div>
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-3 text-center">
                <OctagonAlert className="w-4 h-4 text-red-600 dark:text-red-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {currentUser.modRedCards ?? 0}
                </p>
                <p className="text-[11px] font-medium text-foreground">Rojas</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Acumuladas en cuenta</p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-border space-y-3">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-primary" />
              Organización de partidos
            </p>
            <div className="rounded-xl bg-secondary/40 border border-border/50 p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <p className="text-2xl font-bold text-foreground tabular-nums">
                    {currentUser.statsOrganizedCompleted ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Partidos organizados finalizados
                  </p>
                </div>
                <span className="text-xs font-medium text-primary text-right max-w-[60%] leading-snug">
                  {organizerProgress.tier.label}
                </span>
              </div>
              <div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.round(organizerProgress.progress * 100)}%` }}
                  />
                </div>
                {organizerProgress.nextTierLabel && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Siguiente: {organizerProgress.nextTierLabel}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Victorias de tu equipo al organizar:{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {currentUser.statsOrganizerWins ?? 0}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <nav className="px-4 mt-6 space-y-2" aria-label="Acciones de perfil">
        {menuItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="group w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card text-left transition-all hover:border-primary/40 hover:bg-secondary/30 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground group-hover:text-primary transition-colors">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-foreground block">
                  {item.label}
                </span>
                {item.description && (
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {item.description}
                  </span>
                )}
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
            </button>
          )
        })}
      </nav>

      <div className="px-4 mt-6">
        <Button
          type="button"
          variant="outline"
          className="w-full h-12 border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-400"
          onClick={() => void logout()}
        >
          <LogOut className="w-5 h-5 mr-2" />
          Cerrar sesión
        </Button>
      </div>

      <p className="text-center mt-6 text-xs text-muted-foreground">
        SPORTMATCH v{APP_DISPLAY_VERSION}
      </p>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh]">
          <SheetHeader className="text-left border-b border-border pb-4">
            <SheetTitle>Configuración</SheetTitle>
            <SheetDescription>
              Ajustes de la cuenta y la aplicación.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-1 py-2">
            <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-3">
              <div className="flex gap-3">
                <Palette className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-sm">Apariencia</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Elige tema claro, oscuro o el mismo que tu dispositivo. Se guarda en este
                    navegador.
                  </p>
                  <div className="mt-3">
                    <ThemeSegmentedControl />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
              <Bell className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground text-sm">Notificaciones</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Próximamente podrás elegir avisos de partidos y mensajes.
                </p>
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
              <Shield className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground text-sm">Privacidad</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tus datos se usan solo para conectar partidos dentro de la app.
                </p>
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
              <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground text-sm">Acerca de</p>
                <p className="text-xs text-muted-foreground mt-1">
                  SPORTMATCH — encuentra rivales, jugadores y revueltas en tu ciudad.
                </p>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full border-red-500/40 text-red-500 hover:bg-red-500/10"
            onClick={() => {
              setSettingsOpen(false)
              void logout()
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet
        open={feedbackOpen}
        onOpenChange={(open) => {
          setFeedbackOpen(open)
          if (!open) setFeedbackText('')
        }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh]">
          <SheetHeader className="text-left border-b border-border pb-4">
            <SheetTitle>Sugerencias, opiniones, errores</SheetTitle>
            <SheetDescription>
              Cuéntanos qué mejorar, qué te gusta o si algo falla. Solo el equipo puede leerlo.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-4">
            <Textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Escribe aquí tu mensaje…"
              className="min-h-[140px] border-border bg-background"
              maxLength={4000}
              disabled={feedbackSubmitting}
            />
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {feedbackText.length}/4000
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={feedbackSubmitting}
              onClick={() => {
                setFeedbackOpen(false)
                setFeedbackText('')
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={feedbackSubmitting}
              onClick={() => void submitFeedback()}
            >
              {feedbackSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                'Enviar'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <BottomNav />
    </div>
  )
}
