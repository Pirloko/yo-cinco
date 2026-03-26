'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { writeCreatePrefill } from '@/lib/create-prefill'
import { computeDaySlots, WEEKDAY_SHORT_ES } from '@/lib/venue-slots'
import type { SportsVenue, VenueCourt, VenueWeeklyHour } from '@/lib/types'
import type { VenueReservationRow } from '@/lib/types'
import { Calendar, Clock, ExternalLink, MapPin, Phone } from 'lucide-react'

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function fromDateInputValue(s: string): Date {
  const [y, m, day] = s.split('-').map(Number)
  const d = new Date()
  d.setFullYear(y, m - 1, day)
  d.setHours(0, 0, 0, 0)
  return d
}

type Props = {
  venue: SportsVenue
  courts: VenueCourt[]
  weeklyHours: VenueWeeklyHour[]
}

export function VenueCentroClient({ venue, courts, weeklyHours }: Props) {
  const [dayStr, setDayStr] = useState(() => toDateInputValue(new Date()))
  const [reservations, setReservations] = useState<VenueReservationRow[]>([])
  const [loading, setLoading] = useState(false)

  const day = useMemo(() => fromDateInputValue(dayStr), [dayStr])

  const loadRes = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(day)
    end.setHours(23, 59, 59, 999)
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('venue_public_reservations_in_range', {
        p_venue_id: venue.id,
        p_from: start.toISOString(),
        p_to: end.toISOString(),
      })
      if (error || !data) {
        setReservations([])
        return
      }
      const rows = data as { court_id: string; starts_at: string; ends_at: string }[]
      setReservations(
        rows.map((r) => ({
          id: `${r.court_id}-${r.starts_at}`,
          courtId: r.court_id,
          startsAt: new Date(r.starts_at),
          endsAt: new Date(r.ends_at),
          bookerUserId: null,
          matchOpportunityId: null,
          status: 'confirmed' as const,
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [day, venue.id])

  useEffect(() => {
    void loadRes()
  }, [loadRes])

  const courtIds = courts.map((c) => c.id)
  const courtName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of courts) m.set(c.id, c.name)
    return m
  }, [courts])

  const slots = useMemo(
    () =>
      computeDaySlots(
        day,
        weeklyHours,
        courtIds,
        reservations,
        venue.slotDurationMinutes
      ),
    [day, weeklyHours, courtIds, reservations, venue.slotDurationMinutes]
  )

  const dow = WEEKDAY_SHORT_ES[day.getDay()]

  const handleCreateFromSlot = (slotStart: Date, slotEnd: Date) => {
    const date = toDateInputValue(slotStart)
    const time = `${pad2(slotStart.getHours())}:${pad2(slotStart.getMinutes())}`
    writeCreatePrefill({
      sportsVenueId: venue.id,
      venueLabel: venue.name,
      city: venue.city,
      date,
      time,
      bookCourtSlot: true,
    })
    window.location.href = '/?prefillCreate=1'
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-2 text-sm">
        {venue.address ? (
          <p className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
            <span>{venue.address}</span>
          </p>
        ) : null}
        <p className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="w-4 h-4 text-primary" />
          <span>{venue.city}</span>
        </p>
        {venue.phone ? (
          <p className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            <a
              href={`tel:${venue.phone.replace(/\s/g, '')}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {venue.phone}
            </a>
          </p>
        ) : null}
        {venue.mapsUrl ? (
          <p>
            <a
              href={venue.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Ver en Google Maps
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Huecos ({dow})</h2>
        </div>
        <InputDate value={dayStr} onChange={setDayStr} />
        <p className="text-xs text-muted-foreground">
          Tramos de {venue.slotDurationMinutes} min según horario declarado y reservas
          confirmadas. Al publicar un partido se asigna una cancha libre si hay cupo.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : weeklyHours.length === 0 || courts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este centro aún no tiene horario o canchas configurados en la app.
          </p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay horario de apertura este día o ya no quedan tramos.
          </p>
        ) : (
          <ul className="space-y-2">
            {slots.map((s) => {
              const free = s.freeCourtIds.length
              const label = `${pad2(s.start.getHours())}:${pad2(s.start.getMinutes())} – ${pad2(s.end.getHours())}:${pad2(s.end.getMinutes())}`
              const available = free > 0
              return (
                <li key={s.start.toISOString()}>
                  <Card className="bg-card border-border">
                    <CardContent className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground">
                          {available
                            ? `${free} cancha(s) libre(s) de ${s.totalCourts}`
                            : 'Completo'}
                        </span>
                      </div>
                      {available ? (
                        <Button
                          type="button"
                          size="sm"
                          className="shrink-0 bg-primary text-primary-foreground"
                          onClick={() => handleCreateFromSlot(s.start, s.end)}
                        >
                          Crear partido aquí
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground space-y-3">
        <p>
          ¿Tienes cuenta? Inicia sesión en la app y te llevamos a{' '}
          <strong className="text-foreground">Crear</strong> con la fecha y hora de este
          tramo; opcionalmente se reserva cancha al publicar.
        </p>
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link href="/?prefillCreate=1" onClick={() => writeCreatePrefill({
            sportsVenueId: venue.id,
            venueLabel: venue.name,
            city: venue.city,
            date: dayStr,
            time: '18:00',
            bookCourtSlot: true,
          })}>
            Ir a la app con este día (hora 18:00)
          </Link>
        </Button>
      </div>
    </div>
  )
}

function InputDate({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-xs h-11 rounded-md border border-border bg-background px-3 text-foreground"
    />
  )
}
