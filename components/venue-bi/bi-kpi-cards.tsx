'use client'

import { Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { VenueBiSnapshot } from '@/lib/venue-bi/types'

function clp(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function pct(n: number) {
  return `${n.toFixed(1)}%`
}

function semaforo(value: number, goodAt: number, warnAt: number) {
  if (value >= goodAt) return 'text-emerald-700 dark:text-emerald-300'
  if (value >= warnAt) return 'text-amber-800 dark:text-amber-300'
  return 'text-rose-700 dark:text-rose-300'
}

export function VenueBiKpiCards({ snapshot }: { snapshot: VenueBiSnapshot }) {
  const k = snapshot.kpis
  const items = [
    {
      key: 'occ',
      label: 'Ocupación',
      value: pct(k.occupancyConfirmedPct),
      tip: '% del horario con reservas confirmadas.',
      cls: semaforo(k.occupancyConfirmedPct, 70, 45),
    },
    {
      key: 'dead',
      label: 'Horas muertas',
      value: `${k.deadHours.toFixed(1)} h`,
      tip: 'Horas abiertas sin reserva confirmada.',
      cls: semaforo(100 - k.deadHours, 80, 50),
    },
    {
      key: 'rev',
      label: 'Ingresos',
      value: clp(k.revenueTotal),
      tip: 'Pagos y abonos cobrados en el periodo.',
      cls: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      key: 'revpath',
      label: 'Ingreso por hora abierta',
      value: clp(k.revPath),
      tip: 'Ingresos cobrados ÷ horas abiertas del centro.',
      cls: semaforo(k.revPath, 15000, 9000),
    },
    {
      key: 'avg',
      label: 'Ticket promedio',
      value: clp(k.avgTicket),
      tip: 'Ingresos cobrados ÷ reservas con pago o abono registrado.',
      cls: semaforo(k.avgTicket, 25000, 15000),
    },
    {
      key: 'cancel',
      label: 'Cancelación',
      value: pct(k.cancellationRatePct),
      tip: 'Reservas canceladas sobre el total.',
      cls:
        k.cancellationRatePct > 20
          ? 'text-rose-700 dark:text-rose-300'
          : 'text-emerald-700 dark:text-emerald-300',
    },
    {
      key: 'recurrent',
      label: 'Clientes recurrentes',
      value: `${k.recurringClients}`,
      tip: 'Clientes con 2+ reservas confirmadas.',
      cls: semaforo(k.recurringClients, 10, 4),
    },
    {
      key: 'peak',
      label: 'Hora más pedida / menos pedida',
      value: `${k.peakHour ?? '--'}h / ${k.valleyHour ?? '--'}h`,
      tip: 'Hora del día con más reservas confirmadas vs. la de menos (inicio del tramo).',
      cls: 'text-amber-900 dark:text-amber-200',
      mobileFull: true,
    },
  ] as const

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {items.map((it) => (
          <Card
            key={it.key}
            className={`border-border bg-card shadow-sm ring-1 ring-black/[0.04] dark:bg-zinc-950/85 dark:ring-white/[0.06] ${'mobileFull' in it && it.mobileFull ? 'col-span-2 xl:col-span-1' : ''}`}
          >
            <CardHeader className="space-y-0 pb-1.5 px-3 pt-3 sm:px-5 sm:pt-4">
              <CardTitle className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {it.label}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{it.tip}</TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 sm:px-5 sm:pb-4">
              <p className={`text-[30px] leading-none sm:text-3xl font-semibold tabular-nums ${it.cls}`}>
                {it.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  )
}

