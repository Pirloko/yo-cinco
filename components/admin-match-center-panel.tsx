'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Filter,
  LayoutGrid,
  Loader2,
  MapPinned,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  Trophy,
  Users,
} from 'lucide-react'
import type {
  AdminMatchDisplayStatus,
  AdminMatchListItem,
  AdminMatchListSummary,
  AdminMatchOutcomeTone,
} from '@/lib/admin/match-dashboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAppUI } from '@/lib/app-context'
import {
  getBrowserSessionAccessToken,
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import {
  fetchGeoCatalogActive,
  type GeoCatalogActive,
} from '@/lib/supabase/geo-queries'
import { fetchSportsVenuesInCity } from '@/lib/supabase/venue-queries'
import type { Level, SportsVenue } from '@/lib/types'
import { cn } from '@/lib/utils'

type AdminMatchType = 'open' | 'team_pick_public' | 'team_pick_private'

type MatchesApiResponse = {
  total: number
  summary: AdminMatchListSummary
  matches: AdminMatchListItem[]
  error?: string
}

const LEVEL_OPTIONS: Level[] = ['principiante', 'intermedio', 'avanzado', 'competitivo']

const STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'Todos los estados' },
  { id: 'upcoming', label: 'Próximos' },
  { id: 'active', label: 'Activos' },
  { id: 'completed', label: 'Finalizados' },
  { id: 'suspended', label: 'Suspendidos' },
  { id: 'cancelled', label: 'Cancelados' },
] as const

const TYPE_FILTER_OPTIONS = [
  { id: 'all', label: 'Todos los modos' },
  { id: 'open', label: 'Revuelta' },
  { id: 'team_pick_public', label: 'Selección pública' },
  { id: 'team_pick_private', label: 'Selección privada' },
  { id: 'rival', label: 'Rival' },
  { id: 'players', label: 'Yo + cinco' },
] as const

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

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function statusBadgeClass(status: AdminMatchDisplayStatus) {
  switch (status) {
    case 'finalizado':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
    case 'suspendido':
      return 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100'
    case 'cancelado':
      return 'border-border bg-muted/60 text-muted-foreground'
    case 'confirmado':
      return 'border-primary/30 bg-primary/10 text-primary'
    default:
      return 'border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-100'
  }
}

function statusLabel(status: AdminMatchDisplayStatus) {
  switch (status) {
    case 'finalizado':
      return 'Finalizado'
    case 'suspendido':
      return 'Suspendido'
    case 'cancelado':
      return 'Cancelado'
    case 'confirmado':
      return 'Confirmado'
    default:
      return 'Programado'
  }
}

function outcomeBadgeClass(tone: AdminMatchOutcomeTone) {
  switch (tone) {
    case 'success':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100'
    case 'muted':
      return 'border-border bg-muted/50 text-muted-foreground'
    default:
      return 'border-border bg-secondary/60 text-foreground'
  }
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: ReactNode
  tone: 'slate' | 'sky' | 'emerald' | 'amber'
}) {
  const wrap =
    tone === 'sky'
      ? 'border-sky-500/20 bg-sky-500/[0.06]'
      : tone === 'emerald'
        ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
        : tone === 'amber'
          ? 'border-amber-500/20 bg-amber-500/[0.06]'
          : 'border-border bg-muted/30'

  return (
    <div className={cn('rounded-xl border px-3 py-3', wrap)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="font-brand-heading mt-1 text-2xl tabular-nums text-foreground">{value}</p>
        </div>
        <span className="text-muted-foreground/80">{icon}</span>
      </div>
    </div>
  )
}

function MatchRow({
  match,
  onOpen,
}: {
  match: AdminMatchListItem
  onOpen: (id: string) => void
}) {
  const fill =
    match.playersNeeded > 0
      ? Math.min(100, Math.round((match.playersJoined / match.playersNeeded) * 100))
      : 0

  return (
    <tr className="group border-b border-border/70 transition-colors hover:bg-muted/25">
      <td className="px-3 py-3 align-top">
        <div className="min-w-[180px] space-y-1">
          <p className="font-brand-heading text-sm leading-snug text-foreground">{match.title}</p>
          <p className="text-xs text-muted-foreground">
            {match.venue || match.location}
            {match.cityName ? ` · ${match.cityName}` : null}
          </p>
          {match.suspendedReason ? (
            <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-200">
              {match.suspendedReason}
            </p>
          ) : null}
        </div>
      </td>
      <td className="hidden px-3 py-3 align-top lg:table-cell">
        <Badge variant="outline" className="font-normal">
          {match.typeLabel}
        </Badge>
      </td>
      <td className="hidden px-3 py-3 align-top text-xs text-muted-foreground xl:table-cell">
        <p>{match.regionName ?? '—'}</p>
        <p>{match.cityName ?? match.location}</p>
      </td>
      <td className="px-3 py-3 align-top">
        <p className="whitespace-nowrap text-xs tabular-nums text-foreground">
          {formatWhen(match.dateTime)}
        </p>
        <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">{match.level}</p>
      </td>
      <td className="hidden px-3 py-3 align-top sm:table-cell">
        <div className="min-w-[88px] space-y-1">
          <p className="text-xs tabular-nums text-foreground">
            {match.playersJoined}/{match.playersNeeded || '—'}
          </p>
          {match.playersNeeded > 0 ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${fill}%` }}
              />
            </div>
          ) : null}
        </div>
      </td>
      <td className="hidden px-3 py-3 align-top md:table-cell">
        <p className="max-w-[120px] truncate text-xs text-foreground">{match.creatorName}</p>
        {match.creatorAccountType === 'admin' ? (
          <Badge variant="secondary" className="mt-1 text-[10px]">
            Admin
          </Badge>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex flex-col gap-1.5">
          <Badge className={cn('w-fit border font-normal', statusBadgeClass(match.displayStatus))}>
            {statusLabel(match.displayStatus)}
          </Badge>
          {match.outcomeLabel ? (
            <Badge
              variant="outline"
              className={cn('w-fit text-[10px] font-normal leading-snug', outcomeBadgeClass(match.outcomeTone))}
            >
              {match.outcomeLabel}
            </Badge>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => onOpen(match.id)}>
          Detalle
          <ChevronRight className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </td>
    </tr>
  )
}

function MatchCardMobile({
  match,
  onOpen,
}: {
  match: AdminMatchListItem
  onOpen: (id: string) => void
}) {
  return (
    <li className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-brand-heading text-sm leading-snug text-foreground">{match.title}</p>
          <p className="text-xs text-muted-foreground">
            {match.typeLabel} · {formatWhen(match.dateTime)}
          </p>
          <p className="text-xs text-muted-foreground">
            {match.cityName ?? match.location}
            {match.regionName ? ` · ${match.regionName}` : ''}
          </p>
        </div>
        <Badge className={cn('shrink-0 border font-normal', statusBadgeClass(match.displayStatus))}>
          {statusLabel(match.displayStatus)}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {match.outcomeLabel ? (
          <Badge variant="outline" className={cn('text-[10px] font-normal', outcomeBadgeClass(match.outcomeTone))}>
            {match.outcomeLabel}
          </Badge>
        ) : null}
        <span className="text-[11px] text-muted-foreground">
          {match.creatorName} · {match.playersJoined}/{match.playersNeeded || '—'} jug.
        </span>
      </div>
      <Button type="button" size="sm" className="mt-3 w-full" onClick={() => onOpen(match.id)}>
        Abrir detalle
      </Button>
    </li>
  )
}

export function AdminMatchCenterPanel({
  createDialogOpen: controlledDialogOpen,
  onCreateDialogOpenChange,
}: {
  createDialogOpen?: boolean
  onCreateDialogOpenChange?: (open: boolean) => void
} = {}) {
  const { setCurrentScreen, setSelectedMatchOpportunityId } = useAppUI()

  const [geo, setGeo] = useState<GeoCatalogActive | null>(null)

  const [createRegionId, setCreateRegionId] = useState('')
  const [createCityId, setCreateCityId] = useState('')
  const [venues, setVenues] = useState<SportsVenue[]>([])

  const [mode, setMode] = useState<AdminMatchType>('open')
  const [level, setLevel] = useState<Level>('intermedio')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [venueId, setVenueId] = useState('')
  const [colorA, setColorA] = useState('#16a34a')
  const [colorB, setColorB] = useState('#2563eb')
  const [creating, setCreating] = useState(false)
  const [internalDialogOpen, setInternalDialogOpen] = useState(false)

  const createDialogOpen = controlledDialogOpen ?? internalDialogOpen
  const setCreateDialogOpen = useCallback(
    (open: boolean) => {
      onCreateDialogOpenChange?.(open)
      if (controlledDialogOpen === undefined) setInternalDialogOpen(open)
    },
    [controlledDialogOpen, onCreateDialogOpenChange]
  )

  const [filterRegionId, setFilterRegionId] = useState('')
  const [filterCityId, setFilterCityId] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterScope, setFilterScope] = useState<'all' | 'mine'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [matches, setMatches] = useState<AdminMatchListItem[]>([])
  const [summary, setSummary] = useState<AdminMatchListSummary | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const regions = useMemo(() => {
    const countries = geo?.countries ?? []
    return countries.flatMap((c) => c.regions.map((r) => ({ id: r.id, name: r.name })))
  }, [geo])

  const createCities = useMemo(() => {
    if (!createRegionId) return []
    const countries = geo?.countries ?? []
    for (const c of countries) {
      const region = c.regions.find((r) => r.id === createRegionId)
      if (region) return region.cities.map((x) => ({ id: x.id, name: x.name }))
    }
    return []
  }, [geo, createRegionId])

  const filterCities = useMemo(() => {
    if (!filterRegionId) return []
    const countries = geo?.countries ?? []
    for (const c of countries) {
      const region = c.regions.find((r) => r.id === filterRegionId)
      if (region) return region.cities.map((x) => ({ id: x.id, name: x.name }))
    }
    return []
  }, [geo, filterRegionId])

  const selectedVenue = venues.find((v) => v.id === venueId) ?? null
  const hasMore = matches.length < total

  const loadMatches = useCallback(
    async (opts?: { append?: boolean; nextOffset?: number }) => {
      const append = opts?.append ?? false
      const nextOffset = opts?.nextOffset ?? 0
      if (append) setLoadingMore(true)
      else setLoadingMatches(true)
      try {
        const params = new URLSearchParams({
          limit: '50',
          offset: String(nextOffset),
          status: filterStatus,
          type: filterType,
          scope: filterScope,
        })
        if (filterRegionId) params.set('regionId', filterRegionId)
        if (filterCityId) params.set('cityId', filterCityId)
        if (searchQuery) params.set('search', searchQuery)

        const r = await adminBearerFetch(`/api/admin/matches?${params}`)
        const j = (await r.json()) as MatchesApiResponse
        if (!r.ok) throw new Error(j.error ?? 'Error al cargar partidos')

        setSummary(j.summary)
        setTotal(j.total)
        setOffset(nextOffset)
        setMatches((prev) => (append ? [...prev, ...j.matches] : j.matches))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al cargar partidos')
        if (!append) {
          setMatches([])
          setSummary(null)
          setTotal(0)
        }
      } finally {
        setLoadingMatches(false)
        setLoadingMore(false)
      }
    },
    [filterRegionId, filterCityId, filterStatus, filterType, filterScope, searchQuery]
  )

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const sb = getBrowserSupabase()
    if (!sb) return
    void fetchGeoCatalogActive(sb).then((data) => setGeo(data))
  }, [])

  useEffect(() => {
    void loadMatches()
  }, [loadMatches])

  useEffect(() => {
    if (!createCityId) {
      setVenues([])
      setVenueId('')
      return
    }
    const sb = getBrowserSupabase()
    if (!sb) return
    void fetchSportsVenuesInCity(sb, createCityId).then((rows) => {
      setVenues(rows)
      if (!rows.some((v) => v.id === venueId)) {
        setVenueId(rows[0]?.id ?? '')
      }
    })
  }, [createCityId, venueId])

  const openMatchDetail = (matchId: string) => {
    setSelectedMatchOpportunityId(matchId)
    setCurrentScreen('matchDetails')
  }

  const resetCreateForm = useCallback(() => {
    setCreateRegionId('')
    setCreateCityId('')
    setVenues([])
    setVenueId('')
    setMode('open')
    setLevel('intermedio')
    setTitle('')
    setDescription('')
    setDate('')
    setTime('')
    setColorA('#16a34a')
    setColorB('#2563eb')
  }, [])

  const createAdminMatch = async () => {
    if (!selectedVenue || !date || !time) {
      toast.error('Completa región, ciudad, centro, fecha y hora.')
      return
    }
    const sb = getBrowserSupabase()
    if (!sb) return
    setCreating(true)
    try {
      const dt = new Date(`${date}T${time}`).toISOString()
      if (mode === 'open') {
        const { data, error } = await sb.rpc(
          'create_match_opportunity_with_optional_reservation',
          {
            p_type: 'open',
            p_title: title.trim() || 'Revuelta Sportmatch',
            p_description: description.trim() || null,
            p_location: selectedVenue.city,
            p_venue: selectedVenue.name,
            p_city_id: selectedVenue.cityId,
            p_date_time: dt,
            p_level: level,
            p_team_name: null,
            p_players_needed: 12,
            p_players_joined: 0,
            p_players_seek_profile: null,
            p_gender: 'male',
            p_status: 'pending',
            p_sports_venue_id: selectedVenue.id,
            p_book_court_slot: true,
            p_court_slot_minutes: selectedVenue.slotDurationMinutes ?? 60,
            p_private_revuelta_team_id: null,
            p_creator_is_goalkeeper: false,
          }
        )
        if (error) {
          toast.error(error.message)
          return
        }
        const payload = data as { ok?: boolean; matchId?: string; message?: string } | null
        if (!payload?.ok) {
          toast.error(payload?.message || 'No se pudo crear el partido.')
          return
        }
      } else {
        const { data, error } = await sb.rpc('create_team_pick_match_opportunity', {
          p_type: mode,
          p_title:
            title.trim() ||
            (mode === 'team_pick_public'
              ? 'Selección de equipos Sportmatch'
              : 'Selección privada Sportmatch'),
          p_description: description.trim() || null,
          p_location: selectedVenue.city,
          p_venue: selectedVenue.name,
          p_city_id: selectedVenue.cityId,
          p_date_time: dt,
          p_level: level,
          p_gender: 'male',
          p_status: 'pending',
          p_sports_venue_id: selectedVenue.id,
          p_book_court_slot: true,
          p_court_slot_minutes: selectedVenue.slotDurationMinutes ?? 60,
          p_creator_encounter_role: 'delantero',
          p_team_pick_color_a: colorA,
          p_team_pick_color_b: colorB,
        })
        if (error) {
          toast.error(error.message)
          return
        }
        const payload = data as { ok?: boolean; message?: string } | null
        if (!payload?.ok) {
          toast.error(payload?.message || 'No se pudo crear el partido.')
          return
        }
      }

      toast.success('Partido Sportmatch creado.')
      resetCreateForm()
      setCreateDialogOpen(false)
      await loadMatches()
    } finally {
      setCreating(false)
    }
  }

  const applySearch = () => {
    setSearchQuery(searchInput.trim())
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-gradient-to-br from-primary/[0.07] via-card to-card p-4 ring-1 ring-black/[0.04] dark:ring-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <LayoutGrid className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-brand-heading text-base tracking-tight text-foreground">
              Centro de partidos — vista global
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-2xl">
              Explora todos los partidos de la plataforma, filtra por región, estado y resultado, y
              publica encuentros desde la cuenta admin cuando lo necesites.
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="font-brand shrink-0 gap-1.5"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Crear partido admin
        </Button>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Total" value={summary.total} icon={<Trophy className="h-4 w-4" />} tone="slate" />
          <KpiCard label="Próximos" value={summary.upcoming} icon={<CalendarClock className="h-4 w-4" />} tone="sky" />
          <KpiCard label="Activos" value={summary.active} icon={<Users className="h-4 w-4" />} tone="sky" />
          <KpiCard label="Finalizados" value={summary.completed} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
          <KpiCard label="Suspendidos" value={summary.suspended} icon={<PauseCircle className="h-4 w-4" />} tone="amber" />
        </div>
      ) : null}

      <div className="space-y-4">
          <Card className="overflow-hidden border-border shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <CardHeader className="border-b border-border/80 bg-muted/20 px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    <CardTitle className="text-lg">Explorar partidos</CardTitle>
                  </div>
                  <CardDescription className="text-xs sm:text-sm">
                    {total > 0
                      ? `${total} partido${total === 1 ? '' : 's'} según filtros actuales`
                      : 'Sin resultados con los filtros actuales'}
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={loadingMatches}
                  onClick={() => void loadMatches()}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loadingMatches && 'animate-spin')} />
                  Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Región</Label>
                  <Select
                    value={filterRegionId || 'all'}
                    onValueChange={(v) => {
                      setFilterRegionId(v === 'all' ? '' : v)
                      setFilterCityId('')
                    }}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las regiones</SelectItem>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ciudad</Label>
                  <Select
                    value={filterCityId || 'all'}
                    onValueChange={(v) => setFilterCityId(v === 'all' ? '' : v)}
                    disabled={!filterRegionId}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las ciudades</SelectItem>
                      {filterCities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Estado</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_FILTER_OPTIONS.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Modo de partido</Label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_FILTER_OPTIONS.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alcance</Label>
                  <Select
                    value={filterScope}
                    onValueChange={(v) => setFilterScope(v as 'all' | 'mine')}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los usuarios</SelectItem>
                      <SelectItem value="mine">Solo cuenta admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label className="text-xs">Buscar</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-10 bg-background pl-8"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Título, centro o ciudad…"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') applySearch()
                        }}
                      />
                    </div>
                    <Button type="button" variant="secondary" className="h-10 shrink-0" onClick={applySearch}>
                      Buscar
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <CardContent className="p-0">
              {loadingMatches ? (
                <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Cargando partidos…
                </div>
              ) : matches.length === 0 ? (
                <div className="px-4 py-16 text-center">
                  <p className="font-brand-heading text-sm text-foreground">No hay partidos</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prueba ampliar filtros o cambiar región/ciudad.
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[920px] text-left text-sm">
                      <thead className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">Partido</th>
                          <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Modo</th>
                          <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Ubicación</th>
                          <th className="px-3 py-2.5 font-medium">Fecha</th>
                          <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Jugadores</th>
                          <th className="hidden px-3 py-2.5 font-medium md:table-cell">Organizador</th>
                          <th className="px-3 py-2.5 font-medium">Estado / Resultado</th>
                          <th className="px-3 py-2.5 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {matches.map((m) => (
                          <MatchRow key={m.id} match={m} onOpen={openMatchDetail} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="space-y-3 p-4 md:hidden">
                    {matches.map((m) => (
                      <MatchCardMobile key={m.id} match={m} onOpen={openMatchDetail} />
                    ))}
                  </ul>

                  {hasMore ? (
                    <div className="border-t border-border px-4 py-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={loadingMore}
                        onClick={() => void loadMatches({ append: true, nextOffset: offset + 50 })}
                      >
                        {loadingMore ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Cargando…
                          </>
                        ) : (
                          `Cargar más (${matches.length} de ${total})`
                        )}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
      </div>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open && !creating) resetCreateForm()
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-primary" aria-hidden />
              <DialogTitle className="font-brand-heading text-lg">Nuevo partido admin</DialogTitle>
            </div>
            <DialogDescription>
              Publica revueltas o selección de equipos con reserva de cancha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="font-brand-heading mb-3 text-xs uppercase tracking-wide text-muted-foreground">
                Ubicación
              </p>
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Región</Label>
                  <Select value={createRegionId || undefined} onValueChange={setCreateRegionId}>
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="Selecciona región" />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ciudad</Label>
                  <Select
                    value={createCityId || undefined}
                    onValueChange={setCreateCityId}
                    disabled={!createRegionId}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="Selecciona ciudad" />
                    </SelectTrigger>
                    <SelectContent>
                      {createCities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Centro deportivo</Label>
                  <Select
                    value={venueId || undefined}
                    onValueChange={setVenueId}
                    disabled={!createCityId}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="Selecciona centro" />
                    </SelectTrigger>
                    <SelectContent>
                      {venues.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} — {v.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="font-brand-heading mb-3 text-xs uppercase tracking-wide text-muted-foreground">
                Fecha y hora
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha</Label>
                  <Input
                    type="date"
                    className="h-10 bg-background"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Hora</Label>
                  <Input
                    type="time"
                    className="h-10 bg-background"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input
                className="h-10 bg-background"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Revuelta nocturna Sportmatch"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Modo</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as AdminMatchType)}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Revuelta</SelectItem>
                    <SelectItem value="team_pick_public">Selección pública</SelectItem>
                    <SelectItem value="team_pick_private">Selección privada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nivel</Label>
                <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>
                        {lvl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {mode !== 'open' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Color equipo A</Label>
                  <Input
                    className="h-10 bg-background font-mono text-sm"
                    value={colorA}
                    onChange={(e) => setColorA(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color equipo B</Label>
                  <Input
                    className="h-10 bg-background font-mono text-sm"
                    value={colorB}
                    onChange={(e) => setColorB(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-xs">Descripción (opcional)</Label>
              <Textarea
                className="min-h-[72px] resize-y bg-background"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles para los jugadores…"
              />
            </div>

            <Button
              type="button"
              className="font-brand w-full"
              onClick={() => void createAdminMatch()}
              disabled={creating}
            >
              {creating ? 'Publicando…' : 'Publicar partido Sportmatch'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
