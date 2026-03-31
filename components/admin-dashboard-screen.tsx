'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { CalendarDays, LogOut, RefreshCw, Trophy } from 'lucide-react'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { GeoLocationSelect } from '@/components/geo-location-select'
import { AdminGeoCatalogPanel } from '@/components/admin-geo-catalog-panel'
import { ThemeMenuButton } from '@/components/theme-controls'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { Textarea } from '@/components/ui/textarea'

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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <AppScreenBrandHeading
          className="min-w-0 flex-1"
          title="Panel Admin"
          subtitle="Métricas de reservas y alta rápida de centros deportivos."
        />
        <div className="flex shrink-0 items-center gap-2">
          <ThemeMenuButton />
          <Button variant="outline" onClick={() => void logout()}>
            <LogOut className="mr-1.5 h-4 w-4" />
            Salir
          </Button>
        </div>
      </header>

      <div className="space-y-4 p-4">
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-1.5">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Rango</span>
              </div>
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRange(opt.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    range === opt.id
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadMetrics(range)}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
          {loading || !metrics ? (
            <p className="text-sm text-muted-foreground">Cargando métricas…</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Reservas" value={metrics.totals.reservations} />
              <Stat label="Centros" value={metrics.totals.centers} />
              <Stat label="% Confirmadas" value={`${metrics.totals.confirmRate}%`} />
              <Stat
                label="Autoconfirmadas"
                value={metrics.totals.selfConfirmed}
              />
              <Stat label="Pendientes" value={metrics.totals.pending} />
              <Stat label="Confirmadas" value={metrics.totals.confirmed} />
              <Stat label="Canceladas" value={metrics.totals.cancelled} />
              <Stat label="Total tipificadas" value={totalType} />
            </div>
          )}
        </CardContent>
      </Card>

      {metrics ? (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-2">
                <p className="font-medium text-foreground">Tipos de reserva/partido</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <TypePill label="Revuelta" value={metrics.byType.open} />
                  <TypePill label="Rival vs rival" value={metrics.byType.rival} />
                  <TypePill label="Yo + cinco" value={metrics.byType.players} />
                  <TypePill label="Solo reserva" value={metrics.byType.reserve_only} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-2">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Centros más reservados
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {metrics.topVenues.length === 0 ? (
                    <li>Sin reservas todavía.</li>
                  ) : (
                    metrics.topVenues.slice(0, 5).map((v, idx) => (
                      <li key={v.venueId}>
                        {idx + 1}. <span className="text-foreground">{v.venueName}</span> —{' '}
                        {v.reservations} reservas
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/10 p-3 space-y-2">
              <p className="font-medium text-foreground">Tabla detallada ({metrics.details.length})</p>
              <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[860px] text-xs">
                  <thead className="bg-secondary/40 text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-2">Fecha/Hora</th>
                      <th className="text-left px-2 py-2">Centro</th>
                      <th className="text-left px-2 py-2">Cancha</th>
                      <th className="text-left px-2 py-2">Tipo</th>
                      <th className="text-left px-2 py-2">Partido/Reserva</th>
                      <th className="text-left px-2 py-2">Jugador</th>
                      <th className="text-left px-2 py-2">Estado</th>
                      <th className="text-left px-2 py-2">Confirmación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.details.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">
                          Sin reservas para este rango.
                        </td>
                      </tr>
                    ) : (
                      metrics.details.map((row) => (
                        <tr key={row.id} className="border-t border-border/80">
                          <td className="px-2 py-2 text-foreground">
                            {new Date(row.startsAt).toLocaleString('es-CL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-2 py-2">{row.venueName}</td>
                          <td className="px-2 py-2">{row.courtName}</td>
                          <td className="px-2 py-2">{typeLabel(row.matchType)}</td>
                          <td className="px-2 py-2">{row.matchTitle}</td>
                          <td className="px-2 py-2">{row.bookerName}</td>
                          <td className="px-2 py-2">{statusLabel(row.status)}</td>
                          <td className="px-2 py-2">{confirmationLabel(row.confirmationSource)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-3">
          <p className="font-medium text-foreground">Crear usuario centro deportivo</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="Email"
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            />
            <Field
              label="Clave"
              type="password"
              value={form.password}
              onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            />
            <Field
              label="Nombre centro"
              value={form.venueName}
              onChange={(v) => setForm((f) => ({ ...f, venueName: v }))}
            />
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
                label="URL Maps (opcional)"
                value={form.mapsUrl}
                onChange={(v) => setForm((f) => ({ ...f, mapsUrl: v }))}
              />
            </div>
          </div>
          <Button
            onClick={() => void handleCreateVenueUser()}
            disabled={creating}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {creating ? 'Creando...' : 'Crear usuario centro'}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-foreground">Moderación</p>
              <p className="text-xs text-muted-foreground">
                Reportes de jugadores y sanciones (amarillas/rojas/baneo).
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant={reportsStatus === 'pending' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => setReportsStatus('pending')}
              >
                Pendientes
              </Button>
              <Button
                type="button"
                variant={reportsStatus === 'all' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => setReportsStatus('all')}
              >
                Todos
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadReports()}
                disabled={reportsLoading}
              >
                {reportsLoading ? 'Cargando…' : 'Actualizar'}
              </Button>
            </div>
          </div>

          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {reportsLoading ? 'Cargando…' : 'Sin reportes.'}
            </p>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-border bg-secondary/10 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-foreground">
                        Reporte · {r.reason}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Estado:{' '}
                        <span className="text-foreground">{r.status}</span> ·{' '}
                        {new Date(r.created_at).toLocaleString('es-CL')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Reportado:{' '}
                        <span className="text-foreground">{r.reported_user_id}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Reportante:{' '}
                        <span className="text-foreground">{r.reporter_id}</span>
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
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {r.details}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
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
                    placeholder="Nota/resolución admin (opcional)."
                    className="bg-background border-border min-h-[72px]"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AdminGeoCatalogPanel />
      </div>
    </div>
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

function statusLabel(status: 'pending' | 'confirmed' | 'cancelled') {
  if (status === 'pending') return 'Pendiente'
  if (status === 'confirmed') return 'Confirmada'
  return 'Cancelada'
}

function confirmationLabel(source: 'venue_owner' | 'booker_self' | 'admin' | null) {
  if (source === 'booker_self') return 'Organizador'
  if (source === 'venue_owner') return 'Centro'
  if (source === 'admin') return 'Admin'
  return 'Sin definir'
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
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
