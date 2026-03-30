'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  fetchGeoCitiesWithVenuesInRegion,
  fetchSportsVenuesInRegion,
  fetchSportsVenuesList,
  fetchVenueCourts,
  fetchVenueReservationsRange,
  fetchVenueWeeklyHours,
} from '@/lib/supabase/venue-queries'
import type { SportsVenue } from '@/lib/types'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { Search, X, MapPin, Building2, CalendarRange, Clock } from 'lucide-react'
import { RegionCityFilterSelect } from '@/components/region-city-filter'
import { findNextVenueSlot } from '@/lib/venue-slots'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { writeCreatePrefill } from '@/lib/create-prefill'

const HORIZON_OPTIONS = [
  { days: 1, label: 'Hoy' },
  { days: 3, label: '3 días' },
  { days: 7, label: '7 días' },
  { days: 14, label: '14 días' },
] as const

type AvailabilityRow = {
  venueId: string
  venueName: string
  city: string
  totalCourts: number
  nextSlotAt: Date | null
  freeCourtsAtNextSlot: number
}

export function ExploreScreen() {
  const { currentUser, setCurrentScreen } = useApp()
  const [searchQuery, setSearchQuery] = useState('')
  const [publicVenues, setPublicVenues] = useState<SportsVenue[]>([])
  const [cityFilter, setCityFilter] = useState('')
  const [cityFilterOptions, setCityFilterOptions] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [horizonDays, setHorizonDays] = useState(7)
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)

  useEffect(() => {
    if (!currentUser?.regionId || !isSupabaseConfigured()) {
      setCityFilterOptions([])
      setCityFilter('')
      return
    }
    void fetchGeoCitiesWithVenuesInRegion(
      createClient(),
      currentUser.regionId
    ).then(setCityFilterOptions)
  }, [currentUser?.regionId])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    void (async () => {
      if (currentUser?.regionId) {
        setPublicVenues(await fetchSportsVenuesInRegion(supabase, currentUser.regionId))
      } else {
        setPublicVenues(await fetchSportsVenuesList(supabase))
      }
    })()
  }, [currentUser?.regionId])

  const displayedVenues = useMemo(() => {
    let v = publicVenues
    if (cityFilter) v = v.filter((x) => x.cityId === cityFilter)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      v = v.filter(
        (x) =>
          x.name.toLowerCase().includes(q) || x.city.toLowerCase().includes(q)
      )
    }
    return v
  }, [publicVenues, cityFilter, searchQuery])

  useEffect(() => {
    if (!isSupabaseConfigured() || displayedVenues.length === 0) {
      setAvailabilityRows([])
      setLoadingAvailability(false)
      return
    }
    let cancelled = false
    setLoadingAvailability(true)
    const now = new Date()
    const to = new Date(now)
    to.setDate(to.getDate() + horizonDays)
    const supabase = createClient()

    void (async () => {
      const results = await Promise.all(
        displayedVenues.map(async (venue) => {
          const [courts, weeklyHours, reservations] = await Promise.all([
            fetchVenueCourts(supabase, venue.id),
            fetchVenueWeeklyHours(supabase, venue.id),
            fetchVenueReservationsRange(
              supabase,
              venue.id,
              new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
              to.toISOString()
            ),
          ])
          const next = findNextVenueSlot({
            slotDurationMinutes: venue.slotDurationMinutes,
            courtsCount: courts.length,
            weeklyHours,
            reservations,
            horizonDays,
            now,
          })
          return {
            venueId: venue.id,
            venueName: venue.name,
            city: venue.city,
            totalCourts: courts.length,
            nextSlotAt: next.nextSlotAt,
            freeCourtsAtNextSlot: next.freeCourtsAtNextSlot,
          } satisfies AvailabilityRow
        })
      )
      if (cancelled) return
      const withSlot = results.filter((r) => r.nextSlotAt != null) as Array<
        AvailabilityRow & { nextSlotAt: Date }
      >
      const withoutSlot = results.filter((r) => r.nextSlotAt == null)
      withSlot.sort(
        (a, b) => a.nextSlotAt.getTime() - b.nextSlotAt.getTime()
      )
      setAvailabilityRows([...withSlot, ...withoutSlot])
      setLoadingAvailability(false)
    })()

    return () => {
      cancelled = true
    }
  }, [displayedVenues, horizonDays])

  const goToQuickCreate = (row: AvailabilityRow) => {
    if (!row.nextSlotAt) return
    writeCreatePrefill({
      sportsVenueId: row.venueId,
      venueLabel: row.venueName,
      city: row.city,
      date: format(row.nextSlotAt, 'yyyy-MM-dd'),
      time: format(row.nextSlotAt, 'HH:mm'),
      bookCourtSlot: true,
    })
    setCurrentScreen('create')
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 space-y-4 border-b border-border bg-background/95 p-4 backdrop-blur-sm">
        <AppScreenBrandHeading title="Explorar" subtitle="Centros deportivos y próximos horarios libres" />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Buscar centros..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <RegionCityFilterSelect
            className="sm:shrink-0"
            cities={cityFilterOptions}
            value={cityFilter}
            onChange={setCityFilter}
          />
          <div className="flex items-center gap-2 sm:shrink-0">
            <CalendarRange className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <Select
              value={String(horizonDays)}
              onValueChange={(v) => setHorizonDays(Number(v))}
            >
              <SelectTrigger className="h-12 w-full sm:w-[140px] bg-secondary border-border">
                <SelectValue placeholder="Ventana" />
              </SelectTrigger>
              <SelectContent>
                {HORIZON_OPTIONS.map((o) => (
                  <SelectItem key={o.days} value={String(o.days)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {displayedVenues.length > 0 ? (
        <section className="px-4 pt-4 pb-2 space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Centros deportivos
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {displayedVenues.map((v) => (
              <Link key={v.id} href={`/centro/${v.id}`} className="shrink-0 w-[200px]">
                <Card className="bg-card border-border hover:border-primary/40 transition-colors">
                  <CardContent className="p-3 space-y-1">
                    <p className="font-medium text-sm text-foreground line-clamp-2">
                      {v.name}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {v.city}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="px-4 pt-6 text-center text-sm text-muted-foreground">
          No hay centros que coincidan con tu búsqueda o ciudad.
        </div>
      )}

      <section className="px-4 py-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          Próximos horarios disponibles
        </h2>
        <p className="text-xs text-muted-foreground">
          Ordenados del turno libre más cercano al más lejano (ventana:{' '}
          {HORIZON_OPTIONS.find((o) => o.days === horizonDays)?.label ?? `${horizonDays} días`}).
        </p>

        {loadingAvailability && displayedVenues.length > 0 ? (
          <p className="text-sm text-muted-foreground">Calculando disponibilidad…</p>
        ) : availabilityRows.length === 0 && !loadingAvailability ? (
          <p className="text-sm text-muted-foreground">
            No hay datos de horarios para mostrar.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Centro</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Canchas libres</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Próximo horario</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {availabilityRows.map((row) => (
                  <tr
                    key={row.venueId}
                    className="border-b border-border/80 last:border-0"
                  >
                    <td className="px-3 py-2.5 align-top">
                      <Link
                        href={`/centro/${row.venueId}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {row.venueName}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{row.city}</p>
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap">
                      {row.totalCourts <= 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : row.nextSlotAt == null ? (
                        <span className="text-muted-foreground">Sin cupo</span>
                      ) : (
                        <span className="text-foreground">
                          {row.freeCourtsAtNextSlot}/{row.totalCourts}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap text-muted-foreground">
                      {row.nextSlotAt ? (
                        <span className="text-foreground">
                          {format(row.nextSlotAt, "EEE d MMM · HH:mm", {
                            locale: es,
                          })}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle text-right">
                      {row.nextSlotAt ? (
                        <Button
                          type="button"
                          size="sm"
                          className="shrink-0"
                          onClick={() => goToQuickCreate(row)}
                        >
                          Reservar
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" asChild className="shrink-0">
                          <Link href={`/centro/${row.venueId}`}>Ver centro</Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BottomNav />
    </div>
  )
}
