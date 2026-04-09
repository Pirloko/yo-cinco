'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAppAuth, useAppUI } from '@/lib/app-context'
import { useGeoCitiesWithVenuesInRegion } from '@/lib/hooks/use-geo-cities-with-venues'
import { queryKeys, stableIdsKey } from '@/lib/query-keys'
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
import { getBrowserSupabase } from '@/lib/supabase/client'
import { fetchSportsVenuesInRegion, fetchSportsVenuesList } from '@/lib/supabase/venue-queries'
import type { SportsVenue } from '@/lib/types'
import {
  fetchExploreVenuesAvailabilityGrid,
  type ExploreAvailabilityRow,
} from '@/lib/services/explore-availability.service'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { MATCH_CARD_SHELL, TABLE_OUTLINE } from '@/lib/card-shell'
import { cn } from '@/lib/utils'
import { Search, X, MapPin, Building2, CalendarRange, Clock } from 'lucide-react'
import { RegionCityFilterSelect } from '@/components/region-city-filter'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { writeCreatePrefill } from '@/lib/create-prefill'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'
import { QUERY_STALE_TIME_STATIC_MS } from '@/lib/query-defaults'

const HORIZON_OPTIONS = [
  { days: 1, label: 'Hoy' },
  { days: 3, label: '3 días' },
  { days: 7, label: '7 días' },
  { days: 14, label: '14 días' },
] as const

type AvailabilityRow = ExploreAvailabilityRow

export function ExploreScreen() {
  const { setCurrentScreen } = useAppUI()
  const { currentUser } = useAppAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [horizonDays, setHorizonDays] = useState(7)

  const citiesQuery = useGeoCitiesWithVenuesInRegion(
    currentUser?.regionId,
    currentUser?.id
  )
  const cityFilterOptions = citiesQuery.data ?? []

  useEffect(() => {
    setCityFilter('')
  }, [currentUser?.regionId])

  const publicVenuesQuery = useQuery({
    queryKey: queryKeys.explore.publicVenues(currentUser?.regionId ?? null),
    staleTime: QUERY_STALE_TIME_STATIC_MS,
    enabled: sessionQueryEnabled(currentUser?.id),
    queryFn: async (): Promise<SportsVenue[]> => {
      const supabase = getBrowserSupabase()
      if (!supabase) return []
      if (currentUser?.regionId) {
        return fetchSportsVenuesInRegion(supabase, currentUser.regionId)
      }
      return fetchSportsVenuesList(supabase)
    },
  })

  const publicVenues = publicVenuesQuery.data ?? []

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

  const venueIdsKey = useMemo(
    () => stableIdsKey(displayedVenues.map((v) => v.id)),
    [displayedVenues]
  )

  const availabilityQuery = useQuery({
    queryKey: queryKeys.explore.venueAvailabilityGrid(venueIdsKey, horizonDays),
    enabled:
      displayedVenues.length > 0 && sessionQueryEnabled(currentUser?.id),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AvailabilityRow[]> => {
      const supabase = getBrowserSupabase()
      if (!supabase) return []
      const now = new Date()
      return fetchExploreVenuesAvailabilityGrid(
        supabase,
        displayedVenues,
        horizonDays,
        now
      )
    },
  })

  const availabilityRows = availabilityQuery.data ?? []
  const loadingAvailability =
    displayedVenues.length > 0 && availabilityQuery.isFetching

  const goToQuickCreate = useCallback((row: AvailabilityRow) => {
    if (!row.nextSlotAt) return
    writeCreatePrefill({
      sportsVenueId: row.venueId,
      venueLabel: row.venueName,
      city: row.city,
      date: formatMatchInTimezone(row.nextSlotAt, 'yyyy-MM-dd'),
      time: formatMatchInTimezone(row.nextSlotAt, 'HH:mm'),
      bookCourtSlot: true,
    })
    setCurrentScreen('create')
  }, [setCurrentScreen])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

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
                onClick={clearSearch}
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
                <Card
                  className={cn(
                    MATCH_CARD_SHELL,
                    'gap-0 py-0 hover:border-primary/55 flex flex-col'
                  )}
                >
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
          <div className={TABLE_OUTLINE}>
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
                          {formatMatchInTimezone(
                            row.nextSlotAt,
                            'EEE d MMM · HH:mm'
                          )}
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
