'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import { fetchVenuePublicReservationsAsRowsForDay } from '@/lib/supabase/venue-queries'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import {
  OPEN_CREATE_AFTER_AUTH_KEY,
  writeCreatePrefill,
} from '@/lib/create-prefill'
import { JOIN_REGISTER_STORAGE_KEY } from '@/lib/team-invite-url'
import { computeDaySlots, WEEKDAY_SHORT_ES } from '@/lib/venue-slots'
import type {
  PublicVenueReviewSnippet,
  PublicVenueReviewStats,
  SportsVenue,
  VenueCourt,
  VenueReservationRow,
  VenueWeeklyHour,
} from '@/lib/types'
import { VenueCentroReviewsSection } from '@/components/venue-centro-reviews-section'
import {
  persistPlayerLastNav,
  readPlayerLastNav,
  type PlayerNavId,
} from '@/lib/player-nav-storage'
import {
  Calendar,
  Clock,
  ExternalLink,
  Home,
  LayoutList,
  MapPin,
  Phone,
  PlusCircle,
  Search,
  User,
  Users,
} from 'lucide-react'

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

function queueCreatePrefillAfterAuth(venue: SportsVenue, slotStart: Date) {
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
  try {
    sessionStorage.setItem(OPEN_CREATE_AFTER_AUTH_KEY, '1')
  } catch {
    // ignore
  }
}

type Props = {
  venue: SportsVenue
  courts: VenueCourt[]
  weeklyHours: VenueWeeklyHour[]
  reviewStats: PublicVenueReviewStats | null
  recentReviews: PublicVenueReviewSnippet[]
}

type AuthGateReason = 'create' | 'nav'

export function VenueCentroClient({
  venue,
  courts,
  weeklyHours,
  reviewStats,
  recentReviews,
}: Props) {
  const [dayStr, setDayStr] = useState(() => toDateInputValue(new Date()))
  const [selectedSlotStartIso, setSelectedSlotStartIso] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [authGateReason, setAuthGateReason] = useState<AuthGateReason | null>(null)

  const day = useMemo(() => fromDateInputValue(dayStr), [dayStr])

  const reservationsQuery = useQuery({
    queryKey: queryKeys.venueCentro.publicReservationsForDay(venue.id, dayStr),
    enabled: isSupabaseConfigured(),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = getBrowserSupabase()
      if (!supabase) return []
      return await fetchVenuePublicReservationsAsRowsForDay(supabase, venue.id, day)
    },
  })
  const reservations = reservationsQuery.data ?? []
  const loading = reservationsQuery.isFetching

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setHasSession(false)
      return
    }
    const supabase = getBrowserSupabase()
    if (!supabase) {
      setHasSession(false)
      return
    }
    let cancelled = false
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setHasSession(Boolean(session?.user))
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session?.user))
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const courtIds = courts.map((c) => c.id)

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

  useEffect(() => {
    setSelectedSlotStartIso(null)
  }, [dayStr])

  useEffect(() => {
    setSelectedSlotStartIso((prev) => {
      if (!prev) return null
      const match = slots.find((s) => s.start.toISOString() === prev)
      if (!match || match.freeCourtIds.length === 0) return null
      return prev
    })
  }, [slots])

  const selectedSlot = useMemo(() => {
    if (!selectedSlotStartIso) return null
    return slots.find((s) => s.start.toISOString() === selectedSlotStartIso) ?? null
  }, [slots, selectedSlotStartIso])

  const dow = WEEKDAY_SHORT_ES[day.getDay()]

  const proceedCreateLoggedIn = (slotStart: Date) => {
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

  const goToAppAuth = (signup: boolean, attachPrefill: boolean) => {
    try {
      if (signup) {
        sessionStorage.setItem(JOIN_REGISTER_STORAGE_KEY, '1')
      } else {
        sessionStorage.removeItem(JOIN_REGISTER_STORAGE_KEY)
      }
    } catch {
      // ignore
    }
    if (
      attachPrefill &&
      selectedSlot &&
      selectedSlot.freeCourtIds.length > 0
    ) {
      queueCreatePrefillAfterAuth(venue, selectedSlot.start)
    }
    setAuthGateReason(null)
    window.location.href = '/?screen=auth'
  }

  return (
    <div className="space-y-8 pb-24">
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

      <VenueCentroReviewsSection stats={reviewStats} reviews={recentReviews} />

      <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground space-y-2">
        <p className="text-foreground font-medium">
          ¿Organizar un partido en {venue.name}?
        </p>
        <p>
          Elige un <strong className="text-foreground">horario libre</strong> en la grilla y
          confirma con <strong className="text-foreground">Crear partido</strong>. Te
          llevamos a <strong className="text-foreground">Crear</strong> con fecha y hora
          listas (inicia sesión o regístrate si hace falta).
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Calendar className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Horarios disponibles
                </h2>
                <p className="text-xs text-muted-foreground">{dow}</p>
              </div>
            </div>
            <InputDate value={dayStr} onChange={setDayStr} />
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              Tramos de <span className="font-medium text-foreground">{venue.slotDurationMinutes} min</span>.
              Los ocupados aparecen deshabilitados. Al publicar se asigna una cancha libre si hay cupo.
            </span>
          </p>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando horarios…</p>
          ) : weeklyHours.length === 0 || courts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Este centro aún no tiene horario o canchas configurados en la app.
            </p>
          ) : slots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay apertura este día o no quedan tramos.
            </p>
          ) : (
            <>
              <div
                className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5"
                role="list"
                aria-label="Horarios del día"
              >
                {slots.map((s) => {
                  const free = s.freeCourtIds.length
                  const available = free > 0
                  const startLabel = `${pad2(s.start.getHours())}:${pad2(s.start.getMinutes())}`
                  const endLabel = `${pad2(s.end.getHours())}:${pad2(s.end.getMinutes())}`
                  const rangeLabel = `${startLabel} – ${endLabel}`
                  const iso = s.start.toISOString()
                  const isSelected = selectedSlotStartIso === iso
                  return (
                    <button
                      key={iso}
                      type="button"
                      role="listitem"
                      disabled={!available}
                      aria-label={
                        available
                          ? `${rangeLabel}, ${free} de ${s.totalCourts} canchas libres`
                          : `${rangeLabel}, sin cupo`
                      }
                      aria-pressed={available ? isSelected : undefined}
                      onClick={() => {
                        if (!available) return
                        setSelectedSlotStartIso(isSelected ? null : iso)
                      }}
                      className={cn(
                        'flex min-h-[3.25rem] flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-center transition-all',
                        !available &&
                          'cursor-not-allowed border-border/50 bg-muted/20 text-muted-foreground opacity-60',
                        available &&
                          !isSelected &&
                          'border-border bg-background shadow-xs hover:border-primary/35 hover:bg-primary/[0.04]',
                        available &&
                          isSelected &&
                          'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/25',
                      )}
                    >
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {startLabel}
                      </span>
                      {available ? (
                        <span className="mt-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                          {free}/{s.totalCourts} canchas libres
                        </span>
                      ) : (
                        <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                          Lleno
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {selectedSlot && selectedSlot.freeCourtIds.length > 0 ? (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
                  <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-primary">
                        Horario elegido
                      </p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">
                        {pad2(selectedSlot.start.getHours())}:
                        {pad2(selectedSlot.start.getMinutes())} –{' '}
                        {pad2(selectedSlot.end.getHours())}:
                        {pad2(selectedSlot.end.getMinutes())}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedSlot.freeCourtIds.length} cancha(s) libre(s) de{' '}
                      {selectedSlot.totalCourts}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    className="h-11 w-full font-semibold shadow-sm"
                    onClick={() => {
                      if (hasSession) {
                        proceedCreateLoggedIn(selectedSlot.start)
                        return
                      }
                      setAuthGateReason('create')
                    }}
                  >
                    Crear partido en este horario
                  </Button>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  Selecciona un horario disponible para continuar.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <Dialog
        open={authGateReason !== null}
        onOpenChange={(open) => {
          if (!open) setAuthGateReason(null)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Entra a SPORTMATCH</DialogTitle>
            <DialogDescription>
              {authGateReason === 'create'
                ? 'Para crear un partido en este centro e intentar reservar la cancha necesitas una cuenta.'
                : 'Para usar Inicio, Explorar, Partidos y el resto de la app necesitas iniciar sesión o registrarte.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className="w-full"
              onClick={() => goToAppAuth(false, authGateReason === 'create')}
            >
              Iniciar sesión
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => goToAppAuth(true, authGateReason === 'create')}
            >
              Crear cuenta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PublicAppBottomNav
        hasSession={hasSession}
        onRequireAuth={() => setAuthGateReason('nav')}
      />
    </div>
  )
}

function PublicAppBottomNav({
  hasSession,
  onRequireAuth,
}: {
  hasSession: boolean
  onRequireAuth: () => void
}) {
  const [activeId, setActiveId] = useState<PlayerNavId | null>(null)

  useEffect(() => {
    setActiveId(readPlayerLastNav())
  }, [])

  const navItems: Array<{
    id: PlayerNavId
    href: string
    icon: typeof Home
    label: string
    isCreate?: boolean
  }> = [
    { id: 'home', href: '/?screen=home', icon: Home, label: 'Inicio' },
    { id: 'explore', href: '/?screen=explore', icon: Search, label: 'Explorar' },
    { id: 'matches', href: '/?screen=matches', icon: LayoutList, label: 'Partidos' },
    {
      id: 'create',
      href: '/?screen=create',
      icon: PlusCircle,
      label: 'Crear',
      isCreate: true,
    },
    { id: 'teams', href: '/?screen=teams', icon: Users, label: 'Equipos' },
    { id: 'profile', href: '/?screen=profile', icon: User, label: 'Perfil' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background safe-area-inset-bottom">
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isCreate = Boolean(item.isCreate)
          const isActive = activeId === item.id
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={(e) => {
                if (!hasSession) {
                  e.preventDefault()
                  onRequireAuth()
                  return
                }
                persistPlayerLastNav(item.id)
                setActiveId(item.id)
              }}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center py-1 transition-colors ${
                isCreate
                  ? 'text-primary'
                  : isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className={isCreate ? 'relative' : ''}>
                {isCreate ? (
                  <div className="absolute inset-0 scale-150 animate-pulse rounded-full bg-primary/20" />
                ) : null}
                <Icon className={isCreate ? 'h-6 w-6 sm:h-7 sm:w-7' : 'h-5 w-5 sm:h-6 sm:w-6'} />
              </div>
              <span
                className={`mt-0.5 max-w-[64px] truncate text-center text-[10px] leading-tight sm:text-xs ${
                  isCreate ? 'font-medium' : ''
                }`}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
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
      className="h-10 w-full max-w-[11.5rem] rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground shadow-xs outline-none transition-[box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  )
}
