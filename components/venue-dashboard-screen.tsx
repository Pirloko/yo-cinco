'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/lib/app-context'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  fetchVenueForOwner,
  fetchVenueCourts,
  fetchVenueWeeklyHours,
  fetchVenueReservationsRange,
} from '@/lib/supabase/venue-queries'
import { GeoLocationSelect } from '@/components/geo-location-select'
import { resolveCityIdFromLabel } from '@/lib/supabase/geo-queries'
import type { SportsVenue, VenueCourt, VenueWeeklyHour } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Calendar,
  Clock,
  LayoutGrid,
  Link2,
  LogOut,
  MessageCircle,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react'
import { WEEKDAY_SHORT_ES } from '@/lib/venue-slots'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { ThemeMenuButton } from '@/components/theme-controls'

type DayHours = { open: string; close: string } | null

function toPgTime(hhmm: string): string {
  const x = hhmm.trim()
  if (/^\d{1,2}:\d{2}$/.test(x)) {
    const [h, m] = x.split(':')
    return `${h.padStart(2, '0')}:${m}:00`
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(x)) return x
  return `${x}:00`
}

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function VenueDashboardScreen() {
  const { currentUser, logout } = useApp()
  const [tab, setTab] = useState<'bookings' | 'profile' | 'courts' | 'hours'>(
    'bookings'
  )
  const [venue, setVenue] = useState<SportsVenue | null>(null)
  const [courts, setCourts] = useState<VenueCourt[]>([])
  const [weeklyLoaded, setWeeklyLoaded] = useState<VenueWeeklyHour[]>([])
  const [loading, setLoading] = useState(true)
  const [dayStr, setDayStr] = useState(() => toDateInputValue(new Date()))
  const [reservations, setReservations] = useState<
    Awaited<ReturnType<typeof fetchVenueReservationsRange>>
  >([])
  const [matchById, setMatchById] = useState<
    Map<string, { id: string; title: string; creatorId: string }>
  >(new Map())
  const [organizerById, setOrganizerById] = useState<
    Map<string, { id: string; name: string; whatsappPhone: string | null }>
  >(new Map())

  const [profileForm, setProfileForm] = useState({
    name: '',
    address: '',
    mapsUrl: '',
    phone: '',
    city: '',
    cityId: '',
    slotDurationMinutes: 60,
  })

  const [hoursByDay, setHoursByDay] = useState<Record<number, DayHours>>(() => {
    const o: Record<number, DayHours> = {}
    for (let d = 0; d <= 6; d++) o[d] = null
    return o
  })

  const [newCourtName, setNewCourtName] = useState('')
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualForm, setManualForm] = useState({
    courtId: '',
    time: '20:00',
    durationMinutes: 60,
    clientName: '',
    clientPhone: '',
    status: 'pending' as 'pending' | 'confirmed',
    note: '',
  })

  const reloadAll = useCallback(async () => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = createClient()
    const v = await fetchVenueForOwner(supabase, currentUser.id)
    setVenue(v)
    if (!v) {
      setCourts([])
      setWeeklyLoaded([])
      return
    }
    const [cList, wList] = await Promise.all([
      fetchVenueCourts(supabase, v.id),
      fetchVenueWeeklyHours(supabase, v.id),
    ])
    setCourts(cList)
    setWeeklyLoaded(wList)
    setProfileForm({
      name: v.name,
      address: v.address,
      mapsUrl: v.mapsUrl ?? '',
      phone: v.phone,
      city: v.city,
      cityId: v.cityId,
      slotDurationMinutes: v.slotDurationMinutes,
    })
    const hb: Record<number, DayHours> = {}
    for (let d = 0; d <= 6; d++) hb[d] = null
    for (const h of wList) {
      hb[h.dayOfWeek] = { open: h.openTime, close: h.closeTime }
    }
    setHoursByDay(hb)
  }, [currentUser])

  useEffect(() => {
    let ok = true
    ;(async () => {
      setLoading(true)
      await reloadAll()
      if (ok) setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [reloadAll])

  useEffect(() => {
    if (!venue || !isSupabaseConfigured()) return
    const supabase = createClient()
    const d = new Date(dayStr + 'T12:00:00')
    const start = new Date(d)
    start.setHours(0, 0, 0, 0)
    const end = new Date(d)
    end.setHours(23, 59, 59, 999)
    let cancelled = false
    void (async () => {
      const list = await fetchVenueReservationsRange(
        supabase,
        venue.id,
        start.toISOString(),
        end.toISOString()
      )
      if (cancelled) return
      setReservations(list)

      const matchIds = [...new Set((list ?? []).map((r) => r.matchOpportunityId).filter(Boolean))] as string[]
      const mMap = new Map<string, { id: string; title: string; creatorId: string }>()
      const contactIds = new Set<string>()
      const fallbackBookerIds = new Set<string>()
      for (const r of list ?? []) {
        if (r.bookerUserId) fallbackBookerIds.add(r.bookerUserId)
      }

      if (matchIds.length > 0) {
        const { data: matches } = await supabase
          .from('match_opportunities')
          .select('id, title, creator_id')
          .in('id', matchIds)
        for (const m of matches ?? []) {
          const id = m.id as string
          const creatorId = m.creator_id as string
          contactIds.add(creatorId)
          mMap.set(id, { id, title: (m.title as string) ?? 'Partido', creatorId })
        }
      }
      setMatchById(mMap)

      for (const id of fallbackBookerIds) contactIds.add(id)
      if (contactIds.size === 0) {
        setOrganizerById(new Map())
        return
      }
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, name, whatsapp_phone')
        .in('id', [...contactIds])
      const pMap = new Map<string, { id: string; name: string; whatsappPhone: string | null }>()
      for (const p of profs ?? []) {
        pMap.set(p.id as string, {
          id: p.id as string,
          name: (p.name as string) ?? 'Organizador',
          whatsappPhone: (p.whatsapp_phone as string | null) ?? null,
        })
      }
      setOrganizerById(pMap)
    })()
    return () => {
      cancelled = true
    }
  }, [venue, dayStr])

  const formatWhatsAppLink = (raw: string, message: string) => {
    const digits = raw.replace(/\D/g, '')
    const text = encodeURIComponent(message)
    return `https://wa.me/${digits}?text=${text}`
  }

  const setReservationPayment = async (
    reservationId: string,
    payload: Record<string, unknown>
  ) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('venue_reservations')
      .update(payload)
      .eq('id', reservationId)
    if (error) {
      toast.error(error.message)
      return false
    }
    return true
  }

  const confirmReservation = async (id: string) => {
    if (!confirm('¿Confirmar esta reserva? (pago recibido)')) return
    const ok = await setReservationPayment(id, {
      status: 'confirmed',
      payment_status: 'paid',
      confirmation_source: 'venue_owner',
      confirmed_by_user_id: currentUser?.id ?? null,
      confirmation_note: 'Confirmada por centro deportivo',
    })
    if (!ok) return
    toast.success('Reserva confirmada')
    await reloadAll()
  }

  const cancelReservation = async (id: string) => {
    const reason = prompt(
      'Motivo de cancelación (el organizador lo verá en su historial):',
      'No se recibió el pago a tiempo'
    )
    if (!reason) return
    const ok = await setReservationPayment(id, {
      status: 'cancelled',
      cancelled_reason: reason,
    })
    if (!ok) return
    toast.success('Reserva cancelada')
    await reloadAll()
  }

  const createManualReservation = async () => {
    if (!venue || !isSupabaseConfigured()) return
    if (!manualForm.courtId) {
      toast.error('Selecciona una cancha para la reserva manual.')
      return
    }
    if (!/^\d{2}:\d{2}$/.test(manualForm.time.trim())) {
      toast.error('Ingresa una hora válida en formato HH:MM.')
      return
    }
    if (manualForm.durationMinutes < 30 || manualForm.durationMinutes > 240) {
      toast.error('La duración debe estar entre 30 y 240 minutos.')
      return
    }
    const startsAt = new Date(`${dayStr}T${manualForm.time}:00`)
    if (Number.isNaN(startsAt.getTime())) {
      toast.error('Fecha u hora inválida.')
      return
    }
    const endsAt = new Date(startsAt.getTime() + manualForm.durationMinutes * 60 * 1000)
    const now = new Date()
    if (startsAt.getTime() < now.getTime() - 5 * 60 * 1000) {
      toast.error('No puedes crear reservas manuales en el pasado.')
      return
    }

    setManualSaving(true)
    try {
      const noteParts = [
        'manual_reservation',
        manualForm.clientName.trim() ? `cliente:${manualForm.clientName.trim()}` : '',
        manualForm.clientPhone.trim() ? `telefono:${manualForm.clientPhone.trim()}` : '',
        manualForm.note.trim() ? `nota:${manualForm.note.trim()}` : '',
      ].filter(Boolean)
      const notes = noteParts.join(' | ')
      const courtRow = courts.find((c) => c.id === manualForm.courtId)
      const payload: Record<string, unknown> = {
        court_id: manualForm.courtId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: manualForm.status,
        payment_status: manualForm.status === 'confirmed' ? 'paid' : 'unpaid',
        price_per_hour: courtRow?.pricePerHour ?? null,
        currency: 'CLP',
        notes,
        booker_user_id: null,
        match_opportunity_id: null,
        confirmation_source: manualForm.status === 'confirmed' ? 'venue_owner' : null,
        confirmed_by_user_id:
          manualForm.status === 'confirmed' ? currentUser?.id ?? null : null,
        confirmation_note:
          manualForm.status === 'confirmed'
            ? 'Reserva manual confirmada por centro'
            : 'Reserva manual cargada por centro',
      }
      const supabase = createClient()
      const { error } = await supabase.from('venue_reservations').insert(payload)
      if (error) {
        if (error.message.includes('venue_reservation_overlap')) {
          toast.error('Ese horario ya está ocupado en esta cancha.')
        } else {
          toast.error(error.message)
        }
        return
      }
      toast.success('Reserva manual creada correctamente.')
      setManualForm((f) => ({
        ...f,
        courtId: f.courtId,
        clientName: '',
        clientPhone: '',
        note: '',
      }))
      await reloadAll()
      setDayStr(toDateInputValue(startsAt))
    } finally {
      setManualSaving(false)
    }
  }

  const courtNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of courts) m.set(c.id, c.name)
    return m
  }, [courts])

  const saveProfile = async () => {
    if (!venue) return
    const supabase = createClient()
    const cityLabel = profileForm.city.trim() || 'Rancagua'
    let nextCityId = profileForm.cityId.trim()
    if (!nextCityId) {
      nextCityId =
        (await resolveCityIdFromLabel(supabase, cityLabel)) ?? venue.cityId
    }
    const { error } = await supabase
      .from('sports_venues')
      .update({
        name: profileForm.name.trim(),
        address: profileForm.address.trim(),
        maps_url: profileForm.mapsUrl.trim() || null,
        phone: profileForm.phone.trim(),
        city: cityLabel,
        city_id: nextCityId,
        slot_duration_minutes: Math.min(
          180,
          Math.max(15, Math.round(profileForm.slotDurationMinutes) || 60)
        ),
      })
      .eq('id', venue.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Centro actualizado')
    await reloadAll()
  }

  const addCourt = async () => {
    if (!venue || !newCourtName.trim()) return
    const supabase = createClient()
    const nextOrder =
      courts.length > 0 ? Math.max(...courts.map((c) => c.sortOrder)) + 1 : 0
    const { error } = await supabase.from('venue_courts').insert({
      venue_id: venue.id,
      name: newCourtName.trim(),
      sort_order: nextOrder,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    setNewCourtName('')
    toast.success('Cancha agregada')
    await reloadAll()
  }

  const saveCourtPrice = async (courtId: string, raw: string) => {
    if (!venue) return
    const trimmed = raw.trim()
    const n = trimmed === '' ? null : Math.round(Number(trimmed))
    if (n != null && (Number.isNaN(n) || n < 0)) {
      toast.error('Precio inválido')
      return
    }
    const supabase = createClient()
    const { error } = await supabase
      .from('venue_courts')
      .update({ price_per_hour: n })
      .eq('id', courtId)
      .eq('venue_id', venue.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Precio guardado')
    await reloadAll()
  }

  const removeCourt = async (id: string) => {
    if (!confirm('¿Eliminar esta cancha? Se borrarán sus reservas.')) return
    const supabase = createClient()
    const { error } = await supabase.from('venue_courts').delete().eq('id', id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Cancha eliminada')
    await reloadAll()
  }

  const saveHours = async () => {
    if (!venue) return
    const supabase = createClient()
    for (let d = 0; d <= 6; d++) {
      const cfg = hoursByDay[d]
      const existing = weeklyLoaded.find((h) => h.dayOfWeek === d)
      if (!cfg) {
        if (existing) {
          const { error } = await supabase
            .from('venue_weekly_hours')
            .delete()
            .eq('id', existing.id)
          if (error) {
            toast.error(error.message)
            return
          }
        }
      } else {
        const ot = toPgTime(cfg.open)
        const ct = toPgTime(cfg.close)
        if (existing) {
          const { error } = await supabase
            .from('venue_weekly_hours')
            .update({
              open_time: ot,
              close_time: ct,
            })
            .eq('id', existing.id)
          if (error) {
            toast.error(error.message)
            return
          }
        } else {
          const { error } = await supabase.from('venue_weekly_hours').insert({
            venue_id: venue.id,
            day_of_week: d,
            open_time: ot,
            close_time: ct,
          })
          if (error) {
            toast.error(error.message)
            return
          }
        }
      }
    }
    toast.success('Horario guardado')
    await reloadAll()
  }

  // cancelReservation redefinida más abajo (con motivo y cancelación de partido asociado).

  const copyPublicLink = async () => {
    if (!venue || typeof window === 'undefined') return
    const path = `${window.location.origin}/centro/${venue.id}`
    try {
      await navigator.clipboard.writeText(path)
      toast.success('Enlace público copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  if (!currentUser) return null

  return (
    <div className="min-h-screen bg-background flex flex-col pb-8">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <AppScreenBrandHeading
          className="min-w-0 flex-1"
          title={venue?.name ?? 'Mi centro'}
          subtitle="Cuenta centro deportivo"
          titleClassName="text-lg md:text-xl"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeMenuButton />
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut className="mr-1 h-4 w-4" />
            Salir
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-label="Cargando"
          />
        </div>
      ) : !venue ? (
        <main className="flex-1 p-4 space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="p-6 space-y-2 text-sm text-muted-foreground">
              <p className="text-foreground font-medium">
                Aún no hay centro vinculado
              </p>
              <p>
                Los centros se crean en Supabase (tabla <code>sports_venues</code>)
                con <code>owner_id</code> igual a tu usuario. Pide a un administrador
                que te asigne el centro o el alta de cuenta{' '}
                <code>account_type = venue</code>.
              </p>
              <Button variant="outline" onClick={() => void logout()}>
                Cerrar sesión
              </Button>
            </CardContent>
          </Card>
        </main>
      ) : (
        <>
          <div className="flex gap-1 p-2 border-b border-border overflow-x-auto">
            {(
              [
                ['bookings', 'Reservas', Calendar],
                ['profile', 'Perfil', MapPin],
                ['courts', 'Canchas', LayoutGrid],
                ['hours', 'Horario', Clock],
              ] as const
            ).map(([id, label, Icon]) => (
              <Button
                key={id}
                variant={tab === id ? 'default' : 'ghost'}
                size="sm"
                className="shrink-0"
                onClick={() => setTab(id)}
              >
                <Icon className="w-4 h-4 mr-1" />
                {label}
              </Button>
            ))}
          </div>

          <main className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
            {tab === 'bookings' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-foreground">Día</Label>
                  <Input
                    type="date"
                    value={dayStr}
                    onChange={(e) => setDayStr(e.target.value)}
                    className="w-auto bg-secondary border-border"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => void copyPublicLink()}>
                  <Link2 className="w-4 h-4 mr-1" />
                  Copiar página pública
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualForm((v) => !v)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {showManualForm ? 'Ocultar reserva manual' : 'Nueva reserva manual'}
                </Button>
                {showManualForm ? (
                  <Card className="bg-card border-border">
                    <CardContent className="p-3 space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        Ingresar reserva manual (cliente externo)
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Cancha</Label>
                          <select
                            value={manualForm.courtId}
                            onChange={(e) =>
                              setManualForm((f) => ({ ...f, courtId: e.target.value }))
                            }
                            className="h-10 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground"
                          >
                            <option value="">Seleccionar</option>
                            {courts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Hora</Label>
                          <Input
                            type="time"
                            value={manualForm.time}
                            onChange={(e) =>
                              setManualForm((f) => ({ ...f, time: e.target.value }))
                            }
                            className="h-10 bg-secondary border-border"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Duración (min)</Label>
                          <Input
                            type="number"
                            min={30}
                            max={240}
                            step={30}
                            value={manualForm.durationMinutes}
                            onChange={(e) =>
                              setManualForm((f) => ({
                                ...f,
                                durationMinutes: Number(e.target.value || 60),
                              }))
                            }
                            className="h-10 bg-secondary border-border"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Estado inicial</Label>
                          <select
                            value={manualForm.status}
                            onChange={(e) =>
                              setManualForm((f) => ({
                                ...f,
                                status: e.target.value as 'pending' | 'confirmed',
                              }))
                            }
                            className="h-10 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground"
                          >
                            <option value="pending">Pendiente</option>
                            <option value="confirmed">Confirmada</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Nombre cliente</Label>
                          <Input
                            value={manualForm.clientName}
                            onChange={(e) =>
                              setManualForm((f) => ({ ...f, clientName: e.target.value }))
                            }
                            placeholder="Ej: Carlos"
                            className="h-10 bg-secondary border-border"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">WhatsApp cliente</Label>
                          <Input
                            value={manualForm.clientPhone}
                            onChange={(e) =>
                              setManualForm((f) => ({ ...f, clientPhone: e.target.value }))
                            }
                            placeholder="+56912345678"
                            className="h-10 bg-secondary border-border"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nota (opcional)</Label>
                        <Input
                          value={manualForm.note}
                          onChange={(e) =>
                            setManualForm((f) => ({ ...f, note: e.target.value }))
                          }
                          placeholder="Observación interna"
                          className="h-10 bg-secondary border-border"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void createManualReservation()}
                        disabled={manualSaving}
                      >
                        {manualSaving ? 'Guardando...' : 'Guardar reserva manual'}
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
                <ul className="space-y-2">
                  {reservations.filter((r) => r.status !== 'cancelled').length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay reservas este día.
                    </p>
                  ) : (
                    reservations
                      .filter((r) => r.status !== 'cancelled')
                      .map((r) => (
                        <Card key={r.id} className="bg-card border-border">
                          <CardContent className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
                            <div>
                              <p className="font-medium">
                                {courtNameById.get(r.courtId) ?? 'Cancha'}
                              </p>
                              <p className="text-muted-foreground">
                                {r.startsAt.toLocaleTimeString('es-CL', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                –{' '}
                                {r.endsAt.toLocaleTimeString('es-CL', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                              {(r.matchOpportunityId || r.bookerUserId) ? (() => {
                                const m = r.matchOpportunityId
                                  ? matchById.get(r.matchOpportunityId)
                                  : undefined
                                const org = m
                                  ? organizerById.get(m.creatorId)
                                  : r.bookerUserId
                                    ? organizerById.get(r.bookerUserId)
                                    : null
                                const wa = org?.whatsappPhone?.trim() || null
                                const timeLabel = r.startsAt.toLocaleTimeString('es-CL', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                                const dateLabel = r.startsAt.toLocaleDateString('es-CL', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                })
                                const msg = m
                                  ? `Hola ${org?.name ?? ''}. Soy el centro deportivo ${venue?.name ?? ''}. Para confirmar la reserva del partido “${m.title}” (${r.startsAt.toLocaleTimeString('es-CL', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}), con fecha ${r.startsAt.toLocaleDateString('es-CL', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                    })}, necesitamos el abono/pago. ¿Te envío los datos para transferir o link de pago?`
                                  : `Hola ${org?.name ?? ''}. Soy el centro deportivo ${venue?.name ?? ''}. Para confirmar tu reserva (${timeLabel}) del día ${dateLabel}, necesitamos el abono/pago. ¿Te envío los datos para transferir o link de pago?`
                                return (
                                  <div className="mt-2 space-y-1">
                                    <p className="text-xs text-primary">
                                      {m
                                        ? m.title
                                        : r.matchOpportunityId
                                          ? `Partido #${r.matchOpportunityId.slice(0, 8)}…`
                                          : 'Reserva directa'}
                                    </p>
                                    {r.notes?.includes('manual_reservation') ? (
                                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                                        Reserva manual (cliente externo)
                                      </p>
                                    ) : null}
                                    <p className="text-[11px] text-muted-foreground">
                                      {m ? 'Organizador' : 'Reservante'}:{' '}
                                      <span className="text-foreground font-medium">
                                        {org?.name?.trim() || 'Sin nombre'}
                                      </span>
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      Estado: <span className="text-foreground font-medium">{r.status === 'pending' ? 'Pendiente' : 'Confirmada'}</span>
                                    </p>
                                    {wa ? (
                                      <Button asChild size="sm" className="mt-1 bg-green-600 hover:bg-green-500 text-white">
                                        <a
                                          href={formatWhatsAppLink(wa, msg)}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <MessageCircle className="w-4 h-4 mr-1.5" />
                                          {m
                                            ? 'Enviar mensaje al organizador'
                                            : 'Enviar WhatsApp al reservante'}
                                        </a>
                                      </Button>
                                    ) : (
                                      <p className="text-[11px] text-muted-foreground">
                                        {m
                                          ? 'El organizador no tiene WhatsApp registrado.'
                                          : 'El reservante no tiene WhatsApp registrado.'}
                                      </p>
                                    )}
                                  </div>
                                )
                              })() : null}
                            </div>
                            <div className="flex gap-2">
                              {r.status === 'pending' ? (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => void confirmReservation(r.id)}
                                >
                                  Confirmar (pagado)
                                </Button>
                              ) : null}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void cancelReservation(r.id)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                  )}
                </ul>
              </div>
            )}

            {tab === 'profile' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Nombre del centro</Label>
                  <Input
                    value={profileForm.name}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, name: e.target.value })
                    }
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <Input
                    value={profileForm.address}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, address: e.target.value })
                    }
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Enlace Google Maps</Label>
                  <Input
                    placeholder="https://maps.app.goo.gl/..."
                    value={profileForm.mapsUrl}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, mapsUrl: e.target.value })
                    }
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={profileForm.phone}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, phone: e.target.value })
                    }
                    className="bg-secondary border-border"
                  />
                </div>
                <GeoLocationSelect
                  cityId={profileForm.cityId}
                  onChange={(next) =>
                    setProfileForm({
                      ...profileForm,
                      cityId: next.cityId,
                      city: next.cityLabel,
                    })
                  }
                  label="Ubicación"
                />
                <div className="space-y-2">
                  <Label>Duración de tramo (min)</Label>
                  <Input
                    type="number"
                    min={15}
                    max={180}
                    step={15}
                    value={profileForm.slotDurationMinutes}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        slotDurationMinutes: Number(e.target.value),
                      })
                    }
                    className="bg-secondary border-border"
                  />
                </div>
                <Button onClick={() => void saveProfile()}>Guardar</Button>
              </div>
            )}

            {tab === 'courts' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nombre cancha"
                    value={newCourtName}
                    onChange={(e) => setNewCourtName(e.target.value)}
                    className="bg-secondary border-border flex-1"
                  />
                  <Button type="button" onClick={() => void addCourt()}>
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar
                  </Button>
                </div>
                <ul className="space-y-2">
                  {courts.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <span className="text-sm font-medium shrink-0">{c.name}</span>
                      <div className="flex flex-1 flex-wrap items-center gap-2 justify-end">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">
                          $/hora (CLP)
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          step={1000}
                          className="h-9 w-36 bg-secondary border-border"
                          placeholder="Opcional"
                          defaultValue={c.pricePerHour ?? ''}
                          key={`${c.id}-${c.pricePerHour ?? 'x'}`}
                          onBlur={(e) => void saveCourtPrice(c.id, e.target.value)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void removeCourt(c.id)}
                          aria-label="Eliminar"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Ese valor se usa al reservar cancha (jugadores y centro) y para
                  calcular el reparto entre jugadores.
                </p>
              </div>
            )}

            {tab === 'hours' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  0 = domingo · 6 = sábado. Deja vacío (cerrado) o hora HH:MM.
                </p>
                {([0, 1, 2, 3, 4, 5, 6] as const).map((d) => (
                  <div
                    key={d}
                    className="rounded-lg border border-border bg-card p-3 space-y-2"
                  >
                    <p className="text-sm font-medium">{WEEKDAY_SHORT_ES[d]}</p>
                    {hoursByDay[d] ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="09:00"
                          value={hoursByDay[d]!.open}
                          onChange={(e) =>
                            setHoursByDay({
                              ...hoursByDay,
                              [d]: {
                                open: e.target.value,
                                close: hoursByDay[d]!.close,
                              },
                            })
                          }
                          className="bg-secondary border-border"
                        />
                        <Input
                          placeholder="22:00"
                          value={hoursByDay[d]!.close}
                          onChange={(e) =>
                            setHoursByDay({
                              ...hoursByDay,
                              [d]: {
                                open: hoursByDay[d]!.open,
                                close: e.target.value,
                              },
                            })
                          }
                          className="bg-secondary border-border"
                        />
                      </div>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() =>
                        setHoursByDay({
                          ...hoursByDay,
                          [d]: hoursByDay[d] ? null : { open: '09:00', close: '22:00' },
                        })
                      }
                    >
                      {hoursByDay[d] ? 'Cerrado este día' : 'Abrir este día'}
                    </Button>
                  </div>
                ))}
                <Button onClick={() => void saveHours()}>Guardar horario</Button>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  )
}
