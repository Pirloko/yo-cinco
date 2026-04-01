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
  LogOut,
  MapPinned,
  RefreshCw,
  Shield,
  Table2,
  Trophy,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { GeoLocationSelect } from '@/components/geo-location-select'
import { AdminGeoCatalogPanel } from '@/components/admin-geo-catalog-panel'
import { ThemeMenuButton } from '@/components/theme-controls'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
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
    courtName: string
    matchId: string | null
    matchType: 'rival' | 'players' | 'open' | 'reserve_only'
    matchTitle: string
    bookerName: string
  }>
}
type RangeKey = 'day' | '7d' | '15d' | 'month' | 'semester' | 'year'
const RANGE_OPTIONS: Array<{ id: RangeKey; label: string }> = [
  { id: 'day', label: 'Día' },
  { id: '7d', label: '7 días' },
  { id: '15d', label: '15 días' },
  { id: 'month', label: 'Mensual' },
  { id: 'semester', label: 'Semestral' },
  { id: 'year', label: 'Anual' },
]

export function AdminDashboardScreen() {
  const { currentUser, logout } = useApp()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [range, setRange] = useState<RangeKey>('month')
  const [creating, setCreating] = useState(false)
  const [reports, setReports] = useState<
    Array<{
      id: string
      reporter_id: string
      reported_user_id: string
      context_type: string
      context_id: string | null
      reason: string
      details: string | null
      status: string
      created_at: string
    }>
  >([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsStatus, setReportsStatus] = useState<'pending' | 'all'>('pending')
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

  const loadReports = useCallback(async () => {
    if (!currentUser || currentUser.accountType !== 'admin') return
    setReportsLoading(true)
    try {
      const headers = await buildAdminAuthHeaders()
      const r = await fetch(`/api/admin/reports?status=${reportsStatus}`, {
        method: 'GET',
        headers,
      })
      const json = (await r.json()) as { reports?: any[]; error?: string }
      if (!r.ok) {
        toast.error(json.error ?? 'No se pudieron cargar reportes.')
        return
      }
      setReports((json.reports ?? []) as any)
    } finally {
      setReportsLoading(false)
    }
  }, [buildAdminAuthHeaders, currentUser, reportsStatus])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

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
          body: JSON.stringify({ action: 'applyCard', userId, card }),
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
    [buildAdminAuthHeaders, loadReports, updateReportStatus]
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

  const pendingReportsCount = useMemo(
    () => reports.filter((r) => r.status === 'pending').length,
    [reports]
  )

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al crear usuario centro'
      toast.error(msg)
    } finally {
      setCreating(false)
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
              subtitle="Reservas, centros, moderación y geo."
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
              <span className="whitespace-nowrap">Alta centro</span>
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
                        ) : (
                          metrics.details.map((row) => (
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

          <TabsContent value="centro" className="mt-0">
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
                    {reports.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-border bg-card p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="font-semibold text-foreground">
                              {r.reason}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleString('es-CL')} · Estado:{' '}
                              <Badge variant="outline" className="ml-1 align-middle">
                                {r.status}
                              </Badge>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Reportado:{' '}
                              <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                                {r.reported_user_id}
                              </code>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Reportante:{' '}
                              <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                                {r.reporter_id}
                              </code>
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={sanctionBusyId === r.id}
                              onClick={() => void applyCard(r.reported_user_id, 'yellow', r.id)}
                            >
                              Amarilla
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={sanctionBusyId === r.id}
                              onClick={() => void applyCard(r.reported_user_id, 'red', r.id)}
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
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={sanctionBusyId === r.id}
                              onClick={() => void dismissReport(r.id)}
                            >
                              Descartar
                            </Button>
                          </div>
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
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geo" className="mt-0">
            <AdminGeoCatalogPanel />
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
