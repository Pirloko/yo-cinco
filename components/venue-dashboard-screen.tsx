'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/lib/app-context'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  fetchVenueForOwner,
  fetchVenueCourts,
  fetchVenueWeeklyHours,
  fetchVenueReservationsRange,
} from '@/lib/supabase/venue-queries'
import type {
  SportsVenue,
  VenueCourt,
  VenueReservationRow,
  VenueWeeklyHour,
} from '@/lib/types'
import {
  buildFullPlayerWhatsapp,
  extractWhatsappSuffix8,
  isCompleteWhatsappSuffix,
  isValidFullPlayerWhatsapp,
  PLAYER_WHATSAPP_PREFIX,
  sanitizeWhatsappSuffixInput,
} from '@/lib/player-whatsapp'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Activity,
  BarChart3,
  Calendar,
  Clock,
  KeyRound,
  LayoutGrid,
  Link2,
  LogOut,
  MapPin,
  MessageCircle,
  Plus,
  Trash2,
} from 'lucide-react'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { ThemeMenuButton } from '@/components/theme-controls'
import { hmToMinutes } from '@/lib/venue-slots'

function manualSlotFitsVenueHours(
  dayStr: string,
  timeHm: string,
  durationMinutes: number,
  weekly: VenueWeeklyHour[]
): boolean {
  const d = new Date(`${dayStr}T12:00:00`)
  const dow = d.getDay()
  const wh = weekly.find((h) => h.dayOfWeek === dow)
  if (!wh) return false
  const openMin = hmToMinutes(wh.openTime.slice(0, 5))
  const closeMin = hmToMinutes(wh.closeTime.slice(0, 5))
  const startMin = hmToMinutes(timeHm)
  const endMin = startMin + durationMinutes
  return startMin >= openMin && endMin <= closeMin
}

function courtFreeForInterval(
  courtId: string,
  startsAt: Date,
  endsAt: Date,
  reservations: Array<{
    courtId: string
    startsAt: Date
    endsAt: Date
    status: string
  }>
): boolean {
  for (const r of reservations) {
    if (r.status === 'cancelled') continue
    if (r.courtId !== courtId) continue
    if (r.startsAt < endsAt && r.endsAt > startsAt) return false
  }
  return true
}

/** Tramo [start,end) alineado a la grilla del centro (solo si ahora está dentro del horario). */
function snapCurrentSlotLocal(
  now: Date,
  weekly: VenueWeeklyHour[],
  slotMin: number
): { start: Date; end: Date } | null {
  const y = now.getFullYear()
  const mo = now.getMonth()
  const da = now.getDate()
  const dow = now.getDay()
  const wh = weekly.find((h) => h.dayOfWeek === dow)
  if (!wh) return null
  const openM = hmToMinutes(wh.openTime.slice(0, 5))
  const closeM = hmToMinutes(wh.closeTime.slice(0, 5))
  const nowM = now.getHours() * 60 + now.getMinutes()
  if (nowM < openM || nowM >= closeM) return null
  const rel = nowM - openM
  const idx = Math.floor(rel / slotMin)
  const startM = openM + idx * slotMin
  const endM = startM + slotMin
  if (endM > closeM) return null
  const start = new Date(y, mo, da, Math.floor(startM / 60), startM % 60, 0, 0)
  const end = new Date(start.getTime() + slotMin * 60 * 1000)
  return { start, end }
}

/**
 * Cupos (cancha × tramo) libres vs totales para un día local concreto.
 * Cada tramo dura slotMin y va de open a close del día en weekly.
 */
function countDaySlotCourtAvailability(
  day: Date,
  weekly: VenueWeeklyHour[],
  courts: VenueCourt[],
  slotMin: number,
  reservations: VenueReservationRow[]
): {
  free: number
  total: number
  numSlots: number
  courtsWithFreeSlot: number
  closedReason: 'no_hours' | 'no_courts' | null
} {
  if (courts.length === 0) {
    return {
      free: 0,
      total: 0,
      numSlots: 0,
      courtsWithFreeSlot: 0,
      closedReason: 'no_courts',
    }
  }
  const y = day.getFullYear()
  const mo = day.getMonth()
  const da = day.getDate()
  const dow = day.getDay()
  const wh = weekly.find((h) => h.dayOfWeek === dow)
  if (!wh) {
    return {
      free: 0,
      total: 0,
      numSlots: 0,
      courtsWithFreeSlot: 0,
      closedReason: 'no_hours',
    }
  }
  const openM = hmToMinutes(wh.openTime.slice(0, 5))
  const closeM = hmToMinutes(wh.closeTime.slice(0, 5))
  const span = closeM - openM
  if (span <= 0) {
    return {
      free: 0,
      total: 0,
      numSlots: 0,
      courtsWithFreeSlot: 0,
      closedReason: 'no_hours',
    }
  }
  const numSlots = Math.floor(span / slotMin)
  if (numSlots <= 0) {
    return {
      free: 0,
      total: 0,
      numSlots: 0,
      courtsWithFreeSlot: 0,
      closedReason: 'no_hours',
    }
  }
  const dayStart = new Date(y, mo, da, 0, 0, 0, 0)
  const nextMidnight = new Date(y, mo, da + 1, 0, 0, 0, 0)
  const overlapRows = reservations
    .filter(
      (r) =>
        r.status !== 'cancelled' &&
        r.endsAt > dayStart &&
        r.startsAt < nextMidnight
    )
    .map((r) => ({
      courtId: r.courtId,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      status: r.status,
    }))

  const courtSawFree = new Set<string>()
  let free = 0
  const total = numSlots * courts.length
  for (let i = 0; i < numSlots; i++) {
    const startM = openM + i * slotMin
    const start = new Date(
      y,
      mo,
      da,
      Math.floor(startM / 60),
      startM % 60,
      0,
      0
    )
    const end = new Date(start.getTime() + slotMin * 60 * 1000)
    for (const c of courts) {
      if (courtFreeForInterval(c.id, start, end, overlapRows)) {
        free++
        courtSawFree.add(c.id)
      }
    }
  }
  return {
    free,
    total,
    numSlots,
    courtsWithFreeSlot: courtSawFree.size,
    closedReason: null,
  }
}

function dashboardPeriodRange(period: 'today' | '7d' | '30d'): {
  from: Date
  to: Date
} {
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  if (period === 'today') {
    return { from, to }
  }
  if (period === '7d') {
    from.setDate(from.getDate() - 6)
    return { from, to }
  }
  from.setDate(from.getDate() - 29)
  return { from, to }
}

type DayHours = { open: string; close: string } | null

const WEEKDAY_LONG_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const

const DEFAULT_OPEN_CLOSE: { open: string; close: string } = {
  open: '09:00',
  close: '22:00',
}

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
  const [tab, setTab] = useState<
    'dashboard' | 'bookings' | 'profile' | 'courts' | 'hours'
  >('bookings')
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
  const [hoursQuickOpen, setHoursQuickOpen] = useState(DEFAULT_OPEN_CLOSE.open)
  const [hoursQuickClose, setHoursQuickClose] = useState(DEFAULT_OPEN_CLOSE.close)
  const [hoursSaving, setHoursSaving] = useState(false)

  const bookingsFetchGen = useRef(0)
  const dashboardFetchGen = useRef(0)
  const tabRef = useRef<
    'dashboard' | 'bookings' | 'profile' | 'courts' | 'hours'
  >('bookings')
  useEffect(() => {
    tabRef.current = tab
  }, [tab])

  const [dashboardPeriod, setDashboardPeriod] = useState<
    'today' | '7d' | '30d'
  >('7d')
  const [dashboardRows, setDashboardRows] = useState<VenueReservationRow[]>([])
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<
    'all' | 'pending' | 'confirmed' | 'cancelled'
  >('all')
  const [historyLimit, setHistoryLimit] = useState(40)

  const [newCourtName, setNewCourtName] = useState('')
  /** Sufijo móvil Chile (+569 ya fijo en UI). */
  const [phoneSuffix, setPhoneSuffix] = useState('')
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualForm, setManualForm] = useState({
    courtId: '',
    time: '20:00',
    clientName: '',
    /** 8 dígitos tras +569 (vacío = sin WhatsApp del cliente). */
    clientWhatsappSuffix: '',
    status: 'pending' as 'pending' | 'confirmed',
    note: '',
  })

  const ownerId = currentUser?.id
  const reloadAll = useCallback(async () => {
    if (!ownerId || !isSupabaseConfigured()) return
    const supabase = createClient()
    const v = await fetchVenueForOwner(supabase, ownerId)
    setVenue(v)
    if (!v) {
      setCourts([])
      setWeeklyLoaded([])
      setPhoneSuffix('')
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
    setPhoneSuffix(extractWhatsappSuffix8(v.phone))
    const hb: Record<number, DayHours> = {}
    for (let d = 0; d <= 6; d++) hb[d] = null
    for (const h of wList) {
      hb[h.dayOfWeek] = { open: h.openTime, close: h.closeTime }
    }
    setHoursByDay(hb)
  }, [ownerId])

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

  const loadBookingsForSelectedDay = useCallback(async () => {
    const venueId = venue?.id
    if (!venueId || !isSupabaseConfigured()) return
    const gen = ++bookingsFetchGen.current
    const supabase = createClient()
    const d = new Date(dayStr + 'T12:00:00')
    const start = new Date(d)
    start.setHours(0, 0, 0, 0)
    const end = new Date(d)
    end.setHours(23, 59, 59, 999)
    const list = await fetchVenueReservationsRange(
      supabase,
      venueId,
      start.toISOString(),
      end.toISOString()
    )
    if (gen !== bookingsFetchGen.current) return
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
      if (gen !== bookingsFetchGen.current) return
      for (const m of matches ?? []) {
        const id = m.id as string
        const creatorId = m.creator_id as string
        contactIds.add(creatorId)
        mMap.set(id, { id, title: (m.title as string) ?? 'Partido', creatorId })
      }
    }
    if (gen !== bookingsFetchGen.current) return
    setMatchById(mMap)

    for (const id of fallbackBookerIds) contactIds.add(id)
    if (contactIds.size === 0) {
      if (gen !== bookingsFetchGen.current) return
      setOrganizerById(new Map())
      return
    }
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, name, whatsapp_phone')
      .in('id', [...contactIds])
    if (gen !== bookingsFetchGen.current) return
    const pMap = new Map<string, { id: string; name: string; whatsappPhone: string | null }>()
    for (const p of profs ?? []) {
      pMap.set(p.id as string, {
        id: p.id as string,
        name: (p.name as string) ?? 'Organizador',
        whatsappPhone: (p.whatsapp_phone as string | null) ?? null,
      })
    }
    setOrganizerById(pMap)
  }, [venue?.id, dayStr])

  const loadDashboardRange = useCallback(async () => {
    const venueId = venue?.id
    if (!venueId || !isSupabaseConfigured()) return
    const gen = ++dashboardFetchGen.current
    setDashboardLoading(true)
    try {
      const supabase = createClient()
      const { from, to } = dashboardPeriodRange(dashboardPeriod)
      const list = await fetchVenueReservationsRange(
        supabase,
        venueId,
        from.toISOString(),
        to.toISOString()
      )
      if (gen !== dashboardFetchGen.current) return
      setDashboardRows(list)
    } finally {
      if (gen === dashboardFetchGen.current) setDashboardLoading(false)
    }
  }, [venue?.id, dashboardPeriod])

  useEffect(() => {
    void loadBookingsForSelectedDay()
  }, [loadBookingsForSelectedDay])

  useEffect(() => {
    if (tab !== 'dashboard' || !venue?.id) return
    void loadDashboardRange()
  }, [tab, venue?.id, loadDashboardRange])

  /** Nuevas reservas / cambios desde jugadores u otros clientes (RLS limita al centro del dueño). */
  useEffect(() => {
    if (!venue?.id || !isSupabaseConfigured()) return
    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch {
      return
    }
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void loadBookingsForSelectedDay()
        if (tabRef.current === 'dashboard') void loadDashboardRange()
      }, 280)
    }
    const channel = supabase
      .channel(`venue-dashboard-bookings:${venue.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'venue_reservations' },
        scheduleReload
      )
      .subscribe()
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      void supabase.removeChannel(channel)
    }
  }, [venue?.id, loadBookingsForSelectedDay, loadDashboardRange])

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

  const manualSlotMinutes = venue?.slotDurationMinutes ?? 60

  const manualAvailableCourts = useMemo(() => {
    if (!venue || courts.length === 0) return []
    const t = manualForm.time.trim()
    if (!/^\d{2}:\d{2}$/.test(t)) return []
    if (!manualSlotFitsVenueHours(dayStr, t, manualSlotMinutes, weeklyLoaded)) {
      return []
    }
    const startsAt = new Date(`${dayStr}T${t}:00`)
    if (Number.isNaN(startsAt.getTime())) return []
    const endsAt = new Date(startsAt.getTime() + manualSlotMinutes * 60 * 1000)
    return courts.filter((c) =>
      courtFreeForInterval(c.id, startsAt, endsAt, reservations)
    )
  }, [
    venue,
    courts,
    dayStr,
    manualForm.time,
    manualSlotMinutes,
    weeklyLoaded,
    reservations,
  ])

  useEffect(() => {
    setManualForm((f) => {
      if (!f.courtId) return f
      const ok = manualAvailableCourts.some((c) => c.id === f.courtId)
      if (ok) return f
      return { ...f, courtId: '' }
    })
  }, [manualAvailableCourts])

  const createManualReservation = async () => {
    if (!venue || !isSupabaseConfigured()) return
    if (!manualForm.courtId) {
      toast.error('Selecciona una cancha disponible para la hora elegida.')
      return
    }
    if (!/^\d{2}:\d{2}$/.test(manualForm.time.trim())) {
      toast.error('Ingresa una hora válida.')
      return
    }
    const suffix = sanitizeWhatsappSuffixInput(manualForm.clientWhatsappSuffix)
    if (suffix.length > 0 && !isCompleteWhatsappSuffix(suffix)) {
      toast.error(
        `WhatsApp del cliente: ${PLAYER_WHATSAPP_PREFIX} más 8 dígitos (o déjalo vacío).`
      )
      return
    }
    const clientWhatsappFull =
      suffix.length > 0 ? buildFullPlayerWhatsapp(suffix) : ''
    const startsAt = new Date(`${dayStr}T${manualForm.time}:00`)
    if (Number.isNaN(startsAt.getTime())) {
      toast.error('Fecha u hora inválida.')
      return
    }
    const endsAt = new Date(startsAt.getTime() + manualSlotMinutes * 60 * 1000)
    const now = new Date()
    if (startsAt.getTime() < now.getTime() - 5 * 60 * 1000) {
      toast.error('No puedes crear reservas manuales en el pasado.')
      return
    }
    if (
      !manualAvailableCourts.some((c) => c.id === manualForm.courtId)
    ) {
      toast.error('Esa cancha ya no está libre a esa hora. Elige otra u horario.')
      return
    }

    setManualSaving(true)
    try {
      const noteParts = [
        'manual_reservation',
        manualForm.clientName.trim() ? `cliente:${manualForm.clientName.trim()}` : '',
        clientWhatsappFull ? `telefono:${clientWhatsappFull}` : '',
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
        courtId: '',
        clientName: '',
        clientWhatsappSuffix: '',
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

  const [clockTick, setClockTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 45_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setHistoryLimit(40)
  }, [dashboardPeriod])

  const dashboardKpis = useMemo(() => {
    let pending = 0
    let confirmed = 0
    let cancelled = 0
    let paidOrDeposit = 0
    for (const r of dashboardRows) {
      if (r.status === 'pending') pending++
      else if (r.status === 'confirmed') {
        confirmed++
        if (r.paymentStatus === 'paid' || r.paymentStatus === 'deposit_paid')
          paidOrDeposit++
      } else if (r.status === 'cancelled') cancelled++
    }
    return {
      pending,
      confirmed,
      cancelled,
      paidOrDeposit,
    }
  }, [dashboardRows])

  /** Siempre día calendario actual (no depende del filtro Hoy/7d/30d). */
  const todaySlotAvailability = useMemo(() => {
    void clockTick
    const today = new Date()
    const slotMin = venue?.slotDurationMinutes ?? 60
    return countDaySlotCourtAvailability(
      today,
      weeklyLoaded,
      courts,
      slotMin,
      dashboardRows
    )
  }, [
    clockTick,
    venue?.slotDurationMinutes,
    weeklyLoaded,
    courts,
    dashboardRows,
  ])

  const liveAvailability = useMemo(() => {
    void clockTick
    const now = new Date()
    const slotMin = venue?.slotDurationMinutes ?? 60
    const slot = snapCurrentSlotLocal(now, weeklyLoaded, slotMin)
    if (!slot) {
      return {
        slot: null as { start: Date; end: Date } | null,
        freeCount: 0,
        totalCourts: courts.length,
      }
    }
    const overlapRows = dashboardRows.map((r) => ({
      courtId: r.courtId,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      status: r.status,
    }))
    let free = 0
    for (const c of courts) {
      if (
        courtFreeForInterval(c.id, slot.start, slot.end, overlapRows)
      )
        free++
    }
    return { slot, freeCount: free, totalCourts: courts.length }
  }, [
    clockTick,
    venue?.slotDurationMinutes,
    weeklyLoaded,
    courts,
    dashboardRows,
  ])

  const dashboardHistoryRows = useMemo(() => {
    const filtered =
      historyFilter === 'all'
        ? dashboardRows
        : dashboardRows.filter((r) => r.status === historyFilter)
    return [...filtered].sort(
      (a, b) => b.startsAt.getTime() - a.startsAt.getTime()
    )
  }, [dashboardRows, historyFilter])

  const visibleHistory = useMemo(
    () => dashboardHistoryRows.slice(0, historyLimit),
    [dashboardHistoryRows, historyLimit]
  )

  const saveVenueContactProfile = async () => {
    if (!venue) return
    const name = profileForm.name.trim()
    if (!name) {
      toast.error('Indica el nombre del centro.')
      return
    }
    const fullPhone = buildFullPlayerWhatsapp(phoneSuffix)
    if (!isValidFullPlayerWhatsapp(fullPhone)) {
      toast.error(
        `El teléfono debe ser ${PLAYER_WHATSAPP_PREFIX} seguido de 8 dígitos.`
      )
      return
    }
    setProfileSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('sports_venues')
        .update({
          name,
          phone: fullPhone,
        })
        .eq('id', venue.id)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Nombre y teléfono actualizados.')
      await reloadAll()
    } finally {
      setProfileSaving(false)
    }
  }

  const changeVenuePassword = async () => {
    if (pwNew.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (pwNew !== pwConfirm) {
      toast.error('La nueva contraseña y la confirmación no coinciden.')
      return
    }
    if (!pwCurrent) {
      toast.error('Ingresa tu contraseña actual.')
      return
    }
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const email = user?.email?.trim()
    if (!email) {
      toast.error('No se encontró el correo de la cuenta.')
      return
    }
    setPwSaving(true)
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: pwCurrent,
      })
      if (signErr) {
        toast.error('La contraseña actual no es correcta.')
        return
      }
      const { error: upErr } = await supabase.auth.updateUser({
        password: pwNew,
      })
      if (upErr) {
        toast.error(upErr.message)
        return
      }
      toast.success('Contraseña actualizada. Usa la nueva clave la próxima vez que entres.')
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
    } finally {
      setPwSaving(false)
    }
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

  const applyHoursTemplate = (dayIndices: readonly number[]) => {
    const open = hoursQuickOpen.trim() || DEFAULT_OPEN_CLOSE.open
    const close = hoursQuickClose.trim() || DEFAULT_OPEN_CLOSE.close
    const o = hmToMinutes(open)
    const c = hmToMinutes(close)
    if (!Number.isFinite(o) || !Number.isFinite(c) || o >= c) {
      toast.error('Revisa el horario de los atajos: apertura debe ser antes del cierre.')
      return
    }
    setHoursByDay((prev) => {
      const next = { ...prev }
      for (const d of dayIndices) {
        next[d] = { open, close }
      }
      return next
    })
    toast.success('Horario aplicado en la tabla. Pulsa «Guardar horario» para confirmar.')
  }

  const closeWeekendDays = () => {
    setHoursByDay((prev) => ({ ...prev, 0: null, 6: null }))
    toast.success('Sábado y domingo marcados como cerrados. Guarda para confirmar.')
  }

  const saveHours = async () => {
    if (!venue) return
    for (let d = 0; d <= 6; d++) {
      const cfg = hoursByDay[d]
      if (!cfg) continue
      const o = hmToMinutes(cfg.open)
      const c = hmToMinutes(cfg.close)
      if (!Number.isFinite(o) || !Number.isFinite(c)) {
        toast.error(
          `Horario inválido el ${WEEKDAY_LONG_ES[d]}. Usa formato HH:MM.`
        )
        return
      }
      if (o >= c) {
        toast.error(
          `El cierre debe ser después de la apertura (${WEEKDAY_LONG_ES[d]}).`
        )
        return
      }
    }
    setHoursSaving(true)
    const supabase = createClient()
    try {
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
    } finally {
      setHoursSaving(false)
    }
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
                ['dashboard', 'Resumen', BarChart3],
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
            {tab === 'dashboard' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['today', 'Hoy'],
                      ['7d', '7 días'],
                      ['30d', '30 días'],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      size="sm"
                      variant={dashboardPeriod === id ? 'default' : 'outline'}
                      onClick={() =>
                        setDashboardPeriod(id as 'today' | '7d' | '30d')
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Pendientes, confirmadas y canceladas cuentan reservas del
                  periodo elegido. La tarjeta «Hoy» muestra cupos disponibles
                  según la fecha de hoy y el horario del centro.
                </p>

                {dashboardLoading ? (
                  <div className="flex justify-center py-8">
                    <div
                      className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent"
                      aria-label="Cargando resumen"
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="bg-card border-border">
                        <CardHeader className="p-3 pb-1">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Pendientes
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <p className="text-2xl font-semibold tabular-nums">
                            {dashboardKpis.pending}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="bg-card border-border">
                        <CardHeader className="p-3 pb-1">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Confirmadas
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <p className="text-2xl font-semibold tabular-nums">
                            {dashboardKpis.confirmed}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {dashboardKpis.paidOrDeposit} con pago/abono
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="bg-card border-border">
                        <CardHeader className="p-3 pb-1">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Canceladas
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <p className="text-2xl font-semibold tabular-nums">
                            {dashboardKpis.cancelled}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="bg-card border-border border-emerald-500/25">
                        <CardHeader className="p-3 pb-1">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Cupos libres (hoy)
                          </CardTitle>
                          <CardDescription className="text-[11px] pt-0.5 capitalize">
                            {new Date().toLocaleDateString('es-CL', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-1">
                          {todaySlotAvailability.closedReason === 'no_courts' ? (
                            <p className="text-sm text-muted-foreground">
                              Agrega canchas para ver disponibilidad.
                            </p>
                          ) : todaySlotAvailability.closedReason ===
                            'no_hours' ? (
                            <p className="text-sm text-muted-foreground">
                              Sin horario configurado para hoy o día cerrado.
                            </p>
                          ) : (
                            <>
                              <p className="text-2xl font-semibold tabular-nums">
                                <span className="text-primary">
                                  {todaySlotAvailability.free}
                                </span>
                                <span className="text-muted-foreground font-normal text-lg">
                                  {' '}
                                  / {todaySlotAvailability.total}
                                </span>
                              </p>
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                Cupos = cada tramo de{' '}
                                {venue?.slotDurationMinutes ?? 60} min en cada
                                cancha ({todaySlotAvailability.numSlots} tramos
                                × {courts.length}{' '}
                                {courts.length === 1 ? 'cancha' : 'canchas'}).
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Canchas con al menos un cupo libre hoy:{' '}
                                <span className="text-foreground font-medium tabular-nums">
                                  {todaySlotAvailability.courtsWithFreeSlot}
                                </span>{' '}
                                de {courts.length}
                              </p>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="bg-card border-border border-primary/20">
                      <CardHeader className="p-3 pb-2">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" />
                          <CardTitle className="text-base">Ahora</CardTitle>
                        </div>
                        <CardDescription className="text-xs">
                          Tramo actual según duración de cupos (
                          {venue?.slotDurationMinutes ?? 60} min) y horario del
                          centro.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 space-y-2 text-sm">
                        {liveAvailability.slot ? (
                          <>
                            <p className="text-foreground font-medium">
                              {liveAvailability.slot.start.toLocaleTimeString(
                                'es-CL',
                                { hour: '2-digit', minute: '2-digit' }
                              )}{' '}
                              –{' '}
                              {liveAvailability.slot.end.toLocaleTimeString(
                                'es-CL',
                                { hour: '2-digit', minute: '2-digit' }
                              )}
                            </p>
                            {liveAvailability.totalCourts === 0 ? (
                              <p className="text-muted-foreground">
                                No hay canchas cargadas.
                              </p>
                            ) : (
                              <p>
                                <span className="font-semibold text-primary tabular-nums">
                                  {liveAvailability.freeCount}
                                </span>{' '}
                                de {liveAvailability.totalCourts} canchas libres
                                en este tramo.
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-muted-foreground">
                            Fuera de horario de atención hoy o sin franja
                            definida para este momento.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <Label className="text-foreground font-medium">
                          Historial en el periodo
                        </Label>
                        <select
                          value={historyFilter}
                          onChange={(e) =>
                            setHistoryFilter(
                              e.target.value as typeof historyFilter
                            )
                          }
                          className="h-9 rounded-md border border-border bg-secondary px-2 text-sm text-foreground"
                        >
                          <option value="all">Todos</option>
                          <option value="pending">Pendientes</option>
                          <option value="confirmed">Confirmadas</option>
                          <option value="cancelled">Canceladas</option>
                        </select>
                      </div>
                      {visibleHistory.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">
                          No hay reservas en este periodo con el filtro
                          seleccionado.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {visibleHistory.map((r) => (
                            <li key={r.id}>
                              <Card className="bg-card border-border">
                                <CardContent className="p-3 text-sm flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium">
                                      {courtNameById.get(r.courtId) ?? 'Cancha'}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      {r.startsAt.toLocaleString('es-CL', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}{' '}
                                      –{' '}
                                      {r.endsAt.toLocaleTimeString('es-CL', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </p>
                                  </div>
                                  <Badge
                                    variant={
                                      r.status === 'cancelled'
                                        ? 'secondary'
                                        : r.status === 'pending'
                                          ? 'outline'
                                          : 'default'
                                    }
                                    className="shrink-0"
                                  >
                                    {r.status === 'pending'
                                      ? 'Pendiente'
                                      : r.status === 'confirmed'
                                        ? 'Confirmada'
                                        : 'Cancelada'}
                                  </Badge>
                                </CardContent>
                              </Card>
                            </li>
                          ))}
                        </ul>
                      )}
                      {dashboardHistoryRows.length > historyLimit ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() =>
                            setHistoryLimit((n) => n + 40)
                          }
                        >
                          Cargar más ({dashboardHistoryRows.length - historyLimit}{' '}
                          restantes)
                        </Button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )}

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
                  <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Reserva manual (cliente externo)
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Elige fecha y hora: solo verás canchas libres en ese tramo (
                          {manualSlotMinutes} min, según la configuración del centro). La
                          lista se actualiza con las reservas del día.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Fecha</Label>
                          <Input
                            type="date"
                            value={dayStr}
                            onChange={(e) => setDayStr(e.target.value)}
                            className="h-11 bg-secondary border-border"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Hora de inicio</Label>
                          <Input
                            type="time"
                            value={manualForm.time}
                            onChange={(e) =>
                              setManualForm((f) => ({ ...f, time: e.target.value }))
                            }
                            className="h-11 bg-secondary border-border"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Cancha disponible</Label>
                        <select
                          value={manualForm.courtId}
                          onChange={(e) =>
                            setManualForm((f) => ({ ...f, courtId: e.target.value }))
                          }
                          disabled={manualAvailableCourts.length === 0}
                          className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground disabled:opacity-60"
                        >
                          <option value="">
                            {manualAvailableCourts.length === 0
                              ? 'Sin canchas libres a esta hora'
                              : 'Seleccionar cancha'}
                          </option>
                          {manualAvailableCourts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {courts.length > 0 &&
                        /^\d{2}:\d{2}$/.test(manualForm.time.trim()) &&
                        manualAvailableCourts.length === 0 ? (
                          <p className="text-[11px] text-amber-700 dark:text-amber-300">
                            No hay cupo en ninguna cancha a esta hora, o el horario queda
                            fuera del calendario del centro ese día.
                          </p>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Estado inicial</Label>
                          <select
                            value={manualForm.status}
                            onChange={(e) =>
                              setManualForm((f) => ({
                                ...f,
                                status: e.target.value as 'pending' | 'confirmed',
                              }))
                            }
                            className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground"
                          >
                            <option value="pending">Pendiente</option>
                            <option value="confirmed">Confirmada</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Nombre cliente</Label>
                          <Input
                            value={manualForm.clientName}
                            onChange={(e) =>
                              setManualForm((f) => ({ ...f, clientName: e.target.value }))
                            }
                            placeholder="Ej: Carlos"
                            className="h-11 bg-secondary border-border"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                          WhatsApp cliente (opcional)
                        </Label>
                        <div className="flex h-11 items-stretch rounded-md border border-border overflow-hidden bg-secondary">
                          <span className="flex items-center px-3 text-xs font-medium text-muted-foreground border-r border-border bg-muted/40 shrink-0">
                            {PLAYER_WHATSAPP_PREFIX}
                          </span>
                          <Input
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            value={manualForm.clientWhatsappSuffix}
                            onChange={(e) =>
                              setManualForm((f) => ({
                                ...f,
                                clientWhatsappSuffix: sanitizeWhatsappSuffixInput(
                                  e.target.value
                                ),
                              }))
                            }
                            placeholder="12345678"
                            className="h-full border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Exactamente 8 dígitos; vacío si el cliente no dejó número.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Nota interna (opcional)</Label>
                        <Input
                          value={manualForm.note}
                          onChange={(e) =>
                            setManualForm((f) => ({ ...f, note: e.target.value }))
                          }
                          placeholder="Observación solo para el centro"
                          className="h-11 bg-secondary border-border"
                        />
                      </div>

                      <Button
                        size="default"
                        className="w-full sm:w-auto"
                        onClick={() => void createManualReservation()}
                        disabled={manualSaving || !manualForm.courtId}
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
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Dirección, mapa, ciudad y duración de tramos los gestiona el
                  administrador. Aquí puedes actualizar el nombre visible, el
                  teléfono de contacto y tu contraseña de acceso.
                </p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="venue-profile-name">Nombre del centro</Label>
                    <Input
                      id="venue-profile-name"
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, name: e.target.value })
                      }
                      className="bg-secondary border-border"
                      autoComplete="organization"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="venue-profile-phone">Teléfono de contacto</Label>
                    <div className="flex max-w-md items-center gap-2">
                      <span className="text-sm tabular-nums text-muted-foreground shrink-0">
                        {PLAYER_WHATSAPP_PREFIX}
                      </span>
                      <Input
                        id="venue-profile-phone"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="12345678"
                        value={phoneSuffix}
                        onChange={(e) =>
                          setPhoneSuffix(sanitizeWhatsappSuffixInput(e.target.value))
                        }
                        className="bg-secondary border-border flex-1"
                        maxLength={8}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Móvil Chile: 8 dígitos tras {PLAYER_WHATSAPP_PREFIX}.
                    </p>
                  </div>
                  <Button
                    type="button"
                    disabled={profileSaving}
                    onClick={() => void saveVenueContactProfile()}
                  >
                    {profileSaving ? 'Guardando…' : 'Guardar nombre y teléfono'}
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-primary" aria-hidden />
                    Cambiar contraseña
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Debes escribir tu contraseña actual para poder definir una nueva.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="venue-pw-current">Contraseña actual</Label>
                    <Input
                      id="venue-pw-current"
                      type="password"
                      autoComplete="current-password"
                      value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                      className="bg-secondary border-border max-w-md"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="venue-pw-new">Nueva contraseña</Label>
                    <Input
                      id="venue-pw-new"
                      type="password"
                      autoComplete="new-password"
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      className="bg-secondary border-border max-w-md"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="venue-pw-confirm">Confirmar nueva contraseña</Label>
                    <Input
                      id="venue-pw-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                      className="bg-secondary border-border max-w-md"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pwSaving}
                    onClick={() => void changeVenuePassword()}
                  >
                    {pwSaving ? 'Actualizando…' : 'Actualizar contraseña'}
                  </Button>
                </div>
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
              <div className="space-y-5">
                <Card className="gap-0 py-4 shadow-sm">
                  <CardHeader className="px-4 pb-2 pt-0 sm:px-5">
                    <CardTitle className="text-base">Atajos</CardTitle>
                    <CardDescription>
                      Elige apertura y cierre una vez y repítelos en varios días. Luego
                      confirma con «Guardar horario».
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 sm:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className="space-y-1.5">
                        <Label htmlFor="hours-quick-open" className="text-xs">
                          Desde
                        </Label>
                        <Input
                          id="hours-quick-open"
                          type="time"
                          step={300}
                          value={hoursQuickOpen}
                          onChange={(e) => setHoursQuickOpen(e.target.value)}
                          className="h-10 w-full min-w-[8rem] bg-secondary border-border sm:w-36"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="hours-quick-close" className="text-xs">
                          Hasta
                        </Label>
                        <Input
                          id="hours-quick-close"
                          type="time"
                          step={300}
                          value={hoursQuickClose}
                          onChange={(e) => setHoursQuickClose(e.target.value)}
                          className="h-10 w-full min-w-[8rem] bg-secondary border-border sm:w-36"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          applyHoursTemplate([0, 1, 2, 3, 4, 5, 6])
                        }
                      >
                        Aplicar a toda la semana
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        onClick={() => applyHoursTemplate([1, 2, 3, 4, 5])}
                      >
                        Solo lun–vie
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => closeWeekendDays()}
                      >
                        Cerrar sábado y domingo
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Horario por día</p>
                    <p className="text-xs text-muted-foreground">
                      {Object.values(hoursByDay).filter(Boolean).length}/7 días con
                      atención
                    </p>
                  </div>
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {([0, 1, 2, 3, 4, 5, 6] as const).map((d) => {
                      const row = hoursByDay[d]
                      const isOpen = Boolean(row)
                      return (
                        <div
                          key={d}
                          className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:py-2.5 sm:pl-4 sm:pr-3"
                        >
                          <div className="flex items-center justify-between gap-3 sm:min-w-[11rem] sm:max-w-[11rem]">
                            <span className="text-sm font-medium leading-tight">
                              {WEEKDAY_LONG_ES[d]}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground hidden sm:inline">
                                Abierto
                              </span>
                              <Switch
                                checked={isOpen}
                                onCheckedChange={(on) => {
                                  setHoursByDay((prev) => ({
                                    ...prev,
                                    [d]: on
                                      ? row ?? {
                                          open: hoursQuickOpen || DEFAULT_OPEN_CLOSE.open,
                                          close:
                                            hoursQuickClose || DEFAULT_OPEN_CLOSE.close,
                                        }
                                      : null,
                                  }))
                                }}
                                aria-label={
                                  isOpen
                                    ? `${WEEKDAY_LONG_ES[d]}: abierto`
                                    : `${WEEKDAY_LONG_ES[d]}: cerrado`
                                }
                              />
                            </div>
                          </div>
                          {isOpen && row ? (
                            <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                              <div className="flex flex-1 items-center gap-2 min-w-0 sm:max-w-[11rem]">
                                <Label
                                  htmlFor={`hours-open-${d}`}
                                  className="text-xs text-muted-foreground shrink-0 w-14 sm:w-auto sm:sr-only"
                                >
                                  Abre
                                </Label>
                                <Input
                                  id={`hours-open-${d}`}
                                  type="time"
                                  step={300}
                                  value={row.open}
                                  onChange={(e) =>
                                    setHoursByDay((prev) => ({
                                      ...prev,
                                      [d]: {
                                        open: e.target.value,
                                        close: prev[d]!.close,
                                      },
                                    }))
                                  }
                                  className="h-10 flex-1 bg-secondary border-border"
                                />
                              </div>
                              <div className="flex flex-1 items-center gap-2 min-w-0 sm:max-w-[11rem]">
                                <Label
                                  htmlFor={`hours-close-${d}`}
                                  className="text-xs text-muted-foreground shrink-0 w-14 sm:w-auto sm:sr-only"
                                >
                                  Cierra
                                </Label>
                                <Input
                                  id={`hours-close-${d}`}
                                  type="time"
                                  step={300}
                                  value={row.close}
                                  onChange={(e) =>
                                    setHoursByDay((prev) => ({
                                      ...prev,
                                      [d]: {
                                        open: prev[d]!.open,
                                        close: e.target.value,
                                      },
                                    }))
                                  }
                                  className="h-10 flex-1 bg-secondary border-border"
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground sm:flex-1 sm:text-right sm:pr-1">
                              Cerrado — sin reservas este día
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <Button
                  className="w-full sm:w-auto min-h-11"
                  disabled={hoursSaving}
                  onClick={() => void saveHours()}
                >
                  {hoursSaving ? 'Guardando…' : 'Guardar horario'}
                </Button>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  )
}
