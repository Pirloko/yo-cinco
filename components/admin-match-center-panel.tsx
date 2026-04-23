'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
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

  const loadAdminMatches = async () => {
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
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const sb = getBrowserSupabase()
    if (!sb) return
    void fetchGeoCatalogActive(sb).then((data) => setGeo(data))
  }, [])

  useEffect(() => {
    if (!currentUser?.id) return
    void loadAdminMatches()
  }, [currentUser?.id])

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
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle>Crear partido Sportmatch (admin)</CardTitle>
          <CardDescription>
            Flujo exclusivo admin: región, ciudad, centro, fecha/hora y modo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Región</Label>
              <Select value={regionId || undefined} onValueChange={setRegionId}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label>Ciudad</Label>
              <Select value={cityId || undefined} onValueChange={setCityId} disabled={!regionId}>
                <SelectTrigger>
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
          <div className="space-y-2">
            <Label>Centro deportivo</Label>
            <Select value={venueId || undefined} onValueChange={setVenueId} disabled={!cityId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona centro" />
              </SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} - {v.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Revuelta nocturna Sportmatch"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Modo de partido</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as AdminMatchType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Revuelta</SelectItem>
                  <SelectItem value="team_pick_public">Selección pública</SelectItem>
                  <SelectItem value="team_pick_private">Selección privada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nivel</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
                <SelectTrigger>
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
              <div className="space-y-2">
                <Label>Color equipo A</Label>
                <Input value={colorA} onChange={(e) => setColorA(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Color equipo B</Label>
                <Input value={colorB} onChange={(e) => setColorB(e.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Descripción (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles para los jugadores..."
            />
          </div>
          <Button type="button" onClick={() => void createAdminMatch()} disabled={creating}>
            {creating ? 'Publicando...' : 'Publicar partido Sportmatch'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Partidos creados por Sportmatch</CardTitle>
          <CardDescription>
            Abre el detalle del partido para gestionarlo con la misma experiencia visual del
            organizador/jugador (participantes, equipos, suspensión, reprogramación, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAdminMatches ? (
            <p className="text-sm text-muted-foreground">Cargando partidos…</p>
          ) : adminMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay partidos creados.</p>
          ) : (
            <div className="space-y-2">
              {adminMatches.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-border bg-card/40 px-3 py-2.5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {modeLabel(m.type)} - {m.location} -{' '}
                        {new Date(m.dateTime).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{modeLabel(m.type)}</Badge>
                      <Button type="button" size="sm" onClick={() => openMatchDetail(m.id)}>
                        Abrir detalle
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

