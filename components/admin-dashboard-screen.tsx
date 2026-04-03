'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Gavel,
  KeyRound,
  LogOut,
  MapPinned,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Shield,
  Table2,
  Trash2,
  Trophy,
  Unlock,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { GeoLocationSelect } from '@/components/geo-location-select'
import { AdminGeoCatalogPanel } from '@/components/admin-geo-catalog-panel'
import { AdminPlayersDashboardPanel } from '@/components/admin-players-dashboard-panel'
import { ThemeMenuButton } from '@/components/theme-controls'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { formatAuthError } from '@/lib/supabase/auth-errors'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type AdminMetrics = {
  range: RangeKey
  totals: {
    reservations: number
    centers: number
    pending: number
    confirmed: number
    cancelled: number
    selfConfirmed: number
    confirmRate: number
  }
  byType: {
    rival: number
    players: number
    open: number
    reserve_only: number
  }
  topVenues: Array<{ venueId: string; venueName: string; reservations: number }>
  details: Array<{
    id: string
    startsAt: string
    createdAt: string
    status: 'pending' | 'confirmed' | 'cancelled'
    paymentStatus: 'unpaid' | 'deposit_paid' | 'paid' | null
    confirmationSource: 'venue_owner' | 'booker_self' | 'admin' | null
    venueId: string | null
    venueName: string
    cityId: string | null
    cityName: string
    regionId: string | null
    regionName: string | null
    courtName: string
    matchId: string | null
    matchType: 'rival' | 'players' | 'open' | 'reserve_only'
    matchTitle: string
    bookerName: string
  }>
}
type ModReportProfile = {
  id: string
  name: string
  photo_url: string
  mod_banned_at: string | null
}

type AdminPlayerReport = {
  id: string
  reporter_id: string
  reported_user_id: string
  context_type: string
  context_id: string | null
  reason: string
  details: string | null
  status: string
  reviewed_by: string | null
  reviewed_at: string | null
  resolution: string | null
  created_at: string
  reporter_profile: ModReportProfile | null
  reported_profile: ModReportProfile | null
}

type RangeKey = 'day' | '7d' | '15d' | 'month' | 'semester' | 'year'

type AdminVenueListItem = {
  id: string
  ownerId: string
  name: string
  address: string
  phone: string
  city: string
  cityId: string
  cityName: string
  regionId: string | null
  regionName: string | null
  mapsUrl: string | null
  isPaused: boolean
  slotDurationMinutes: number
  createdAt: string
}

const DEFAULT_PLAYER_AVATAR =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face'

/** `player_reports.status` (enum en BD) → texto para el panel. */
function playerReportStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pendiente'
    case 'reviewed':
      return 'Revisado'
    case 'dismissed':
      return 'Descartado'
    case 'action_taken':
      return 'Acción aplicada'
    default:
      return status.replace(/_/g, ' ')
  }
}

function playerReportReasonLabel(reason: string): string {
  const k = reason.trim().toLowerCase()
  const map: Record<string, string> = {
    conducta: 'Conducta',
    spam: 'Spam',
    suplantacion: 'Suplantación',
    otro: 'Otro',
  }
  return map[k] ?? reason
}

const RANGE_OPTIONS: Array<{ id: RangeKey; label: string }> = [
  { id: 'day', label: 'Día' },
  { id: '7d', label: '7 días' },
  { id: '15d', label: '15 días' },
  { id: 'month', label: 'Mensual' },
  { id: 'semester', label: 'Semestral' },
  { id: 'year', label: 'Anual' },
]

export function AdminDashboardScreen() {
  const { currentUser, logout, openPublicProfile } = useApp()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [range, setRange] = useState<RangeKey>('month')
  const [creating, setCreating] = useState(false)
  const [reports, setReports] = useState<AdminPlayerReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsStatus, setReportsStatus] = useState<'pending' | 'history' | 'all'>(
    'pending'
  )
  const [pendingOpenCount, setPendingOpenCount] = useState(0)
  const [modNoteByReportId, setModNoteByReportId] = useState<Record<string, string>>(
    {}
  )
  const [sanctionBusyId, setSanctionBusyId] = useState<string | null>(null)
  const [form, setForm] = useState({
    email: '',
    password: '',
    venueName: '',
    city: 'Rancagua',
    cityId: '',
    address: '',
    phone: '',
    mapsUrl: '',
  })
  const [adminTab, setAdminTab] = useState('resumen')
  const [adminNewPassword, setAdminNewPassword] = useState('')
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('')
  const [adminPwSaving, setAdminPwSaving] = useState(false)
  const [adminVenues, setAdminVenues] = useState<AdminVenueListItem[]>([])
  const [venuesLoading, setVenuesLoading] = useState(false)
  const [venueNameFilter, setVenueNameFilter] = useState('')
  const [venueListRegion, setVenueListRegion] = useState('all')
  const [venueListCity, setVenueListCity] = useState('all')
  const [editVenue, setEditVenue] = useState<AdminVenueListItem | null>(null)
  const [editVenueForm, setEditVenueForm] = useState({
    name: '',
    cityId: '',
    city: '',
    address: '',
    phone: '',
    mapsUrl: '',
  })
  const [venueSaving, setVenueSaving] = useState(false)
  const [venueBusyId, setVenueBusyId] = useState<string | null>(null)
  const [deleteVenueId, setDeleteVenueId] = useState<string | null>(null)
  const [resFilterRegion, setResFilterRegion] = useState('all')
  const [resFilterCity, setResFilterCity] = useState('all')
  const [resFilterVenue, setResFilterVenue] = useState('all')

  const reservationFilterLists = useMemo(() => {
    const empty = {
      regions: [] as Array<{ id: string; name: string }>,
      cities: [] as Array<{ id: string; name: string; regionId: string | null }>,
      venues: [] as Array<{
        id: string
        name: string
        regionId: string | null
        cityId: string | null
      }>,
    }
    if (!metrics?.details.length) return empty
    const regions = new Map<string, string>()
    const cities = new Map<string, { id: string; name: string; regionId: string | null }>()
    const venues = new Map<
      string,
      { id: string; name: string; regionId: string | null; cityId: string | null }
    >()
    for (const row of metrics.details) {
      if (row.regionId && row.regionName) regions.set(row.regionId, row.regionName)
      if (row.cityId) {
        cities.set(row.cityId, {
          id: row.cityId,
          name: row.cityName,
          regionId: row.regionId ?? null,
        })
      }
      if (row.venueId) {
        venues.set(row.venueId, {
          id: row.venueId,
          name: row.venueName,
          regionId: row.regionId ?? null,
          cityId: row.cityId ?? null,
        })
      }
    }
    return {
      regions: [...regions.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      cities: [...cities.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
      venues: [...venues.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    }
  }, [metrics])

  const reservationCityOptions = useMemo(() => {
    if (resFilterRegion === 'all') return reservationFilterLists.cities
    return reservationFilterLists.cities.filter((c) => c.regionId === resFilterRegion)
  }, [reservationFilterLists, resFilterRegion])

  const reservationVenueOptions = useMemo(() => {
    let list = reservationFilterLists.venues
    if (resFilterRegion !== 'all') list = list.filter((v) => v.regionId === resFilterRegion)
    if (resFilterCity !== 'all') list = list.filter((v) => v.cityId === resFilterCity)
    return list
  }, [reservationFilterLists, resFilterRegion, resFilterCity])

  const filteredReservationDetails = useMemo(() => {
    if (!metrics) return []
    return metrics.details.filter((row) => {
      if (resFilterVenue !== 'all' && row.venueId !== resFilterVenue) return false
      if (resFilterCity !== 'all' && row.cityId !== resFilterCity) return false
      if (resFilterRegion !== 'all' && row.regionId !== resFilterRegion) return false
      return true
    })
  }, [metrics, resFilterVenue, resFilterCity, resFilterRegion])

  useEffect(() => {
    if (!metrics) return
    const regionOk =
      resFilterRegion === 'all' ||
      reservationFilterLists.regions.some((r) => r.id === resFilterRegion)
    if (!regionOk) {
      setResFilterRegion('all')
      setResFilterCity('all')
      setResFilterVenue('all')
      return
    }
    const cityOk =
      resFilterCity === 'all' ||
      reservationCityOptions.some((c) => c.id === resFilterCity)
    if (!cityOk) {
      setResFilterCity('all')
      setResFilterVenue('all')
      return
    }
    const venueOk =
      resFilterVenue === 'all' ||
      reservationVenueOptions.some((v) => v.id === resFilterVenue)
    if (!venueOk) setResFilterVenue('all')
  }, [
    metrics,
    resFilterRegion,
    resFilterCity,
    resFilterVenue,
    reservationFilterLists,
    reservationCityOptions,
    reservationVenueOptions,
  ])

  const venueListFilterLists = useMemo(() => {
    const regions = new Map<string, string>()
    const cities = new Map<string, { id: string; name: string; regionId: string | null }>()
    for (const v of adminVenues) {
      if (v.regionId && v.regionName) regions.set(v.regionId, v.regionName)
      if (v.cityId) {
        cities.set(v.cityId, {
          id: v.cityId,
          name: v.cityName || v.city,
          regionId: v.regionId,
        })
      }
    }
    return {
      regions: [...regions.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      cities: [...cities.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    }
  }, [adminVenues])

  const venueListCityOptions = useMemo(() => {
    if (venueListRegion === 'all') return venueListFilterLists.cities
    return venueListFilterLists.cities.filter((c) => c.regionId === venueListRegion)
  }, [venueListFilterLists, venueListRegion])

  const filteredAdminVenues = useMemo(() => {
    const q = venueNameFilter.trim().toLowerCase()
    return adminVenues.filter((v) => {
      if (q && !v.name.toLowerCase().includes(q)) return false
      if (venueListRegion !== 'all' && v.regionId !== venueListRegion) return false
      if (venueListCity !== 'all' && v.cityId !== venueListCity) return false
      return true
    })
  }, [adminVenues, venueNameFilter, venueListRegion, venueListCity])

  useEffect(() => {
    const regionOk =
      venueListRegion === 'all' ||
      venueListFilterLists.regions.some((r) => r.id === venueListRegion)
    if (!regionOk) {
      setVenueListRegion('all')
      setVenueListCity('all')
      return
    }
    const cityOk =
      venueListCity === 'all' ||
      venueListCityOptions.some((c) => c.id === venueListCity)
    if (!cityOk) setVenueListCity('all')
  }, [
    adminVenues,
    venueListRegion,
    venueListCity,
    venueListFilterLists,
    venueListCityOptions,
  ])

  const resetVenueForm = useCallback(() => {
    setForm({
      email: '',
      password: '',
      venueName: '',
      city: 'Rancagua',
      cityId: '',
      address: '',
      phone: '',
      mapsUrl: '',
    })
  }, [])

  const buildAdminAuthHeaders = useCallback(async () => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (isSupabaseConfigured()) {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        h.Authorization = `Bearer ${session.access_token}`
      }
    }
    return h
  }, [])

  const loadAdminVenues = useCallback(async () => {
    setVenuesLoading(true)
    try {
      const headers = await buildAdminAuthHeaders()
      const r = await fetch('/api/admin/venues', { method: 'GET', headers })
      const json = (await r.json()) as { venues?: AdminVenueListItem[]; error?: string }
      if (!r.ok) throw new Error(json.error ?? 'No se pudo cargar centros')
      setAdminVenues(json.venues ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar centros')
    } finally {
      setVenuesLoading(false)
    }
  }, [buildAdminAuthHeaders])

  const loadReports = useCallback(async () => {
    if (!currentUser || currentUser.accountType !== 'admin') return
    setReportsLoading(true)
    try {
      const headers = await buildAdminAuthHeaders()
      const statusParam =
        reportsStatus === 'history'
          ? 'history'
          : reportsStatus === 'all'
            ? 'all'
            : 'pending'
      const [rMain, rPend] = await Promise.all([
        fetch(`/api/admin/reports?status=${statusParam}`, { method: 'GET', headers }),
        fetch('/api/admin/reports?status=pending', { method: 'GET', headers }),
      ])
      const json = (await rMain.json()) as { reports?: AdminPlayerReport[]; error?: string }
      const jPend = (await rPend.json()) as { reports?: AdminPlayerReport[]; error?: string }
      if (!rMain.ok) {
        toast.error(json.error ?? 'No se pudieron cargar reportes.')
        return
      }
      setReports(json.reports ?? [])
      if (rPend.ok) {
        setPendingOpenCount((jPend.reports ?? []).length)
      }
    } finally {
      setReportsLoading(false)
    }
  }, [buildAdminAuthHeaders, currentUser, reportsStatus])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  useEffect(() => {
    if (adminTab === 'centro') void loadAdminVenues()
  }, [adminTab, loadAdminVenues])

  const updateReportStatus = useCallback(
    async (
      action: 'markReviewed' | 'dismiss' | 'actionTaken',
      reportId: string
    ) => {
      const headers = await buildAdminAuthHeaders()
      const r = await fetch('/api/admin/reports', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action,
          reportId,
          resolution: modNoteByReportId[reportId] ?? null,
        }),
      })
      const json = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !json.ok) {
        toast.error(json.error ?? 'Error al actualizar reporte.')
        return false
      }
      return true
    },
    [buildAdminAuthHeaders, modNoteByReportId]
  )

  const applyCard = useCallback(
    async (userId: string, card: 'yellow' | 'red', reportId: string) => {
      setSanctionBusyId(reportId)
      try {
        const headers = await buildAdminAuthHeaders()
        const r = await fetch('/api/admin/sanctions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'applyCard',
            userId,
            card,
            reason: modNoteByReportId[reportId]?.trim() || undefined,
          }),
        })
        const json = (await r.json()) as { ok?: boolean; error?: string }
        if (!r.ok || !json.ok) {
          toast.error(json.error ?? 'Error al aplicar sanción.')
          return
        }
        toast.success(card === 'yellow' ? 'Tarjeta amarilla aplicada.' : 'Tarjeta roja aplicada.')
        await updateReportStatus('actionTaken', reportId)
        void loadReports()
      } finally {
        setSanctionBusyId(null)
      }
    },
    [buildAdminAuthHeaders, loadReports, modNoteByReportId, updateReportStatus]
  )

  const unbanUser = useCallback(
    async (userId: string) => {
      const busyKey = `unban:${userId}`
      setSanctionBusyId(busyKey)
      try {
        const headers = await buildAdminAuthHeaders()
        const r = await fetch('/api/admin/sanctions', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'clearBan', userId }),
        })
        const json = (await r.json()) as { ok?: boolean; error?: string }
        if (!r.ok || !json.ok) {
          toast.error(json.error ?? 'No se pudo quitar el baneo.')
          return
        }
        toast.success('Baneo levantado. El jugador recupera el acceso completo.')
        void loadReports()
      } finally {
        setSanctionBusyId(null)
      }
    },
    [buildAdminAuthHeaders, loadReports]
  )

  const banUser = useCallback(
    async (userId: string, reportId: string) => {
      setSanctionBusyId(reportId)
      try {
        const headers = await buildAdminAuthHeaders()
        const r = await fetch('/api/admin/sanctions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'ban',
            userId,
            reason: modNoteByReportId[reportId] ?? null,
          }),
        })
        const json = (await r.json()) as { ok?: boolean; error?: string }
        if (!r.ok || !json.ok) {
          toast.error(json.error ?? 'Error al banear.')
          return
        }
        toast.success('Usuario baneado.')
        await updateReportStatus('actionTaken', reportId)
        void loadReports()
      } finally {
        setSanctionBusyId(null)
      }
    },
    [buildAdminAuthHeaders, loadReports, modNoteByReportId, updateReportStatus]
  )

  const dismissReport = useCallback(
    async (reportId: string) => {
      setSanctionBusyId(reportId)
      try {
        const ok = await updateReportStatus('dismiss', reportId)
        if (ok) toast.success('Reporte descartado.')
        void loadReports()
      } finally {
        setSanctionBusyId(null)
      }
    },
    [loadReports, updateReportStatus]
  )

  const loadMetrics = async (nextRange = range) => {
    setLoading(true)
    try {
      const authHeaders: Record<string, string> = {}
      if (isSupabaseConfigured()) {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.access_token) {
          authHeaders.Authorization = `Bearer ${session.access_token}`
        }
      }
      const r = await fetch(`/api/admin/metrics?range=${nextRange}`, {
        method: 'GET',
        headers: authHeaders,
      })
      const json = (await r.json()) as AdminMetrics & { error?: string }
      if (!r.ok) {
        throw new Error(json.error ?? 'No se pudo cargar métricas')
      }
      setMetrics(json)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar métricas'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMetrics(range)
  }, [range])

  const totalType = useMemo(() => {
    if (!metrics) return 0
    const t = metrics.byType
    return t.rival + t.players + t.open + t.reserve_only
  }, [metrics])

  const pendingReportsCount = pendingOpenCount

  const handleCreateVenueUser = async () => {
    if (!form.email.trim() || !form.password || !form.venueName.trim()) {
      toast.error('Completa email, clave y nombre del centro.')
      return
    }
    setCreating(true)
    try {
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (isSupabaseConfigured()) {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.access_token) {
          authHeaders.Authorization = `Bearer ${session.access_token}`
        }
      }
      const r = await fetch('/api/admin/create-venue-user', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(form),
      })
      const json = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !json.ok) {
        throw new Error(json.error ?? 'No se pudo crear el usuario centro')
      }
      toast.success('Usuario centro y centro deportivo creados correctamente.')
      setForm((prev) => ({
        ...prev,
        email: '',
        password: '',
        venueName: '',
        city: 'Rancagua',
        cityId: '',
        address: '',
        phone: '',
        mapsUrl: '',
      }))
      await loadMetrics()
      await loadAdminVenues()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al crear usuario centro'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  const saveEditVenue = async () => {
    if (!editVenue) return
    if (!editVenueForm.name.trim()) {
      toast.error('El nombre del centro es obligatorio.')
      return
    }
    if (!editVenueForm.cityId.trim()) {
      toast.error('Elige una ciudad en el catálogo.')
      return
    }
    setVenueSaving(true)
    try {
      const headers = await buildAdminAuthHeaders()
      const r = await fetch(`/api/admin/venues/${editVenue.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name: editVenueForm.name.trim(),
          address: editVenueForm.address.trim(),
          phone: editVenueForm.phone.trim(),
          cityId: editVenueForm.cityId.trim(),
          mapsUrl: editVenueForm.mapsUrl.trim() || null,
        }),
      })
      const json = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !json.ok) {
        throw new Error(json.error ?? 'No se pudo guardar')
      }
      toast.success('Centro actualizado.')
      setEditVenue(null)
      await loadAdminVenues()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setVenueSaving(false)
    }
  }

  const togglePauseVenue = async (row: AdminVenueListItem) => {
    const next = !row.isPaused
    setVenueBusyId(row.id)
    try {
      const headers = await buildAdminAuthHeaders()
      const r = await fetch(`/api/admin/venues/${row.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isPaused: next }),
      })
      const json = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !json.ok) {
        throw new Error(json.error ?? 'No se pudo actualizar')
      }
      toast.success(next ? 'Centro pausado (no visible en exploración).' : 'Centro reactivado.')
      await loadAdminVenues()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setVenueBusyId(null)
    }
  }

  const confirmDeleteVenue = async () => {
    if (!deleteVenueId) return
    setVenueBusyId(deleteVenueId)
    try {
      const headers = await buildAdminAuthHeaders()
      const r = await fetch(`/api/admin/venues/${deleteVenueId}`, {
        method: 'DELETE',
        headers,
      })
      const json = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !json.ok) {
        throw new Error(json.error ?? 'No se pudo eliminar')
      }
      toast.success('Centro eliminado.')
      setDeleteVenueId(null)
      await loadAdminVenues()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setVenueBusyId(null)
    }
  }

  const handleAdminPasswordChange = async () => {
    if (!isSupabaseConfigured()) {
      toast.error('Supabase no está configurado.')
      return
    }
    const pw = adminNewPassword.trim()
    if (pw.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (pw !== adminConfirmPassword.trim()) {
      toast.error('Las contraseñas no coinciden.')
      return
    }
    setAdminPwSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) {
        toast.error(formatAuthError(error))
        return
      }
      toast.success('Contraseña actualizada.')
      setAdminNewPassword('')
      setAdminConfirmPassword('')
    } finally {
      setAdminPwSaving(false)
    }
  }

  if (!currentUser || currentUser.accountType !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="bg-card border-border w-full max-w-md">
          <CardContent className="p-4 space-y-3">
            <p className="text-foreground font-medium">Acceso restringido.</p>
            <p className="text-sm text-muted-foreground">
              Este panel está disponible solo para usuarios admin.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary sm:h-10 sm:w-10">
              <Shield className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
            </div>
            <AppScreenBrandHeading
              className="min-w-0 flex-1"
              title="Panel Admin"
              subtitle="Reservas, jugadores, centros, moderación y geo."
              titleClassName="text-base sm:text-xl md:text-2xl"
            />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start">
            <ThemeMenuButton />
            <Button variant="outline" size="sm" onClick={() => void logout()} className="shrink-0">
              <LogOut className="mr-1.5 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:space-y-6 sm:p-4">
        <Tabs value={adminTab} onValueChange={setAdminTab} className="gap-4 sm:gap-6">
          <TabsList className="flex h-auto w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-muted/40 p-1.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
            <TabsTrigger value="resumen" className="shrink-0 gap-1.5 px-2.5 py-2 text-xs sm:px-3 sm:text-sm">
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Resumen</span>
            </TabsTrigger>
            <TabsTrigger value="jugadores" className="shrink-0 gap-1.5 px-2.5 py-2 text-xs sm:px-3 sm:text-sm">
              <Users className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Jugadores</span>
            </TabsTrigger>
            <TabsTrigger value="reservas" className="shrink-0 gap-1.5 px-2.5 py-2 text-xs sm:px-3 sm:text-sm">
              <Table2 className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Reservas</span>
              {metrics != null && metrics.details.length > 0 ? (
                <Badge variant="secondary" className="ml-0.5 shrink-0 font-mono text-[10px] tabular-nums">
                  {metrics.details.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="centro" className="shrink-0 gap-1.5 px-2.5 py-2 text-xs sm:px-3 sm:text-sm">
              <UserPlus className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">+ nuevo centro</span>
            </TabsTrigger>
            <TabsTrigger value="moderacion" className="shrink-0 gap-1.5 px-2.5 py-2 text-xs sm:px-3 sm:text-sm">
              <Gavel className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Moderación</span>
              {pendingReportsCount > 0 ? (
                <Badge className="ml-0.5 shrink-0 bg-amber-600 text-[10px] hover:bg-amber-600">
                  {pendingReportsCount}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="geo" className="shrink-0 gap-1.5 px-2.5 py-2 text-xs sm:px-3 sm:text-sm">
              <MapPinned className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Geo</span>
            </TabsTrigger>
            <TabsTrigger value="cuenta" className="shrink-0 gap-1.5 px-2.5 py-2 text-xs sm:px-3 sm:text-sm">
              <KeyRound className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Cuenta</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="mt-0 space-y-6">
            <Card className="gap-0 overflow-hidden border-border py-0 shadow-sm">
              <CardHeader className="border-b border-border bg-secondary/20 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Métricas del período</CardTitle>
                    <CardDescription>
                      Elige el rango y actualiza para ver números al día.
                    </CardDescription>
                  </div>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-background/80 px-2.5 py-1.5">
                      <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Rango
                      </span>
                    </div>
                    <div className="flex max-w-full gap-1.5 overflow-x-auto overflow-y-hidden pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible">
                      {RANGE_OPTIONS.map((opt) => (
                        <Button
                          key={opt.id}
                          type="button"
                          variant={range === opt.id ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 shrink-0 rounded-full px-3 text-[11px] sm:text-xs"
                          onClick={() => setRange(opt.id)}
                        >
                          {opt.label}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => void loadMetrics(range)}
                        disabled={loading}
                        aria-label="Actualizar métricas"
                        title="Actualizar métricas"
                      >
                        <RefreshCw
                          className={cn('h-3.5 w-3.5 sm:mr-1.5', loading && 'animate-spin')}
                        />
                        <span className="hidden sm:inline">Actualizar</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-4 sm:p-6">
                {loading || !metrics ? (
                  <p className="text-sm text-muted-foreground">Cargando métricas…</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                      <MetricTile
                        icon={<BarChart3 className="h-5 w-5" />}
                        label="Reservas"
                        value={metrics.totals.reservations}
                      />
                      <MetricTile
                        icon={<Building2 className="h-5 w-5" />}
                        label="Centros activos"
                        value={metrics.totals.centers}
                      />
                      <MetricTile
                        icon={<CheckCircle2 className="h-5 w-5" />}
                        label="% confirmadas"
                        value={`${metrics.totals.confirmRate}%`}
                      />
                      <MetricTile
                        icon={<UserPlus className="h-5 w-5" />}
                        label="Autoconfirmadas"
                        value={metrics.totals.selfConfirmed}
                      />
                      <MetricTile
                        icon={<Clock className="h-5 w-5" />}
                        label="Pendientes"
                        value={metrics.totals.pending}
                        accent="amber"
                      />
                      <MetricTile
                        icon={<CheckCircle2 className="h-5 w-5" />}
                        label="Confirmadas"
                        value={metrics.totals.confirmed}
                        accent="emerald"
                      />
                      <MetricTile
                        icon={<XCircle className="h-5 w-5" />}
                        label="Canceladas"
                        value={metrics.totals.cancelled}
                        accent="rose"
                      />
                      <MetricTile
                        icon={<Trophy className="h-5 w-5" />}
                        label="Total tipificadas"
                        value={totalType}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <h3 className="mb-3 text-sm font-semibold text-foreground">
                          Tipos de reserva / partido
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          <TypePill label="Revuelta" value={metrics.byType.open} />
                          <TypePill label="Rival vs rival" value={metrics.byType.rival} />
                          <TypePill label="Yo + cinco" value={metrics.byType.players} />
                          <TypePill
                            label="Solo reserva"
                            value={metrics.byType.reserve_only}
                          />
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Trophy className="h-4 w-4 text-amber-500" />
                          Centros más reservados
                        </h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {metrics.topVenues.length === 0 ? (
                            <li>Sin reservas en este período.</li>
                          ) : (
                            metrics.topVenues.slice(0, 5).map((v, idx) => (
                              <li
                                key={v.venueId}
                                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2"
                              >
                                <span className="text-foreground">
                                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                                    {idx + 1}.
                                  </span>
                                  {v.venueName}
                                </span>
                                <Badge variant="secondary">{v.reservations}</Badge>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        ¿Detalle fila a fila? Pestaña{' '}
                        <strong className="text-foreground">Reservas</strong>.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 sm:w-auto"
                        onClick={() => setAdminTab('reservas')}
                      >
                        <Table2 className="h-4 w-4" />
                        Ver tabla detallada
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jugadores" className="mt-0">
            <AdminPlayersDashboardPanel />
          </TabsContent>

          <TabsContent value="reservas" className="mt-0">
            <Card className="gap-0 overflow-hidden border-border py-0 shadow-sm">
              <CardHeader className="border-b border-border bg-secondary/20 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Reservas detalladas</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      <span className="sm:hidden">
                        Rango: {RANGE_OPTIONS.find((o) => o.id === range)?.label}. Ajusta en pestaña
                        Resumen.
                      </span>
                      <span className="hidden sm:inline">
                        Mismo rango que en Resumen (
                        {RANGE_OPTIONS.find((o) => o.id === range)?.label}). Cambia el rango en la
                        pestaña Resumen.
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadMetrics(range)}
                      disabled={loading}
                    >
                      <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
                      Sincronizar datos
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!metrics ? (
                  <p className="p-6 text-sm text-muted-foreground">Cargando…</p>
                ) : (
                  <div className="space-y-0">
                    <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4 sm:px-4">
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[160px] sm:max-w-[220px] sm:flex-none">
                        <Label htmlFor="admin-res-filter-region" className="text-xs text-muted-foreground">
                          Región
                        </Label>
                        <Select
                          value={resFilterRegion}
                          onValueChange={(v) => {
                            setResFilterRegion(v)
                            setResFilterCity('all')
                            setResFilterVenue('all')
                          }}
                        >
                          <SelectTrigger id="admin-res-filter-region" size="sm" className="w-full min-w-0">
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            {reservationFilterLists.regions.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[160px] sm:max-w-[220px] sm:flex-none">
                        <Label htmlFor="admin-res-filter-city" className="text-xs text-muted-foreground">
                          Ciudad
                        </Label>
                        <Select
                          value={resFilterCity}
                          onValueChange={(v) => {
                            setResFilterCity(v)
                            setResFilterVenue('all')
                          }}
                        >
                          <SelectTrigger id="admin-res-filter-city" size="sm" className="w-full min-w-0">
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            {reservationCityOptions.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[160px] sm:max-w-[240px] sm:flex-none">
                        <Label htmlFor="admin-res-filter-venue" className="text-xs text-muted-foreground">
                          Centro deportivo
                        </Label>
                        <Select value={resFilterVenue} onValueChange={setResFilterVenue}>
                          <SelectTrigger id="admin-res-filter-venue" size="sm" className="w-full min-w-0">
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            {reservationVenueOptions.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {resFilterRegion !== 'all' ||
                      resFilterCity !== 'all' ||
                      resFilterVenue !== 'all' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 self-end text-muted-foreground"
                          onClick={() => {
                            setResFilterRegion('all')
                            setResFilterCity('all')
                            setResFilterVenue('all')
                          }}
                        >
                          Limpiar filtros
                        </Button>
                      ) : null}
                    </div>
                    {metrics.details.length > 0 &&
                    (resFilterRegion !== 'all' ||
                      resFilterCity !== 'all' ||
                      resFilterVenue !== 'all') ? (
                      <p className="border-b border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground sm:px-4">
                        Mostrando {filteredReservationDetails.length} de {metrics.details.length}{' '}
                        reservas en este rango.
                      </p>
                    ) : null}
                    <p className="border-b border-border/60 bg-muted/30 px-3 py-2 text-center text-[11px] text-muted-foreground sm:hidden">
                      Desliza horizontalmente para ver todas las columnas
                    </p>
                    <div className="max-h-[min(65dvh,520px)] overflow-auto sm:max-h-[min(70vh,560px)]">
                    <table className="w-full min-w-[880px] text-sm">
                      <thead className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur-sm">
                        <tr className="text-left text-xs font-medium text-muted-foreground">
                          <th className="px-3 py-3">Fecha / hora</th>
                          <th className="px-3 py-3">Centro</th>
                          <th className="px-3 py-3">Cancha</th>
                          <th className="px-3 py-3">Tipo</th>
                          <th className="px-3 py-3">Partido / reserva</th>
                          <th className="px-3 py-3">Jugador</th>
                          <th className="px-3 py-3">Estado</th>
                          <th className="px-3 py-3">Confirmación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.details.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="px-6 py-10 text-center text-muted-foreground"
                            >
                              Sin reservas para este rango.
                            </td>
                          </tr>
                        ) : filteredReservationDetails.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="px-6 py-10 text-center text-muted-foreground"
                            >
                              Ninguna reserva coincide con los filtros.
                            </td>
                          </tr>
                        ) : (
                          filteredReservationDetails.map((row) => (
                            <tr
                              key={row.id}
                              className="border-b border-border/60 transition-colors hover:bg-muted/40"
                            >
                              <td className="whitespace-nowrap px-3 py-2.5 text-foreground">
                                {new Date(row.startsAt).toLocaleString('es-CL', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="max-w-[140px] truncate px-3 py-2.5">
                                {row.venueName}
                              </td>
                              <td className="max-w-[100px] truncate px-3 py-2.5">
                                {row.courtName}
                              </td>
                              <td className="px-3 py-2.5">
                                <Badge variant="outline" className="font-normal">
                                  {typeLabel(row.matchType)}
                                </Badge>
                              </td>
                              <td className="max-w-[180px] truncate px-3 py-2.5">
                                {row.matchTitle}
                              </td>
                              <td className="max-w-[120px] truncate px-3 py-2.5">
                                {row.bookerName}
                              </td>
                              <td className="px-3 py-2.5">
                                <ReservationStatusBadge status={row.status} />
                              </td>
                              <td className="px-3 py-2.5">
                                <ConfirmationBadge source={row.confirmationSource} />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="centro" className="mt-0 space-y-6">
            <Card className="gap-0 overflow-hidden border-border py-0 shadow-sm">
              <CardHeader className="border-b border-border bg-secondary/20 px-4 py-4 sm:px-6">
                <CardTitle className="text-lg">Crear usuario de centro deportivo</CardTitle>
                <CardDescription>
                  Genera la cuenta del dueño y el registro del centro en un solo paso.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                  <Field
                    label="Email del dueño"
                    value={form.email}
                    onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  />
                  <Field
                    label="Contraseña inicial"
                    type="password"
                    value={form.password}
                    onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                  />
                  <div className="md:col-span-2">
                    <Field
                      label="Nombre del centro"
                      value={form.venueName}
                      onChange={(v) => setForm((f) => ({ ...f, venueName: v }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <GeoLocationSelect
                      cityId={form.cityId}
                      onChange={(next) =>
                        setForm((f) => ({
                          ...f,
                          cityId: next.cityId,
                          city: next.cityLabel,
                        }))
                      }
                      label="Ubicación del centro"
                    />
                  </div>
                  <Field
                    label="Dirección"
                    value={form.address}
                    onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                  />
                  <Field
                    label="Teléfono"
                    value={form.phone}
                    onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  />
                  <div className="md:col-span-2">
                    <Field
                      label="URL de Google Maps (opcional)"
                      value={form.mapsUrl}
                      onChange={(v) => setForm((f) => ({ ...f, mapsUrl: v }))}
                    />
                  </div>
                </div>
              </CardContent>
              <Separator />
              <CardFooter className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetVenueForm}
                  disabled={creating}
                  className="w-full sm:w-auto"
                >
                  Limpiar formulario
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleCreateVenueUser()}
                  disabled={creating}
                  className="w-full gap-2 sm:w-auto"
                >
                  <UserPlus className="h-4 w-4" />
                  {creating ? 'Creando…' : 'Crear usuario y centro'}
                </Button>
              </CardFooter>
            </Card>

            <Card className="gap-0 overflow-hidden border-border py-0 shadow-sm">
              <CardHeader className="border-b border-border bg-secondary/20 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Centros registrados</CardTitle>
                    <CardDescription>
                      Editar datos, pausar visibilidad en la app o eliminar el registro del centro.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => void loadAdminVenues()}
                    disabled={venuesLoading}
                  >
                    <RefreshCw
                      className={cn('h-3.5 w-3.5', venuesLoading && 'animate-spin')}
                    />
                    Actualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="min-w-0 flex-1 sm:max-w-xs">
                    <Label htmlFor="admin-venue-name-filter" className="text-xs text-muted-foreground">
                      Nombre
                    </Label>
                    <Input
                      id="admin-venue-name-filter"
                      value={venueNameFilter}
                      onChange={(e) => setVenueNameFilter(e.target.value)}
                      placeholder="Buscar por nombre…"
                      className="mt-1.5 h-9"
                    />
                  </div>
                  <div className="w-full min-w-[160px] sm:w-auto sm:max-w-[220px]">
                    <Label htmlFor="admin-venue-region-filter" className="text-xs text-muted-foreground">
                      Región
                    </Label>
                    <Select
                      value={venueListRegion}
                      onValueChange={(v) => {
                        setVenueListRegion(v)
                        setVenueListCity('all')
                      }}
                    >
                      <SelectTrigger id="admin-venue-region-filter" size="sm" className="mt-1.5 w-full">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {venueListFilterLists.regions.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full min-w-[160px] sm:w-auto sm:max-w-[220px]">
                    <Label htmlFor="admin-venue-city-filter" className="text-xs text-muted-foreground">
                      Ciudad
                    </Label>
                    <Select value={venueListCity} onValueChange={setVenueListCity}>
                      <SelectTrigger id="admin-venue-city-filter" size="sm" className="mt-1.5 w-full">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {venueListCityOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {venueNameFilter.trim() ||
                  venueListRegion !== 'all' ||
                  venueListCity !== 'all' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 self-end text-muted-foreground"
                      onClick={() => {
                        setVenueNameFilter('')
                        setVenueListRegion('all')
                        setVenueListCity('all')
                      }}
                    >
                      Limpiar filtros
                    </Button>
                  ) : null}
                </div>

                {venuesLoading ? (
                  <p className="text-sm text-muted-foreground">Cargando centros…</p>
                ) : adminVenues.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                    No hay centros registrados.
                  </p>
                ) : filteredAdminVenues.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                    Ningún centro coincide con los filtros.
                  </p>
                ) : (
                  <div className="max-h-[min(55dvh,480px)] overflow-auto rounded-lg border border-border">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur-sm">
                        <tr className="text-left text-xs font-medium text-muted-foreground">
                          <th className="px-3 py-2.5">Centro</th>
                          <th className="px-3 py-2.5">Región</th>
                          <th className="px-3 py-2.5">Ciudad</th>
                          <th className="px-3 py-2.5">Estado</th>
                          <th className="px-3 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAdminVenues.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-border/60 transition-colors hover:bg-muted/40"
                          >
                            <td className="max-w-[180px] px-3 py-2 font-medium text-foreground">
                              <span className="line-clamp-2">{row.name}</span>
                            </td>
                            <td className="max-w-[140px] px-3 py-2 text-muted-foreground">
                              {row.regionName ?? '—'}
                            </td>
                            <td className="max-w-[120px] px-3 py-2 text-muted-foreground">
                              {row.cityName || row.city}
                            </td>
                            <td className="px-3 py-2">
                              {row.isPaused ? (
                                <Badge variant="secondary">Pausado</Badge>
                              ) : (
                                <Badge variant="outline" className="font-normal">
                                  Activo
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  title="Editar"
                                  disabled={venueBusyId === row.id}
                                  onClick={() => {
                                    setEditVenue(row)
                                    setEditVenueForm({
                                      name: row.name,
                                      cityId: row.cityId,
                                      city: row.cityName || row.city,
                                      address: row.address,
                                      phone: row.phone,
                                      mapsUrl: row.mapsUrl ?? '',
                                    })
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  title={row.isPaused ? 'Reactivar' : 'Pausar'}
                                  disabled={venueBusyId === row.id}
                                  onClick={() => void togglePauseVenue(row)}
                                >
                                  {row.isPaused ? (
                                    <Play className="h-4 w-4" />
                                  ) : (
                                    <Pause className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  title="Eliminar"
                                  disabled={venueBusyId === row.id}
                                  onClick={() => setDeleteVenueId(row.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog
              open={editVenue != null}
              onOpenChange={(open) => {
                if (!open) setEditVenue(null)
              }}
            >
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton>
                <DialogHeader>
                  <DialogTitle>Editar centro deportivo</DialogTitle>
                  <DialogDescription>
                    Datos del centro y ubicación. La pausa se gestiona desde la tabla.
                  </DialogDescription>
                </DialogHeader>
                {editVenue ? (
                  <div className="grid gap-4 py-2">
                    <Field
                      label="Nombre del centro"
                      value={editVenueForm.name}
                      onChange={(v) => setEditVenueForm((f) => ({ ...f, name: v }))}
                    />
                    <GeoLocationSelect
                      cityId={editVenueForm.cityId}
                      onChange={(next) =>
                        setEditVenueForm((f) => ({
                          ...f,
                          cityId: next.cityId,
                          city: next.cityLabel,
                        }))
                      }
                      label="Ubicación"
                    />
                    <Field
                      label="Dirección"
                      value={editVenueForm.address}
                      onChange={(v) => setEditVenueForm((f) => ({ ...f, address: v }))}
                    />
                    <Field
                      label="Teléfono"
                      value={editVenueForm.phone}
                      onChange={(v) => setEditVenueForm((f) => ({ ...f, phone: v }))}
                    />
                    <Field
                      label="URL de Google Maps (opcional)"
                      value={editVenueForm.mapsUrl}
                      onChange={(v) => setEditVenueForm((f) => ({ ...f, mapsUrl: v }))}
                    />
                  </div>
                ) : null}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" onClick={() => setEditVenue(null)}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={() => void saveEditVenue()} disabled={venueSaving}>
                    {venueSaving ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog
              open={deleteVenueId != null}
              onOpenChange={(open) => {
                if (!open) setDeleteVenueId(null)
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar este centro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borrarán canchas, horarios y datos asociados en cascada. Esta acción no se
                    puede deshacer. El usuario dueño del centro seguirá existiendo; solo se elimina
                    el registro del centro.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={(e) => {
                      e.preventDefault()
                      void confirmDeleteVenue()
                    }}
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          <TabsContent value="moderacion" className="mt-0">
            <Card className="gap-0 overflow-hidden border-border py-0 shadow-sm">
              <CardHeader className="border-b border-border bg-secondary/20 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Moderación</CardTitle>
                    <CardDescription>
                      Reportes, tarjetas y baneos. Usa la nota antes de banear si quieres dejar
                      registro.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={reportsStatus === 'pending' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setReportsStatus('pending')}
                    >
                      Pendientes
                    </Button>
                    <Button
                      type="button"
                      variant={reportsStatus === 'history' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setReportsStatus('history')}
                    >
                      Historial
                    </Button>
                    <Button
                      type="button"
                      variant={reportsStatus === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setReportsStatus('all')}
                    >
                      Todos
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void loadReports()}
                      disabled={reportsLoading}
                    >
                      {reportsLoading ? (
                        <>
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Cargando…
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          Actualizar lista
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-6">
                {reports.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                    {reportsLoading ? 'Cargando reportes…' : 'No hay reportes en esta vista.'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {reports.map((r) => {
                      const rep = r.reported_profile
                      const repBy = r.reporter_profile
                      const reportedPhoto = rep?.photo_url?.trim()
                        ? rep.photo_url
                        : DEFAULT_PLAYER_AVATAR
                      const reporterPhoto = repBy?.photo_url?.trim()
                        ? repBy.photo_url
                        : DEFAULT_PLAYER_AVATAR
                      const isPending = r.status === 'pending'
                      const isBanned = Boolean(rep?.mod_banned_at)
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-border bg-card p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1 space-y-3">
                              <div>
                                <p className="font-semibold text-foreground">
                                  {playerReportReasonLabel(r.reason)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(r.created_at).toLocaleString('es-CL')} ·{' '}
                                  <Badge variant="outline" className="ml-1 align-middle">
                                    {playerReportStatusLabel(r.status)}
                                  </Badge>
                                </p>
                              </div>
                              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => openPublicProfile(r.reported_user_id)}
                                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-left transition-colors hover:bg-amber-500/10 hover:ring-2 hover:ring-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  <img
                                    src={reportedPhoto}
                                    alt=""
                                    className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-amber-500/30"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                      Reportado · ver perfil
                                    </p>
                                    <p className="truncate font-semibold text-foreground">
                                      {rep?.name ?? 'Usuario'}
                                    </p>
                                    {isBanned ? (
                                      <Badge variant="destructive" className="mt-1 text-[10px]">
                                        Baneado
                                      </Badge>
                                    ) : null}
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openPublicProfile(r.reporter_id)}
                                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/50 hover:ring-2 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  <img
                                    src={reporterPhoto}
                                    alt=""
                                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                      Reportante · ver perfil
                                    </p>
                                    <p className="truncate text-sm font-medium text-foreground">
                                      {repBy?.name ?? 'Usuario'}
                                    </p>
                                  </div>
                                </button>
                              </div>
                              {!isPending && (r.reviewed_at || r.resolution) ? (
                                <p className="text-xs text-muted-foreground">
                                  {r.reviewed_at
                                    ? `Resuelto: ${new Date(r.reviewed_at).toLocaleString('es-CL')}`
                                    : null}
                                  {r.resolution ? (
                                    <span className="mt-1 block whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-foreground">
                                      {r.resolution}
                                    </span>
                                  ) : null}
                                </p>
                              ) : null}
                            </div>
                            {isPending ? (
                              <div className="flex flex-col gap-2">
                                {!isBanned ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={sanctionBusyId === r.id}
                                      onClick={() =>
                                        void applyCard(r.reported_user_id, 'yellow', r.id)
                                      }
                                    >
                                      Amarilla
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={sanctionBusyId === r.id}
                                      onClick={() =>
                                        void applyCard(r.reported_user_id, 'red', r.id)
                                      }
                                    >
                                      Roja (3 días)
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="destructive"
                                      disabled={sanctionBusyId === r.id}
                                      onClick={() => void banUser(r.reported_user_id, r.id)}
                                    >
                                      Banear
                                    </Button>
                                  </div>
                                ) : (
                                  <p className="max-w-xs text-xs text-muted-foreground">
                                    Usuario baneado: usa «Quitar baneo» para revertir, o descarta el
                                    reporte.
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={sanctionBusyId === r.id}
                                    onClick={() => void dismissReport(r.id)}
                                  >
                                    Descartar
                                  </Button>
                                  {isBanned ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="gap-1.5 border-primary/40"
                                      disabled={sanctionBusyId === `unban:${r.reported_user_id}`}
                                      onClick={() => void unbanUser(r.reported_user_id)}
                                    >
                                      <Unlock className="h-3.5 w-3.5" />
                                      Quitar baneo
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            ) : isBanned ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0 gap-1.5 border-primary/40"
                                disabled={sanctionBusyId === `unban:${r.reported_user_id}`}
                                onClick={() => void unbanUser(r.reported_user_id)}
                              >
                                <Unlock className="h-3.5 w-3.5" />
                                Quitar baneo
                              </Button>
                            ) : null}
                          </div>
                          {r.details ? (
                            <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                              {r.details}
                            </p>
                          ) : (
                            <p className="mt-3 text-xs italic text-muted-foreground">
                              Sin detalle adicional.
                            </p>
                          )}
                          {isPending ? (
                            <Textarea
                              value={modNoteByReportId[r.id] ?? ''}
                              onChange={(e) =>
                                setModNoteByReportId((prev) => ({
                                  ...prev,
                                  [r.id]: e.target.value,
                                }))
                              }
                              placeholder="Nota o resolución (opcional, útil para banear o archivo)."
                              className="mt-3 min-h-[72px] border-border bg-background"
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geo" className="mt-0">
            <AdminGeoCatalogPanel />
          </TabsContent>

          <TabsContent value="cuenta" className="mt-0">
            <Card className="gap-0 overflow-hidden border-border py-0 shadow-sm">
              <CardHeader className="border-b border-border bg-secondary/20 px-4 py-4 sm:px-6">
                <CardTitle className="text-lg">Contraseña de acceso</CardTitle>
                <CardDescription>
                  Cambia la clave con la que inicias sesión (email y contraseña). Si usas solo Google,
                  Supabase puede permitir añadir o cambiar contraseña según la configuración del
                  proyecto.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-6">
                {currentUser?.email ? (
                  <p className="text-sm text-muted-foreground">
                    Sesión actual:{' '}
                    <span className="font-medium text-foreground">{currentUser.email}</span>
                  </p>
                ) : null}
                <div className="grid max-w-md grid-cols-1 gap-4">
                  <Field
                    label="Nueva contraseña"
                    type="password"
                    value={adminNewPassword}
                    onChange={setAdminNewPassword}
                  />
                  <Field
                    label="Confirmar contraseña"
                    type="password"
                    value={adminConfirmPassword}
                    onChange={setAdminConfirmPassword}
                  />
                </div>
              </CardContent>
              <Separator />
              <CardFooter className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={adminPwSaving}
                  onClick={() => {
                    setAdminNewPassword('')
                    setAdminConfirmPassword('')
                  }}
                >
                  Limpiar
                </Button>
                <Button
                  type="button"
                  className="w-full gap-2 sm:w-auto"
                  disabled={
                    adminPwSaving ||
                    !adminNewPassword.trim() ||
                    !adminConfirmPassword.trim()
                  }
                  onClick={() => void handleAdminPasswordChange()}
                >
                  <KeyRound className="h-4 w-4" />
                  {adminPwSaving ? 'Guardando…' : 'Guardar nueva contraseña'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function MetricTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode
  label: string
  value: string | number
  accent?: 'amber' | 'emerald' | 'rose'
}) {
  const accentRing =
    accent === 'amber'
      ? 'border-amber-500/25 bg-amber-500/[0.06]'
      : accent === 'emerald'
        ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
        : accent === 'rose'
          ? 'border-rose-500/25 bg-rose-500/[0.06]'
          : 'border-border bg-card'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4',
        accentRing
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="line-clamp-2 text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">
          {label}
        </span>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-primary',
            accent === 'amber' && 'text-amber-600 dark:text-amber-400',
            accent === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
            accent === 'rose' && 'text-rose-600 dark:text-rose-400'
          )}
        >
          {icon}
        </span>
      </div>
      <p className="text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
        {value}
      </p>
    </div>
  )
}

function ReservationStatusBadge({
  status,
}: {
  status: 'pending' | 'confirmed' | 'cancelled'
}) {
  if (status === 'confirmed') {
    return (
      <Badge className="border-emerald-600/40 bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/20 dark:text-emerald-400">
        Confirmada
      </Badge>
    )
  }
  if (status === 'cancelled') {
    return <Badge variant="destructive">Cancelada</Badge>
  }
  return (
    <Badge
      variant="secondary"
      className="border-amber-500/40 bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
    >
      Pendiente
    </Badge>
  )
}

function ConfirmationBadge({
  source,
}: {
  source: 'venue_owner' | 'booker_self' | 'admin' | null
}) {
  const text = confirmationLabel(source)
  if (source === 'booker_self') {
    return (
      <Badge variant="outline" className="border-primary/40 bg-primary/5">
        {text}
      </Badge>
    )
  }
  if (source === 'venue_owner') {
    return (
      <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-300">
        {text}
      </Badge>
    )
  }
  if (source === 'admin') {
    return (
      <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10">
        {text}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {text}
    </Badge>
  )
}

function TypePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-2 flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-semibold">{value}</span>
    </div>
  )
}

function typeLabel(type: AdminMetrics['details'][number]['matchType']) {
  switch (type) {
    case 'open':
      return 'Revuelta'
    case 'rival':
      return 'Rival vs rival'
    case 'players':
      return 'Yo + cinco'
    default:
      return 'Solo reserva'
  }
}

function confirmationLabel(source: 'venue_owner' | 'booker_self' | 'admin' | null) {
  if (source === 'booker_self') return 'Organizador'
  if (source === 'venue_owner') return 'Centro'
  if (source === 'admin') return 'Admin'
  return 'Sin definir'
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 bg-secondary border-border text-foreground"
      />
    </div>
  )
}
