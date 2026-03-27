'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { CalendarDays, LogOut, RefreshCw, Trophy } from 'lucide-react'
import { ThemeMenuButton } from '@/components/theme-controls'

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
  const [form, setForm] = useState({
    email: '',
    password: '',
    venueName: '',
    city: 'Rancagua',
    address: '',
    phone: '',
    mapsUrl: '',
  })

  const loadMetrics = async (nextRange = range) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/metrics?range=${nextRange}`, { method: 'GET' })
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
      const r = await fetch('/api/admin/create-venue-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    <div className="min-h-screen bg-background p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Panel Admin</h1>
          <p className="text-sm text-muted-foreground">
            Métricas de reservas y alta rápida de centros deportivos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeMenuButton />
          <Button variant="outline" onClick={() => void logout()}>
            <LogOut className="w-4 h-4 mr-1.5" />
            Salir
          </Button>
        </div>
      </header>

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
            <Field
              label="Ciudad"
              value={form.city}
              onChange={(v) => setForm((f) => ({ ...f, city: v }))}
            />
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
