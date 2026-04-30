'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AdminPlayersBusinessSnapshot } from '@/lib/admin/ceo-snapshot'
import {
  BarChart3,
  CalendarDays,
  HeartPulse,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  UserCircle2,
  Users,
  UsersRound,
  Radio,
  Skull,
  Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getBrowserSessionAccessToken,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type PlayerRange = 'today' | '7d' | '15d' | '30d' | '90d'

type DashboardRow = {
  id: string
  name: string
  city: string
  cityId: string
  cityName: string | null
  regionId: string | null
  regionName: string | null
  createdAt: string
  lastSeenAt: string | null
}

type TeamRow = {
  id: string
  name: string
  createdAt: string
  captainId: string
  captainName: string
  cityId: string
  cityName: string | null
  regionId: string | null
  regionName: string | null
}

type OrganizerRow = {
  id: string
  title: string
  type: string
  typeLabel: string
  createdAt: string
  organizerId: string
  organizerName: string
  cityId: string
  cityName: string | null
  regionId: string | null
  regionName: string | null
}

type PlayersDashboardPayload = {
  range: PlayerRange
  regionId: string | null
  cityId: string | null
  from: string
  onlineWindowMinutes: number
  kpis: {
    totalActivePlayers: number
    createdToday: number
    onlineNow: number
    newPlayersInRange: number
    newTeamsInRange: number
    organizerEventsInRange: number
  }
  users: DashboardRow[]
  teams: TeamRow[]
  organizerEvents: OrganizerRow[]
  playerDirectory: DashboardRow[]
  playerDirectoryTotal: number
  business: AdminPlayersBusinessSnapshot | null
  businessError: string | null
}

type GeoRegionRow = { id: string; country_id: string; code: string; name: string }
type GeoCityRow = { id: string; region_id: string; name: string; slug: string }

async function adminBearerFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  }
  if (isSupabaseConfigured()) {
    const token = await getBrowserSessionAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return fetch(path, { ...init, headers })
}

const RANGE_OPTIONS: Array<{ id: PlayerRange; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '15d', label: '15 días' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '90 días' },
]

function PlayersSection({
  sectionId,
  categoryTag,
  title,
  subtitleQuestion,
  description,
  icon,
  iconClassName,
  tone,
  children,
}: {
  sectionId: string
  categoryTag: string
  title: string
  subtitleQuestion: string
  description: string
  icon: ReactNode
  iconClassName: string
  tone: 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'slate'
  children: ReactNode
}) {
  const border =
    tone === 'emerald'
      ? 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.07] to-transparent'
      : tone === 'sky'
        ? 'border-sky-500/25 bg-gradient-to-br from-sky-500/[0.07] to-transparent'
        : tone === 'violet'
          ? 'border-violet-500/25 bg-gradient-to-br from-violet-500/[0.07] to-transparent'
          : tone === 'amber'
            ? 'border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] to-transparent'
            : tone === 'rose'
              ? 'border-rose-500/25 bg-gradient-to-br from-rose-500/[0.07] to-transparent'
              : 'border-border bg-gradient-to-br from-muted/35 to-transparent'

  const iconWrap =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : tone === 'sky'
        ? 'border-sky-500/30 bg-sky-500/10'
        : tone === 'violet'
          ? 'border-violet-500/30 bg-violet-500/10'
          : tone === 'amber'
            ? 'border-amber-500/30 bg-amber-500/10'
            : tone === 'rose'
              ? 'border-rose-500/30 bg-rose-500/10'
              : 'border-border bg-muted/50'

  return (
    <section
      className={cn('rounded-2xl border p-4 shadow-sm sm:p-5', border)}
      aria-labelledby={`players-dash-${sectionId}`}
    >
      <div className="mb-4 flex gap-3 sm:mb-5 sm:gap-4">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border',
            iconWrap
          )}
        >
          <span className={iconClassName}>{icon}</span>
        </span>
        <div className="min-w-0 space-y-2">
          <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wide">
            {categoryTag}
          </Badge>
          <h2
            id={`players-dash-${sectionId}`}
            className="font-brand-heading text-base leading-tight text-foreground sm:text-lg"
          >
            {title}
          </h2>
          <p className="text-sm font-medium text-primary">{subtitleQuestion}</p>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  )
}

function PlayerKpiTile({
  icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: ReactNode
  label: string
  value: string | number
  accent?: 'amber' | 'emerald' | 'rose' | 'violet'
  hint?: string
}) {
  const accentRing =
    accent === 'amber'
      ? 'border-amber-500/20 bg-card/90'
      : accent === 'emerald'
        ? 'border-emerald-500/20 bg-card/90'
        : accent === 'rose'
          ? 'border-rose-500/20 bg-card/90'
          : accent === 'violet'
            ? 'border-violet-500/20 bg-card/90'
            : 'border-border bg-card/90'

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border px-3 py-3 shadow-sm transition-shadow hover:shadow-md sm:px-4 sm:py-3.5',
        accentRing
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[11px] font-semibold leading-snug text-foreground sm:text-xs">
          {label}
        </p>
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/90 text-primary',
            accent === 'amber' && 'text-amber-600 dark:text-amber-400',
            accent === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
            accent === 'rose' && 'text-rose-600 dark:text-rose-400',
            accent === 'violet' && 'text-violet-600 dark:text-violet-400'
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 border-t border-border/60 pt-2 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Estado simple para el listado (heurística con fechas del perfil). */
function directoryRowStatus(u: DashboardRow): {
  label: string
  className: string
} {
  const now = Date.now()
  const weekMs = 7 * 24 * 60 * 60 * 1000
  const created = new Date(u.createdAt).getTime()
  const isNew = Number.isFinite(created) && now - created < weekMs
  if (u.lastSeenAt) {
    const seen = new Date(u.lastSeenAt).getTime()
    if (Number.isFinite(seen) && now - seen < weekMs) {
      return {
        label: 'Activo',
        className:
          'border-emerald-500/40 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100',
      }
    }
  }
  if (isNew) {
    return {
      label: 'Nuevo',
      className: 'border-sky-500/40 bg-sky-500/15 text-sky-900 dark:text-sky-100',
    }
  }
  return {
    label: 'Inactivo',
    className: 'border-rose-500/35 bg-rose-500/10 text-rose-900 dark:text-rose-100',
  }
}

function cohortRetentionClass(pct: number): string {
  if (pct >= 50)
    return 'bg-emerald-600/30 text-emerald-950 dark:bg-emerald-500/35 dark:text-emerald-50'
  if (pct >= 35)
    return 'bg-emerald-500/20 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-50'
  if (pct >= 20)
    return 'bg-emerald-400/15 text-emerald-900 dark:text-emerald-100'
  if (pct > 0) return 'bg-muted/80 text-muted-foreground'
  return 'bg-muted/40 text-muted-foreground'
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function fmtLastSeen(iso: string | null) {
  if (!iso) return 'Sin actividad reciente'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diffMin = Math.round((Date.now() - t) / 60000)
  if (diffMin < 1) return 'Hace un momento'
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH} h`
  return fmtDate(iso)
}

export function AdminPlayersDashboardPanel() {
  const [range, setRange] = useState<PlayerRange>('30d')
  const [regionId, setRegionId] = useState<string>('')
  const [cityId, setCityId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PlayersDashboardPayload | null>(null)
  const [geoLoading, setGeoLoading] = useState(true)
  const [regions, setRegions] = useState<GeoRegionRow[]>([])
  const [cities, setCities] = useState<GeoCityRow[]>([])
  const [directorySearch, setDirectorySearch] = useState('')

  const loadGeo = useCallback(async () => {
    setGeoLoading(true)
    try {
      const r = await adminBearerFetch('/api/admin/geo')
      const j = (await r.json()) as {
        regions?: GeoRegionRow[]
        cities?: GeoCityRow[]
        error?: string
      }
      if (!r.ok) throw new Error(j.error ?? 'Error geo')
      setRegions(j.regions ?? [])
      setCities(j.cities ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar geo')
    } finally {
      setGeoLoading(false)
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ range })
      if (regionId) params.set('regionId', regionId)
      if (cityId) params.set('cityId', cityId)
      const r = await adminBearerFetch(`/api/admin/players-dashboard?${params}`)
      const j = (await r.json()) as PlayersDashboardPayload & { error?: string }
      if (!r.ok) throw new Error(j.error ?? 'Error')
      setData(j as PlayersDashboardPayload)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [range, regionId, cityId])

  useEffect(() => {
    void loadGeo()
  }, [loadGeo])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const id = window.setInterval(() => void loadDashboard(), 45_000)
    return () => window.clearInterval(id)
  }, [loadDashboard])

  const citiesInRegion = useMemo(() => {
    if (!regionId) return cities
    return cities.filter((c) => c.region_id === regionId)
  }, [cities, regionId])

  const onRegionChange = (v: string) => {
    setRegionId(v === 'all' ? '' : v)
    setCityId('')
  }

  const filteredDirectory = useMemo(() => {
    if (!data?.playerDirectory) return []
    const q = directorySearch.trim().toLowerCase()
    if (!q) return data.playerDirectory
    return data.playerDirectory.filter((u) => u.name.toLowerCase().includes(q))
  }, [data, directorySearch])

  const filterSummary = useMemo(() => {
    const r = regions.find((x) => x.id === regionId)
    const c = cities.find((x) => x.id === cityId)
    if (!regionId && !cityId) return 'Chile completo (sin filtro de lugar)'
    if (regionId && !cityId) return `Región: ${r?.name ?? '—'}`
    if (cityId) return `${r?.name ?? '—'} · ${c?.name ?? '—'}`
    return ''
  }, [regionId, cityId, regions, cities])

  return (
    <Card className="gap-0 overflow-hidden border-border py-0 shadow-sm">
      <CardHeader className="border-b border-border bg-secondary/20 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <Badge
              variant="outline"
              className="w-fit border-emerald-500/40 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-200"
            >
              Comunidad
            </Badge>
            <CardTitle className="text-xl sm:text-2xl">Jugadores</CardTitle>
            <CardDescription className="max-w-3xl text-pretty text-xs leading-relaxed sm:text-sm">
              Identifica quién <strong className="text-foreground">usa la app activamente</strong>, quién{' '}
              <strong className="text-foreground">llega a jugar</strong>, quién{' '}
              <strong className="text-foreground">vuelve</strong> y quién{' '}
              <strong className="text-foreground">pierde ritmo</strong>. Usa región y ciudad para acotar
              la vista; el rango de días afecta las listas de novedades al final. Los datos se
              actualizan cada 45 segundos.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-wrap gap-1.5">
              {RANGE_OPTIONS.map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  variant={range === opt.id ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px] sm:text-xs"
                  onClick={() => setRange(opt.id)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 shrink-0"
              disabled={loading}
              onClick={() => void loadDashboard()}
            >
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
              Actualizar
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Filtrar por región</Label>
            <Select value={regionId || 'all'} onValueChange={onRegionChange} disabled={geoLoading}>
              <SelectTrigger className="h-9 bg-background">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent className="max-h-[min(280px,50vh)]">
                <SelectItem value="all">Todas las regiones</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Filtrar por ciudad</Label>
            <Select
              value={cityId || 'all'}
              onValueChange={(v) => setCityId(v === 'all' ? '' : v)}
              disabled={geoLoading}
            >
              <SelectTrigger className="h-9 bg-background">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent className="max-h-[min(280px,50vh)]">
                <SelectItem value="all">Todas las ciudades</SelectItem>
                {(regionId ? citiesInRegion : cities).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="flex items-end text-[11px] text-muted-foreground lg:col-span-1">
            {geoLoading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando catálogo…
              </span>
            ) : (
              <>
                <CalendarDays className="mr-1.5 h-4 w-4 shrink-0 text-primary" />
                Actividad reciente:{' '}
                <strong className="ml-1 text-foreground">
                  {RANGE_OPTIONS.find((o) => o.id === range)?.label}
                </strong>
              </>
            )}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-4 sm:p-6">
        {loading && !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">No hay datos para este filtro.</p>
        ) : (
          <>
            <div className="rounded-xl border border-border/80 bg-muted/25 px-4 py-3 sm:px-5">
              <p className="text-xs text-muted-foreground sm:text-sm">
                <span className="font-semibold text-foreground">Ámbito geográfico: </span>
                {filterSummary}. Todas las cifras de negocio respetan este filtro cuando eliges región o
                ciudad.
              </p>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-4 sm:px-5">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-background">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-brand-heading text-sm text-foreground sm:text-base">
                    Cómo leer esta pantalla
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    Cada bloque tiene una <strong className="text-foreground">etiqueta de tema</strong>, un{' '}
                    <strong className="text-foreground">título</strong>, una{' '}
                    <strong className="text-foreground">pregunta en verde</strong> que resume el objetivo y un
                    texto que explica qué miden las tarjetas. Las notas bajo el número evitan jerga técnica.
                  </p>
                </div>
              </div>
            </div>

            {data.businessError ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                Vista de negocio no disponible: {data.businessError}. Aplica la migración{' '}
                <span className="font-mono">admin_ceo_business_snapshots</span> en Supabase.
              </p>
            ) : null}

            {data.business ? (
              <div className="space-y-6">
                <PlayersSection
                  sectionId="activity"
                  categoryTag="Actividad real"
                  title="Uso real de la aplicación"
                  subtitleQuestion="¿Cuántos jugadores usan la app de verdad?"
                  description="Cuenta perfiles jugador sin baneo (y con tu filtro de lugar). «Activos» = abrieron la app al menos una vez en la ventana indicada, según la última actividad guardada."
                  icon={<HeartPulse className="h-5 w-5" />}
                  iconClassName="text-emerald-600 dark:text-emerald-400"
                  tone="emerald"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <PlayerKpiTile
                      icon={<Users className="h-4 w-4" />}
                      label="Activos en los últimos 7 días"
                      value={data.business.activity.activePlayers7d}
                      accent="emerald"
                      hint="Abrieron la app al menos una vez en los últimos 7 días."
                    />
                    <PlayerKpiTile
                      icon={<Users className="h-4 w-4" />}
                      label="Activos en los últimos 30 días"
                      value={data.business.activity.activePlayers30d}
                      hint="Misma lógica, ventana de 30 días."
                    />
                    <PlayerKpiTile
                      icon={<Shield className="h-4 w-4" />}
                      label="Activos 7 días respecto del total"
                      value={`${data.business.activity.pctActive7dOfEligible}%`}
                      hint={`Base: ${data.business.activity.eligiblePlayers.toLocaleString('es-CL')} jugadores en el filtro (sin cuentas baneadas).`}
                    />
                    <PlayerKpiTile
                      icon={<Radio className="h-4 w-4" />}
                      label="Con la app abierta ahora (aprox.)"
                      value={data.kpis.onlineNow}
                      accent="violet"
                      hint={`Usuarios con actividad registrada en los últimos ${data.onlineWindowMinutes} minutos (aproximación en tiempo casi real).`}
                    />
                  </div>
                </PlayersSection>

                <PlayersSection
                  sectionId="quality"
                  categoryTag="Calidad de usuario"
                  title="Del registro al primer partido útil"
                  subtitleQuestion="¿Cuántos llegan a un estado útil para el marketplace?"
                  description="Onboarding completo, al menos un partido ya cerrado en el sistema como «completado», y jugadores que repiten (dos o más partidos completados entre quienes ya jugaron uno)."
                  icon={<UserCircle2 className="h-5 w-5" />}
                  iconClassName="text-sky-600 dark:text-sky-400"
                  tone="sky"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <PlayerKpiTile
                      icon={<UserCircle2 className="h-4 w-4" />}
                      label="Perfil esencial completo"
                      value={`${data.business.quality.pctOnboardingComplete}%`}
                      hint="Completaron datos mínimos obligatorios del perfil (onboarding)."
                    />
                    <PlayerKpiTile
                      icon={<Trophy className="h-4 w-4" />}
                      label="Han jugado al menos un partido cerrado"
                      value={`${data.business.quality.pctPlayedAtLeastOneCompleted}%`}
                      hint="Participaron confirmados en un partido que ya figura como completado en el sistema."
                    />
                    <PlayerKpiTile
                      icon={<TrendingUp className="h-4 w-4" />}
                      label="Recurrentes (2 o más partidos completados)"
                      value={`${data.business.quality.pctReturningAmongPlayers}%`}
                      hint="Porcentaje sobre quienes ya tienen al menos un partido completado; mide repetición."
                    />
                  </div>
                </PlayersSection>

                <PlayersSection
                  sectionId="engagement"
                  categoryTag="Engagement"
                  title="Intensidad de juego"
                  subtitleQuestion="¿Cuánto juegan los que efectivamente juegan?"
                  description="Promedio y mediana de partidos completados entre quienes ya tienen historial. El ranking muestra quién más partidos cerrados ha acumulado en la plataforma (con tu filtro geográfico)."
                  icon={<BarChart3 className="h-5 w-5" />}
                  iconClassName="text-violet-600 dark:text-violet-400"
                  tone="violet"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <PlayerKpiTile
                      icon={<BarChart3 className="h-4 w-4" />}
                      label="Partidos completados por jugador (promedio)"
                      value={data.business.engagement.avgCompletedMatchesPerPlayerWithPlay}
                      hint="Solo jugadores con al menos un partido completado; promedia el volumen."
                    />
                    <PlayerKpiTile
                      icon={<BarChart3 className="h-4 w-4" />}
                      label="Partidos completados por jugador (mediana)"
                      value={data.business.engagement.medianCompletedMatchesPerPlayerWithPlay}
                      hint="Valor central de la distribución; útil si pocos concentran muchos partidos."
                    />
                  </div>
                  {data.business.engagement.topActivePlayers.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-violet-500/20 bg-card/90 p-4 shadow-sm">
                      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-brand-heading text-sm text-foreground">Top jugadores activos</h3>
                          <p className="text-[11px] text-muted-foreground sm:text-xs">
                            Quiénes más partidos completados llevan (ranking interno, máx. 10).
                          </p>
                        </div>
                        <Sparkles className="hidden h-4 w-4 text-violet-500 sm:block" />
                      </div>
                      <ol className="space-y-2">
                        {data.business.engagement.topActivePlayers.map((p, i) => (
                          <li
                            key={p.userId}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                          >
                            <span className="min-w-0 text-sm text-muted-foreground">
                              <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>{' '}
                              <span className="font-semibold text-foreground">
                                {p.name?.trim() || 'Sin nombre'}
                              </span>
                            </span>
                            <Badge
                              variant="secondary"
                              className="shrink-0 border-emerald-500/30 bg-emerald-500/15 font-mono tabular-nums text-emerald-900 dark:text-emerald-100"
                            >
                              {p.completedMatches} partidos
                            </Badge>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </PlayersSection>

                <PlayersSection
                  sectionId="churn"
                  categoryTag="Churn"
                  title="Inactividad y riesgo de abandono"
                  subtitleQuestion="¿Quiénes dejaron de volver?"
                  description="Perfiles elegibles sin actividad reciente en la app. También ves qué parte del universo lleva más de una semana sin abrir la aplicación."
                  icon={<Skull className="h-5 w-5" />}
                  iconClassName="text-rose-600 dark:text-rose-400"
                  tone="rose"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <PlayerKpiTile
                      icon={<Skull className="h-4 w-4" />}
                      label="Sin abrir la app en 7 días"
                      value={data.business.churn.inactive7d}
                      accent="rose"
                      hint={`${data.business.churn.pctInactive7d}% de los jugadores elegibles en el filtro.`}
                    />
                    <PlayerKpiTile
                      icon={<Skull className="h-4 w-4" />}
                      label="Sin actividad en 15 días"
                      value={data.business.churn.inactive15d}
                      hint="Ventana intermedia; suele indicar enfriamiento."
                    />
                    <PlayerKpiTile
                      icon={<Skull className="h-4 w-4" />}
                      label="Sin actividad en 30 días"
                      value={data.business.churn.inactive30d}
                      hint="Inactivos más largos; priorizar campañas o contacto."
                    />
                    <PlayerKpiTile
                      icon={<Users className="h-4 w-4" />}
                      label="Inactivos 7 días (porcentaje)"
                      value={`${data.business.churn.pctInactive7d}%`}
                      hint="Mismo denominador que en actividad: jugadores elegibles con filtro geo."
                    />
                  </div>
                </PlayersSection>

                {data.business.cohorts.length > 0 ? (
                  <PlayersSection
                    sectionId="cohorts"
                    categoryTag="Retención"
                    title="Cohortes por mes de alta"
                    subtitleQuestion="¿Cuántos de cada mes de registro siguen activos?"
                    description="Para cada mes (últimos seis meses): cuántas altas hubo y cuántas de esas personas abrieron la app al menos una vez en los últimos 30 días. El color de la última columna refleja la proporción que «sigue viva»."
                    icon={<CalendarDays className="h-5 w-5" />}
                    iconClassName="text-amber-600 dark:text-amber-400"
                    tone="amber"
                  >
                    <div className="overflow-x-auto rounded-xl border border-border/80">
                      <table className="w-full min-w-[360px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2.5">Mes de alta</th>
                            <th className="px-3 py-2.5">Personas nuevas</th>
                            <th className="px-3 py-2.5">Activas últimos 30 días</th>
                            <th className="px-3 py-2.5">Retención aprox.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.business.cohorts.map((c) => {
                            const pct =
                              c.registered > 0
                                ? Math.round((c.activeLast30d / c.registered) * 1000) / 10
                                : 0
                            return (
                              <tr key={c.month} className="border-b border-border/50">
                                <td className="px-3 py-2.5 font-mono text-xs font-medium text-foreground">
                                  {c.month}
                                </td>
                                <td className="px-3 py-2.5 tabular-nums text-foreground">
                                  {c.registered.toLocaleString('es-CL')}
                                </td>
                                <td className="px-3 py-2.5 tabular-nums text-foreground">
                                  {c.activeLast30d.toLocaleString('es-CL')}
                                </td>
                                <td
                                  className={cn(
                                    'px-3 py-2.5 text-center text-sm font-semibold tabular-nums',
                                    cohortRetentionClass(pct)
                                  )}
                                >
                                  {c.registered > 0 ? `${pct.toLocaleString('es-CL')}%` : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </PlayersSection>
                ) : null}
              </div>
            ) : null}

            <PlayersSection
              sectionId="signals"
              categoryTag="Crecimiento"
              title="Movimiento en el período que elegiste"
              subtitleQuestion="¿Qué tanto creció la comunidad y la oferta de partidos?"
              description="Números operativos según el rango de botones (Hoy, 7, 15, 30 o 90 días): altas, equipos nuevos y partidos publicados. Sirve para contexto; la salud profunda está en los bloques anteriores."
              icon={<TrendingUp className="h-5 w-5" />}
              iconClassName="text-muted-foreground"
              tone="slate"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <PlayerKpiTile
                  icon={<UserCircle2 className="h-4 w-4" />}
                  label="Altas hoy (medianoche servidor)"
                  value={data.kpis.createdToday}
                  hint="Cuentas jugador nuevas desde el inicio del día actual."
                />
                <PlayerKpiTile
                  icon={<Users className="h-4 w-4" />}
                  label={`Altas en «${RANGE_OPTIONS.find((o) => o.id === range)?.label ?? range}»`}
                  value={data.kpis.newPlayersInRange}
                  hint="Mismo rango que los botones de arriba a la derecha."
                />
                <PlayerKpiTile
                  icon={<UsersRound className="h-4 w-4" />}
                  label="Equipos creados en ese rango"
                  value={data.kpis.newTeamsInRange}
                />
                <PlayerKpiTile
                  icon={<Shield className="h-4 w-4" />}
                  label="Partidos publicados en ese rango"
                  value={data.kpis.organizerEventsInRange}
                  hint="Buscan rival, revuelta, modo equipo, etc."
                />
                <PlayerKpiTile
                  icon={<Users className="h-4 w-4" />}
                  label="Total jugadores en el directorio filtrado"
                  value={data.kpis.totalActivePlayers}
                  hint="Sin baneos; respeta región y ciudad si las elegiste."
                />
              </div>
            </PlayersSection>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-xl space-y-1">
                  <Badge variant="outline" className="mb-1 text-[10px] font-semibold uppercase">
                    Directorio
                  </Badge>
                  <h3 className="font-brand-heading text-base text-foreground sm:text-lg">
                    Listado de jugadores
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    Todos los perfiles que cumplen tu filtro de lugar. Orden alfabético por nombre. La
                    columna <strong className="text-foreground">Estado</strong> es una vista rápida:{' '}
                    <strong className="text-foreground">Activo</strong> abrió la app en los últimos 7 días,{' '}
                    <strong className="text-foreground">Nuevo</strong> se registró hace menos de 7 días,{' '}
                    <strong className="text-foreground">Inactivo</strong> no cumple lo anterior. Hasta 200
                    filas en pantalla; el total puede ser mayor.
                  </p>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 bg-background pl-9"
                    placeholder="Buscar por nombre…"
                    value={directorySearch}
                    onChange={(e) => setDirectorySearch(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/80 bg-card/80">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5">Nombre</th>
                      <th className="px-3 py-2.5">Región</th>
                      <th className="px-3 py-2.5">Ciudad</th>
                      <th className="px-3 py-2.5">Se registró</th>
                      <th className="px-3 py-2.5">Última actividad</th>
                      <th className="px-3 py-2.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDirectory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                          {data.playerDirectory.length === 0
                            ? 'No hay jugadores con este filtro.'
                            : 'Ningún nombre coincide con la búsqueda.'}
                        </td>
                      </tr>
                    ) : (
                      filteredDirectory.map((u) => {
                        const st = directoryRowStatus(u)
                        return (
                          <tr
                            key={u.id}
                            className="border-b border-border/50 transition-colors hover:bg-muted/25"
                          >
                            <td className="px-3 py-2.5 font-medium text-foreground">
                              {u.name?.trim() || 'Sin nombre'}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {u.regionName ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {u.cityName ?? u.city ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                              {fmtDate(u.createdAt)}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {fmtLastSeen(u.lastSeenAt)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={cn(
                                  'inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold sm:text-[11px]',
                                  st.className
                                )}
                              >
                                {st.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {directorySearch.trim()
                  ? `${filteredDirectory.length} resultado(s) de búsqueda sobre ${data.playerDirectory.length} jugadores cargados. `
                  : `${data.playerDirectory.length} jugadores en esta tabla (máx. 200). `}
                Total que coincide con región/ciudad:{' '}
                <span className="font-medium text-foreground">{data.playerDirectoryTotal}</span>.
              </p>
            </div>

            <div className="space-y-2 pb-1 pt-2">
              <Badge variant="secondary" className="text-[10px] font-semibold uppercase">
                Detalle del período
              </Badge>
              <h3 className="font-brand-heading text-base text-foreground sm:text-lg">
                Novedades recientes en el rango seleccionado
              </h3>
              <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Listas concretas de altas, equipos nuevos y partidos publicados en la ventana{' '}
                <strong className="text-foreground">
                  {RANGE_OPTIONS.find((o) => o.id === range)?.label ?? range}
                </strong>
                . Complementa las tarjetas de «Crecimiento» de arriba.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-1">
                <h3 className="font-brand-heading mb-1 text-sm text-foreground">
                  Personas que se registraron
                </h3>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Cuentas jugador nuevas en el período; orden por fecha de alta.
                </p>
                <ul className="max-h-[min(50vh,360px)] space-y-2 overflow-y-auto text-sm [scrollbar-width:thin]">
                  {data.users.length === 0 ? (
                    <li className="text-muted-foreground">Nadie se registró en estos días.</li>
                  ) : (
                    data.users.map((u) => (
                      <li
                        key={u.id}
                        className="rounded-lg border border-border/60 bg-secondary/15 px-3 py-2"
                      >
                        <p className="font-medium text-foreground">{u.name || 'Sin nombre'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {u.regionName ?? '—'} · {u.cityName ?? u.city}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{fmtDate(u.createdAt)}</p>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-1">
                <h3 className="font-brand-heading mb-1 text-sm text-foreground">Equipos recién creados</h3>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Nombre del equipo y capitán; útil para ver dinámica social.
                </p>
                <ul className="max-h-[min(50vh,360px)] space-y-2 overflow-y-auto text-sm [scrollbar-width:thin]">
                  {data.teams.length === 0 ? (
                    <li className="text-muted-foreground">Ningún equipo nuevo en estos días.</li>
                  ) : (
                    data.teams.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-lg border border-border/60 bg-secondary/15 px-3 py-2"
                      >
                        <p className="font-medium text-foreground">{t.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Capitán: <span className="text-foreground">{t.captainName}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t.regionName ?? '—'} · {t.cityName ?? '—'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{fmtDate(t.createdAt)}</p>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-1">
                <h3 className="font-brand-heading mb-1 text-sm text-foreground">Partidos publicados</h3>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Título, tipo y quién organiza; mueve el marketplace visible.
                </p>
                <ul className="max-h-[min(50vh,360px)] space-y-2 overflow-y-auto text-sm [scrollbar-width:thin]">
                  {data.organizerEvents.length === 0 ? (
                    <li className="text-muted-foreground">Nadie publicó un partido en estos días.</li>
                  ) : (
                    data.organizerEvents.map((o) => (
                      <li
                        key={o.id}
                        className="rounded-lg border border-border/60 bg-secondary/15 px-3 py-2"
                      >
                        <p className="line-clamp-2 font-medium text-foreground">{o.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {o.typeLabel} — organiza:{' '}
                          <span className="text-foreground">{o.organizerName}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {o.regionName ?? '—'} · {o.cityName ?? '—'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{fmtDate(o.createdAt)}</p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
