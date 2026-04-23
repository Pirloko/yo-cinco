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
import { useAppAuth } from '@/lib/app-context'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  fetchGeoCatalogActive,
  type GeoCatalogActive,
} from '@/lib/supabase/geo-queries'
import { fetchSportsVenuesInCity } from '@/lib/supabase/venue-queries'
import {
  fetchMatchOpportunityParticipantLeaveReasons,
  fetchParticipantsForOpportunity,
  type OpportunityParticipantRow,
} from '@/lib/supabase/message-queries'
import type { EncounterLineupRole, Level, SportsVenue } from '@/lib/types'

type AdminMatchType = 'open' | 'team_pick_public' | 'team_pick_private'
type MatchMeta = {
  id: string
  type: AdminMatchType
  title: string
  cityId: string
  location: string
  venue: string
  dateTime: string
  teamPickColorA?: string | null
  teamPickColorB?: string | null
}

const LEVEL_OPTIONS: Level[] = ['principiante', 'intermedio', 'avanzado', 'competitivo']
const ROLE_OPTIONS: EncounterLineupRole[] = ['gk', 'defensa', 'mediocampista', 'delantero']

function modeLabel(mode: AdminMatchType) {
  if (mode === 'open') return 'Revuelta'
  if (mode === 'team_pick_public') return 'Selección de equipos (pública)'
  return 'Selección de equipos (privada)'
}

export function AdminMatchManagementPanel() {
  const [geo, setGeo] = useState<GeoCatalogActive | null>(null)
  const [regionId, setRegionId] = useState('')
  const [cityId, setCityId] = useState('')
  const [venues, setVenues] = useState<SportsVenue[]>([])

  const [mode, setMode] = useState<AdminMatchType>('open')
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState<Level>('intermedio')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [venueId, setVenueId] = useState('')
  const [description, setDescription] = useState('')
  const [colorA, setColorA] = useState('#16a34a')
  const [colorB, setColorB] = useState('#2563eb')
  const [creating, setCreating] = useState(false)

  const [manageId, setManageId] = useState('')
  const [manageLoading, setManageLoading] = useState(false)
  const [meta, setMeta] = useState<MatchMeta | null>(null)
  const [participants, setParticipants] = useState<OpportunityParticipantRow[]>([])

  const [resVenueId, setResVenueId] = useState('')
  const [resDate, setResDate] = useState('')
  const [resTime, setResTime] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [adminMatches, setAdminMatches] = useState<MatchMeta[]>([])
  const [loadingAdminMatches, setLoadingAdminMatches] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [suspending, setSuspending] = useState(false)
  const [finalizeResult, setFinalizeResult] = useState<'team_a' | 'team_b' | 'draw'>('draw')
  const [finalizing, setFinalizing] = useState(false)
  const { currentUser } = useAppAuth()

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

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const sb = getBrowserSupabase()
    if (!sb) return
    void fetchGeoCatalogActive(sb).then((data) => setGeo(data))
  }, [])

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

  useEffect(() => {
    if (!meta || venues.length === 0) return
    if (resVenueId && venues.some((v) => v.id === resVenueId)) return
    const byName = venues.find((v) => v.name === meta.venue)
    setResVenueId(byName?.id ?? venues[0]?.id ?? '')
  }, [meta, venues, resVenueId])

  const selectedVenue = venues.find((v) => v.id === venueId) ?? null

  const loadAdminMatches = async () => {
    if (!currentUser?.id) return
    const sb = getBrowserSupabase()
    if (!sb) return
    setLoadingAdminMatches(true)
    try {
      const { data, error } = await sb
        .from('match_opportunities')
        .select(
          'id, type, title, city_id, location, venue, date_time, team_pick_color_a, team_pick_color_b'
        )
        .eq('creator_id', currentUser.id)
        .in('type', ['open', 'team_pick_public', 'team_pick_private'])
        .order('date_time', { ascending: false })
        .limit(30)
      if (error) {
        toast.error(error.message)
        return
      }
      const mapped: MatchMeta[] = (data ?? []).map((row) => ({
        id: row.id as string,
        type: row.type as AdminMatchType,
        title: (row.title as string) ?? 'Partido',
        cityId: (row.city_id as string) ?? '',
        location: (row.location as string) ?? '',
        venue: (row.venue as string) ?? '',
        dateTime: (row.date_time as string) ?? '',
        teamPickColorA: (row.team_pick_color_a as string | null) ?? null,
        teamPickColorB: (row.team_pick_color_b as string | null) ?? null,
      }))
      setAdminMatches(mapped)
    } finally {
      setLoadingAdminMatches(false)
    }
  }

  useEffect(() => {
    void loadAdminMatches()
  }, [currentUser?.id])

  const createAdminMatch = async () => {
    if (!selectedVenue || !date || !time) {
      toast.error('Completa región, ciudad, centro, fecha y hora.')
      return
    }
    const sb = getBrowserSupabase()
    if (!sb) return
    const dt = new Date(`${date}T${time}`).toISOString()
    setCreating(true)
    try {
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
        if (payload.matchId) setManageId(payload.matchId)
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
          // Requerido por RPC legacy, pero no aplica porque admin no participa.
          p_creator_encounter_role: 'delantero',
          p_team_pick_color_a: colorA,
          p_team_pick_color_b: colorB,
        })
        if (error) {
          toast.error(error.message)
          return
        }
        const payload = data as { ok?: boolean; matchId?: string; message?: string } | null
        if (!payload?.ok) {
          toast.error(payload?.message || 'No se pudo crear el partido.')
          return
        }
        if (payload.matchId) setManageId(payload.matchId)
      }
      toast.success('Partido Sportmatch creado.')
      setTitle('')
      setDescription('')
      await loadAdminMatches()
    } finally {
      setCreating(false)
    }
  }

  const loadMatch = async (explicitId?: string) => {
    const id = (explicitId ?? manageId).trim()
    if (!id) return
    const sb = getBrowserSupabase()
    if (!sb) return
    setManageLoading(true)
    try {
      const { data: mo, error: moErr } = await sb
        .from('match_opportunities')
        .select(
          'id, type, title, city_id, location, venue, date_time, team_pick_color_a, team_pick_color_b'
        )
        .eq('id', id)
        .maybeSingle()
      if (moErr || !mo) {
        toast.error(moErr?.message || 'Partido no encontrado')
        return
      }
      const typed: MatchMeta = {
        id: mo.id as string,
        type: mo.type as AdminMatchType,
        title: (mo.title as string) ?? 'Partido',
        cityId: (mo.city_id as string) ?? '',
        location: (mo.location as string) ?? '',
        venue: (mo.venue as string) ?? '',
        dateTime: (mo.date_time as string) ?? '',
        teamPickColorA: (mo.team_pick_color_a as string | null) ?? null,
        teamPickColorB: (mo.team_pick_color_b as string | null) ?? null,
      }
      setMeta(typed)
      if (typed.cityId) {
        setCityId(typed.cityId)
        const countries = geo?.countries ?? []
        for (const c of countries) {
          for (const r of c.regions) {
            if (r.cities.some((city) => city.id === typed.cityId)) {
              setRegionId(r.id)
              break
            }
          }
        }
      }
      setColorA((typed.teamPickColorA || '#16a34a').toLowerCase())
      setColorB((typed.teamPickColorB || '#2563eb').toLowerCase())
      const [rows, reasons] = await Promise.all([
        fetchParticipantsForOpportunity(sb, id),
        fetchMatchOpportunityParticipantLeaveReasons(sb, id),
      ])
      const merged = rows.map((r) => ({
        ...r,
        cancelledReason: reasons.get(r.id)?.cancelledReason ?? r.cancelledReason ?? null,
      }))
      setParticipants(merged)
      setResDate(typed.dateTime ? typed.dateTime.slice(0, 10) : '')
      setResTime(typed.dateTime ? typed.dateTime.slice(11, 16) : '')
    } finally {
      setManageLoading(false)
    }
  }

  const moveParticipant = async (
    userId: string,
    pickTeam: 'A' | 'B',
    encounterRole: EncounterLineupRole
  ) => {
    if (!meta) return
    const sb = getBrowserSupabase()
    if (!sb) return
    const { data, error } = await sb.rpc('set_team_pick_participant_lineup', {
      p_opportunity_id: meta.id,
      p_target_user_id: userId,
      p_pick_team: pickTeam,
      p_encounter_lineup_role: encounterRole,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    const ok = (data as { ok?: boolean; error?: string })?.ok
    if (!ok) {
      toast.error('No se pudo actualizar ese jugador.')
      return
    }
    await loadMatch()
  }

  const removeParticipant = async (userId: string) => {
    if (!meta) return
    const sb = getBrowserSupabase()
    if (!sb) return
    const { data, error } = await sb.rpc('organizer_remove_team_pick_participant', {
      p_opportunity_id: meta.id,
      p_target_user_id: userId,
      p_reason: 'Ajuste de organización Sportmatch',
    })
    if (error) {
      toast.error(error.message)
      return
    }
    const ok = (data as { ok?: boolean })?.ok
    if (!ok) {
      toast.error('No se pudo quitar al participante.')
      return
    }
    await loadMatch()
  }

  const saveTeamColors = async () => {
    if (!meta) return
    if (!/^#[0-9A-Fa-f]{6}$/.test(colorA) || !/^#[0-9A-Fa-f]{6}$/.test(colorB)) {
      toast.error('Los colores deben estar en formato #RRGGBB.')
      return
    }
    const sb = getBrowserSupabase()
    if (!sb) return
    const { error } = await sb
      .from('match_opportunities')
      .update({
        team_pick_color_a: colorA.toLowerCase(),
        team_pick_color_b: colorB.toLowerCase(),
      })
      .eq('id', meta.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Colores actualizados.')
    await loadMatch()
  }

  const rescheduleMatch = async () => {
    if (!meta || !resVenueId || !resDate || !resTime) {
      toast.error('Completa centro deportivo, fecha y hora.')
      return
    }
    const sb = getBrowserSupabase()
    if (!sb) return
    const resVenue = venues.find((v) => v.id === resVenueId)
    if (!resVenue) {
      toast.error('Selecciona un centro válido.')
      return
    }
    setRescheduling(true)
    try {
      const { error } = await sb.rpc('reschedule_match_opportunity_with_reason', {
        p_opportunity_id: meta.id,
        p_new_venue: resVenue.name,
        p_new_location: resVenue.city,
        p_new_date_time: new Date(`${resDate}T${resTime}`).toISOString(),
        p_reason: 'Ajuste operativo Sportmatch',
      })
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Partido reprogramado.')
      await loadMatch()
      await loadAdminMatches()
    } finally {
      setRescheduling(false)
    }
  }

  const suspendMatch = async () => {
    if (!meta) return
    const note = suspendReason.trim()
    if (note.length < 5) {
      toast.error('Escribe un motivo de al menos 5 caracteres.')
      return
    }
    const sb = getBrowserSupabase()
    if (!sb) return
    setSuspending(true)
    try {
      const { data, error } = await sb.rpc('cancel_match_opportunity_with_reason', {
        p_opportunity_id: meta.id,
        p_reason: note,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      const ok = (data as { ok?: boolean })?.ok
      if (!ok) {
        toast.error('No se pudo suspender/cancelar el partido.')
        return
      }
      toast.success('Partido suspendido/cancelado.')
      await loadMatch()
      await loadAdminMatches()
    } finally {
      setSuspending(false)
    }
  }

  const finalizeMatch = async () => {
    if (!meta || meta.type !== 'open') return
    const sb = getBrowserSupabase()
    if (!sb) return
    setFinalizing(true)
    try {
      const { error } = await sb.rpc('finalize_revuelta_match', {
        p_opportunity_id: meta.id,
        p_result: finalizeResult,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Partido finalizado.')
      await loadMatch()
      await loadAdminMatches()
    } finally {
      setFinalizing(false)
    }
  }

  const shouldShowTeamPickActions =
    meta?.type === 'team_pick_public' || meta?.type === 'team_pick_private'

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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Título</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Revuelta nocturna Sportmatch"
              />
            </div>
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
          <CardTitle>Gestionar partido Sportmatch</CardTitle>
          <CardDescription>
            Ver participantes, mover equipos, quitar jugadores y editar horario/centro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Partidos creados por Sportmatch</Label>
            {loadingAdminMatches ? (
              <p className="text-sm text-muted-foreground">Cargando partidos…</p>
            ) : adminMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay partidos creados.</p>
            ) : (
              <div className="grid gap-2">
                {adminMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="rounded-lg border border-border bg-card/40 px-3 py-2 text-left hover:border-primary/40"
                    onClick={() => {
                      setManageId(m.id)
                      void loadMatch(m.id)
                    }}
                  >
                    <p className="text-sm font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {modeLabel(m.type)} - {m.location} - {new Date(m.dateTime).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="UUID del partido"
              value={manageId}
              onChange={(e) => setManageId(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => void loadMatch()} disabled={manageLoading}>
              {manageLoading ? 'Cargando...' : 'Cargar'}
            </Button>
          </div>

          {meta ? (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">{meta.title}</p>
              <p className="text-muted-foreground">
                {modeLabel(meta.type)} - {meta.location} - {meta.venue}
              </p>
              <p className="text-muted-foreground">{new Date(meta.dateTime).toLocaleString()}</p>
            </div>
          ) : null}

          {meta ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Estado del partido</p>
              {meta.type === 'open' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={finalizeResult}
                    onValueChange={(v) => setFinalizeResult(v as 'team_a' | 'team_b' | 'draw')}
                  >
                    <SelectTrigger className="w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="team_a">Gana equipo A</SelectItem>
                      <SelectItem value="team_b">Gana equipo B</SelectItem>
                      <SelectItem value="draw">Empate</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => void finalizeMatch()} disabled={finalizing}>
                    {finalizing ? 'Finalizando...' : 'Finalizar partido'}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Finalización de selección de equipos se maneja desde el flujo operativo del partido.
                </p>
              )}
              <div className="space-y-2">
                <Label>Motivo suspensión/cancelación</Label>
                <Textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Motivo para jugadores (mínimo 5 caracteres)"
                />
                <Button type="button" variant="destructive" onClick={() => void suspendMatch()} disabled={suspending}>
                  {suspending ? 'Suspendiendo...' : 'Suspender / cancelar partido'}
                </Button>
              </div>
            </div>
          ) : null}

          {shouldShowTeamPickActions && meta ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Color A</Label>
                <Input value={colorA} onChange={(e) => setColorA(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Color B</Label>
                <Input value={colorB} onChange={(e) => setColorB(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => void saveTeamColors()}>
                  Guardar colores
                </Button>
              </div>
            </div>
          ) : null}

          {participants.length > 0 ? (
            <ul className="space-y-2">
              {participants.map((p) => (
                <li key={p.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.status} {p.pickTeam ? `- Equipo ${p.pickTeam}` : ''}
                      </p>
                    </div>
                    <Badge variant="secondary">{p.status}</Badge>
                  </div>
                  {p.cancelledReason ? (
                    <p className="mt-1 text-xs text-muted-foreground">Motivo: {p.cancelledReason}</p>
                  ) : null}
                  {shouldShowTeamPickActions && p.status !== 'creator' && p.status !== 'cancelled' ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void moveParticipant(p.id, 'A', p.encounterLineupRole ?? 'delantero')}
                      >
                        Mover a A
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void moveParticipant(p.id, 'B', p.encounterLineupRole ?? 'delantero')}
                      >
                        Mover a B
                      </Button>
                      <Select
                        value={p.encounterLineupRole ?? 'delantero'}
                        onValueChange={(nextRole) =>
                          void moveParticipant(p.id, p.pickTeam ?? 'A', nextRole as EncounterLineupRole)
                        }
                      >
                        <SelectTrigger className="h-8 w-[170px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void removeParticipant(p.id)}
                      >
                        Quitar
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {meta ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Modificar horario / centro deportivo</p>
              <div className="space-y-2">
                <Label>Centro deportivo</Label>
                <Select value={resVenueId || undefined} onValueChange={setResVenueId}>
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
                  <Input type="date" value={resDate} onChange={(e) => setResDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hora</Label>
                  <Input type="time" value={resTime} onChange={(e) => setResTime(e.target.value)} />
                </div>
              </div>
              <Button type="button" onClick={() => void rescheduleMatch()} disabled={rescheduling}>
                {rescheduling ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

