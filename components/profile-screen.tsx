'use client'

import { useMemo, useState, useRef } from 'react'
import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Target,
  Users,
  Trophy,
  Clock,
  Bell,
  Shield,
  Info,
  Loader2,
  Camera,
  Phone,
  Palette,
} from 'lucide-react'
import type { Level } from '@/lib/types'
import { ThemeSegmentedControl } from '@/components/theme-controls'

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
    currentUser,
    logout,
    setCurrentScreen,
    openProfileEditor,
    matchOpportunities,
    participatingOpportunityIds,
    getUserTeams,
    setInitialMatchesTab,
    updateProfilePhoto,
  } = useApp()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoWorking, setPhotoWorking] = useState(false)
  const [avatarKey, setAvatarKey] = useState(0)

  const pickProfilePhoto = () => photoInputRef.current?.click()

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoWorking(true)
    try {
      const r = await updateProfilePhoto(file)
      if (r.ok) setAvatarKey((k) => k + 1)
    } finally {
      setPhotoWorking(false)
    }
  }

  const stats = useMemo(() => {
    const uid = currentUser?.id
    if (!uid) {
      return { partidos: 0, equipos: 0, victorias: 0 }
    }
    const partidos = matchOpportunities.filter(
      (m) =>
        m.status === 'completed' &&
        (m.creatorId === uid || participatingOpportunityIds.includes(m.id))
    ).length
    const victorias = matchOpportunities.filter(
      (m) =>
        m.status === 'completed' &&
        m.type === 'rival' &&
        m.creatorId === uid &&
        m.rivalResult === 'creator_team'
    ).length
    return {
      partidos,
      equipos: getUserTeams().length,
      victorias,
    }
  }, [
    currentUser?.id,
    matchOpportunities,
    participatingOpportunityIds,
    getUserTeams,
  ])

  const statItems = [
    {
      label: 'Partidos',
      value: stats.partidos,
      hint: 'Finalizados',
      icon: Target,
    },
    {
      label: 'Equipos',
      value: stats.equipos,
      hint: 'Tus equipos',
      icon: Users,
    },
    {
      label: 'Victorias',
      value: stats.victorias,
      hint: 'Como organizador',
      icon: Trophy,
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
      onClick: () => openProfileEditor(),
    },
    {
      label: 'Mis equipos',
      icon: Users,
      description: 'Crear o gestionar equipos',
      onClick: () => setCurrentScreen('teams'),
    },
    {
      label: 'Historial de partidos',
      icon: Clock,
      description: 'Partidos terminados',
      onClick: () => {
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
  ]

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
        <div className="relative flex items-center justify-between px-4 pt-12 pb-8 sm:pt-14">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Perfil
            </p>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Hola, {currentUser.name.split(' ')[0] || 'Jugador'}
            </h1>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-10 w-10 rounded-full border border-border bg-card/80 shadow-sm backdrop-blur-sm"
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

      <div className="px-4 -mt-6 relative z-10">
        <div className="bg-card rounded-2xl border border-border shadow-lg shadow-black/20 p-6 pt-0">
          <div className="flex flex-col items-center">
            <div className="relative -mt-14 mb-4">
              <button
                type="button"
                onClick={() => pickProfilePhoto()}
                disabled={photoWorking}
                className="group rounded-full p-1 bg-gradient-to-br from-primary/40 to-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70"
                aria-label="Cambiar foto de perfil"
              >
                <span className="relative block w-28 h-28 rounded-full border-4 border-card overflow-hidden">
                  <img
                    key={avatarKey}
                    src={
                      currentUser.photo ||
                      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face'
                    }
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
                disabled={photoWorking}
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
              className="text-xs text-muted-foreground -mt-1 mb-1 h-auto py-1"
              onClick={() => pickProfilePhoto()}
              disabled={photoWorking}
            >
              Cambiar foto
            </Button>

            <h2 className="text-xl font-bold text-foreground text-center">
              {currentUser.name}
            </h2>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
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
              {currentUser.age > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-secondary/80 text-foreground border border-border/60"
                >
                  {currentUser.age} años
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

          <div className="grid grid-cols-3 gap-2 mt-8 pt-6 border-t border-border">
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
        Pichanga v1.0.0
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
                  Pichanga — encuentra rivales, jugadores y revueltas en tu ciudad.
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

      <BottomNav />
    </div>
  )
}
