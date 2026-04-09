'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  CalendarDays,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  UserCircle2,
  Users,
  UsersRound,
  Radio,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

type PlayerRange = 'today' | '7d' | '15d' | '30d'

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
]

function MetricTile({
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
      ? 'border-amber-500/25 bg-amber-500/[0.06]'
      : accent === 'emerald'
        ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
        : accent === 'rose'
          ? 'border-rose-500/25 bg-rose-500/[0.06]'
          : accent === 'violet'
            ? 'border-violet-500/25 bg-violet-500/[0.06]'
            : 'border-border bg-card'

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4',
        accentRing
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="line-clamp-2 text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">
          {label}
        </span>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-primary',
            accent === 'amber' && 'text-amber-600 dark:text-amber-400',
            accent === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
            accent === 'rose' && 'text-rose-600 dark:text-rose-400',
            accent === 'violet' && 'text-violet-600 dark:text-violet-400'
          )}
        >
          {icon}
        </span>
      </div>
      <p className="text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
        {value}
      </p>
      {hint ? <p className="text-[10px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  )
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
          <div>
            <CardTitle className="text-lg">Comunidad de jugadores</CardTitle>
            <CardDescription className="max-w-3xl text-pretty">
              Números clave abajo. <strong className="text-foreground">Región y ciudad</strong> filtran
              el listado de jugadores y los totales. Los botones{' '}
              <strong className="text-foreground">Hoy / 7 / 15 / 30 días</strong> solo cambian las tres
              columnas de abajo (cuentas nuevas, equipos nuevos y partidos publicados). Los datos se
              refrescan solos cada 45 segundos.
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
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          <>
            <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Lugar:</span> {filterSummary}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
              <MetricTile
                icon={<Users className="h-5 w-5" />}
                label="Jugadores en la app"
                value={data.kpis.totalActivePlayers}
                accent="emerald"
                hint="Perfiles de jugador sin baneo. Respeta región/ciudad si elegiste filtro."
              />
              <MetricTile
                icon={<UserCircle2 className="h-5 w-5" />}
                label="Nuevas cuentas hoy"
                value={data.kpis.createdToday}
                hint="Personas que se registraron desde la medianoche (hora del servidor)."
              />
              <MetricTile
                icon={<Radio className="h-5 w-5" />}
                label="Con la app abierta"
                value={data.kpis.onlineNow}
                accent="violet"
                hint={`Usuarios que usaron la app en los últimos ${data.onlineWindowMinutes} minutos (aprox.).`}
              />
              <MetricTile
                icon={<Users className="h-5 w-5" />}
                label="Nuevas cuentas (período)"
                value={data.kpis.newPlayersInRange}
                hint="Suma del rango que elegiste arriba (Hoy / 7 / 15 / 30 días)."
              />
              <MetricTile
                icon={<UsersRound className="h-5 w-5" />}
                label="Equipos nuevos (período)"
                value={data.kpis.newTeamsInRange}
                hint="Equipos creados en ese mismo rango de días."
              />
              <MetricTile
                icon={<Shield className="h-5 w-5" />}
                label="Partidos publicados (período)"
                value={data.kpis.organizerEventsInRange}
                hint="Buscan rival, revuelta o “yo + cinco” publicados en ese rango."
              />
            </div>

            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Listado de jugadores</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Todos los jugadores que entran en el filtro de región/ciudad. Orden alfabético.
                    Mostramos hasta 200 filas; el total puede ser mayor.
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
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5">Nombre</th>
                      <th className="px-3 py-2.5">Región</th>
                      <th className="px-3 py-2.5">Ciudad</th>
                      <th className="px-3 py-2.5">Se registró</th>
                      <th className="px-3 py-2.5">Última actividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDirectory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          {data.playerDirectory.length === 0
                            ? 'No hay jugadores con este filtro.'
                            : 'Ningún nombre coincide con la búsqueda.'}
                        </td>
                      </tr>
                    ) : (
                      filteredDirectory.map((u) => (
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
                          <td className="px-3 py-2.5 text-muted-foreground">{fmtLastSeen(u.lastSeenAt)}</td>
                        </tr>
                      ))
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

            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Actividad en el período seleccionado
            </h3>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-1">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Cuentas nuevas en el período
                </h3>
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
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Equipos nuevos y capitán
                </h3>
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
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Partidos publicados (quién organiza)
                </h3>
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
