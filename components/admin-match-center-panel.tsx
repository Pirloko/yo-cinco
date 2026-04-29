'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, MapPinned, RefreshCw, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useAppAuth, useAppUI } from '@/lib/app-context'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  fetchGeoCatalogActive,
  type GeoCatalogActive,
} from '@/lib/supabase/geo-queries'
import { fetchSportsVenuesInCity } from '@/lib/supabase/venue-queries'
import type { Level, SportsVenue } from '@/lib/types'
import { cn } from '@/lib/utils'

type AdminMatchType = 'open' | 'team_pick_public' | 'team_pick_private'
type AdminMatchRow = {
  id: string
  type: AdminMatchType
  title: string
  cityId: string
  location: string
  venue: string
  dateTime: string
}

const LEVEL_OPTIONS: Level[] = ['principiante', 'intermedio', 'avanzado', 'competitivo']

function modeLabel(mode: AdminMatchType) {
  if (mode === 'open') return 'Revuelta'
  if (mode === 'team_pick_public') return 'Selección pública'
  return 'Selección privada'
}

export function AdminMatchCenterPanel() {
  const { currentUser } = useAppAuth()
  const { setCurrentScreen, setSelectedMatchOpportunityId } = useAppUI()

  const [geo, setGeo] = useState<GeoCatalogActive | null>(null)
  const [regionId, setRegionId] = useState('')
  const [cityId, setCityId] = useState('')
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

  const [adminMatches, setAdminMatches] = useState<AdminMatchRow[]>([])
  const [loadingAdminMatches, setLoadingAdminMatches] = useState(false)

  const regions = useMemo(() => {
    const countries = geo?.countries ?? []
    return countries.flatMap((c) => c.regions.map((r) => ({ id: r.id, name: r.name })))
  }, [geo])

  const cities = useMemo(() => {
    if (!regionId) return []
    const countries = geo?.countries ?? []
    for (const c of countries) {
      const region = c.regions.find((r) => r.id === regionId)
      if (region) return region.cities.map((x) => ({ id: x.id, name: x.name }))
    }
    return []
  }, [geo, regionId])

  const selectedVenue = venues.find((v) => v.id === venueId) ?? null

  const loadAdminMatches = useCallback(async () => {
    if (!currentUser?.id) return
    const sb = getBrowserSupabase()
    if (!sb) return
    setLoadingAdminMatches(true)
    try {
      const { data, error } = await sb
        .from('match_opportunities')
        .select('id, type, title, city_id, location, venue, date_time')
        .eq('creator_id', currentUser.id)
        .in('type', ['open', 'team_pick_public', 'team_pick_private'])
        .order('date_time', { ascending: false })
        .limit(40)
      if (error) {
        toast.error(error.message)
        return
      }
      const mapped: AdminMatchRow[] = (data ?? []).map((row) => ({
        id: row.id as string,
        type: row.type as AdminMatchType,
        title: (row.title as string) ?? 'Partido',
        cityId: (row.city_id as string) ?? '',
        location: (row.location as string) ?? '',
        venue: (row.venue as string) ?? '',
        dateTime: (row.date_time as string) ?? '',
      }))
      setAdminMatches(mapped)
    } finally {
      setLoadingAdminMatches(false)
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const sb = getBrowserSupabase()
    if (!sb) return
    void fetchGeoCatalogActive(sb).then((data) => setGeo(data))
  }, [])

  useEffect(() => {
    void loadAdminMatches()
  }, [loadAdminMatches])

  useEffect(() => {
    if (!cityId) {
      setVenues([])
      setVenueId('')
      return
    }
    const sb = getBrowserSupabase()
    if (!sb) return
    void fetchSportsVenuesInCity(sb, cityId).then((rows) => {
      setVenues(rows)
      if (!rows.some((v) => v.id === venueId)) {
        setVenueId(rows[0]?.id ?? '')
      }
    })
  }, [cityId, venueId])

  const openMatchDetail = (matchId: string) => {
    setSelectedMatchOpportunityId(matchId)
    setCurrentScreen('matchDetails')
  }

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
          // Requerido por RPC actual, pero admin no participa (migración aplicada).
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
      setTitle('')
      setDescription('')
      await loadAdminMatches()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-gradient-to-br from-muted/50 via-card to-card p-4 ring-1 ring-black/[0.04] dark:ring-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Trophy className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold tracking-tight text-foreground">
              Partidos creados por la cuenta admin
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-2xl">
              Publica revueltas o partidos con selección de equipos y gestiona cada uno desde el
              mismo detalle que ven organizadores y jugadores en la app.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <Card className="overflow-hidden border-border shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <CardHeader className="space-y-1 border-b border-border/80 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-lg">Nuevo partido</CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              Elige ubicación, fecha y modo. Se reserva cancha según la configuración del centro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-4 sm:p-6">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ubicación
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Región</Label>
                  <Select value={regionId || undefined} onValueChange={setRegionId}>
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
                    value={cityId || undefined}
                    onValueChange={setCityId}
                    disabled={!regionId}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="Selecciona ciudad" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label className="text-xs">Centro deportivo</Label>
                <Select value={venueId || undefined} onValueChange={setVenueId} disabled={!cityId}>
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

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                <Label className="text-xs">Modo de partido</Label>
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
                className="min-h-[88px] resize-y bg-background"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles para los jugadores…"
              />
            </div>

            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => void createAdminMatch()}
              disabled={creating}
            >
              {creating ? 'Publicando…' : 'Publicar partido Sportmatch'}
            </Button>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <CardHeader className="flex flex-col gap-3 border-b border-border/80 bg-muted/25 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <CardTitle className="text-lg">Tus partidos publicados</CardTitle>
              </div>
              <CardDescription className="text-xs sm:text-sm">
                Más recientes primero. Abre el detalle para participantes, equipos y moderación.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={loadingAdminMatches || !currentUser?.id}
              onClick={() => void loadAdminMatches()}
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', loadingAdminMatches && 'animate-spin')}
              />
              Actualizar
            </Button>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {loadingAdminMatches ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Cargando partidos…
              </p>
            ) : adminMatches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">Aún no hay partidos</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Usa el bloque «Nuevo partido» en esta misma pantalla para publicar el primero.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {adminMatches.map((m) => {
                  const when = (() => {
                    try {
                      return new Date(m.dateTime).toLocaleString('es-CL', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    } catch {
                      return m.dateTime
                    }
                  })()
                  return (
                    <li
                      key={m.id}
                      className="rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm transition-colors hover:border-primary/25 hover:bg-muted/20"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium leading-snug text-foreground">{m.title}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/80">{m.location}</span>
                            {m.venue ? (
                              <>
                                {' '}
                                · <span>{m.venue}</span>
                              </>
                            ) : null}
                          </p>
                          <p className="text-xs tabular-nums text-muted-foreground">{when}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-col sm:items-end">
                          <Badge variant="secondary" className="font-normal">
                            {modeLabel(m.type)}
                          </Badge>
                          <Button type="button" size="sm" onClick={() => openMatchDetail(m.id)}>
                            Abrir detalle
                          </Button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

