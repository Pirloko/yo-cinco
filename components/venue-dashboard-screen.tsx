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
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react'
import { WEEKDAY_SHORT_ES } from '@/lib/venue-slots'

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

  const [profileForm, setProfileForm] = useState({
    name: '',
    address: '',
    mapsUrl: '',
    phone: '',
    city: '',
    slotDurationMinutes: 60,
  })

  const [hoursByDay, setHoursByDay] = useState<Record<number, DayHours>>(() => {
    const o: Record<number, DayHours> = {}
    for (let d = 0; d <= 6; d++) o[d] = null
    return o
  })

  const [newCourtName, setNewCourtName] = useState('')

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
      if (!cancelled) setReservations(list)
    })()
    return () => {
      cancelled = true
    }
  }, [venue, dayStr])

  const courtNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of courts) m.set(c.id, c.name)
    return m
  }, [courts])

  const saveProfile = async () => {
    if (!venue) return
    const supabase = createClient()
    const { error } = await supabase
      .from('sports_venues')
      .update({
        name: profileForm.name.trim(),
        address: profileForm.address.trim(),
        maps_url: profileForm.mapsUrl.trim() || null,
        phone: profileForm.phone.trim(),
        city: profileForm.city.trim() || 'Rancagua',
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

  const cancelReservation = async (id: string) => {
    if (!confirm('¿Marcar esta reserva como cancelada?')) return
    const supabase = createClient()
    const { error } = await supabase
      .from('venue_reservations')
      .update({ status: 'cancelled' })
      .eq('id', id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Reserva cancelada')
    if (venue) {
      const d = new Date(dayStr + 'T12:00:00')
      const start = new Date(d)
      start.setHours(0, 0, 0, 0)
      const end = new Date(d)
      end.setHours(23, 59, 59, 999)
      const list = await fetchVenueReservationsRange(
        supabase,
        venue.id,
        start.toISOString(),
        end.toISOString()
      )
      setReservations(list)
    }
  }

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
      <header className="sticky top-0 z-10 bg-background/95 border-b border-border px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-bold text-foreground truncate">
            {venue?.name ?? 'Mi centro'}
          </h1>
          <p className="text-xs text-muted-foreground">Cuenta centro deportivo</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          <LogOut className="w-4 h-4 mr-1" />
          Salir
        </Button>
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
                <ul className="space-y-2">
                  {reservations.filter((r) => r.status === 'confirmed').length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay reservas confirmadas este día.
                    </p>
                  ) : (
                    reservations
                      .filter((r) => r.status === 'confirmed')
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
                              {r.matchOpportunityId ? (
                                <p className="text-xs text-primary mt-1">
                                  Partido #{r.matchOpportunityId.slice(0, 8)}…
                                </p>
                              ) : null}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void cancelReservation(r.id)}
                            >
                              Cancelar
                            </Button>
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
                <div className="space-y-2">
                  <Label>Ciudad</Label>
                  <Input
                    value={profileForm.city}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, city: e.target.value })
                    }
                    className="bg-secondary border-border"
                  />
                </div>
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
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <span className="text-sm font-medium">{c.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void removeCourt(c.id)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
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
