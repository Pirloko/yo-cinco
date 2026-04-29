'use client'

import { useCallback } from 'react'
import type {
  VenueBiCourtBreakdown,
  VenueBiIncomePoint,
  VenueBiSnapshot,
} from '@/lib/venue-bi/types'

type CsvExportArgs = {
  snapshot: VenueBiSnapshot | null | undefined
  incomeSeries: VenueBiIncomePoint[]
  courtsBreakdown: VenueBiCourtBreakdown[]
  fileBaseName?: string
}

function esc(v: string | number): string {
  const str = String(v ?? '')
  if (/[,"\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function fmtMoney(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value)
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function fmtNum(value: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value)
}

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function useVenueBiCsvExport() {
  return useCallback((args: CsvExportArgs) => {
    const rows: string[] = []
    const snapshot = args.snapshot
    rows.push('SECCION,INDICADOR,VALOR,DETALLE')
    rows.push('RESUMEN GENERAL,Reporte BI del centro deportivo,Generado automáticamente,')
    rows.push('')

    if (snapshot) {
      const k = snapshot.kpis
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Ocupación confirmada')},${esc(fmtPct(k.occupancyConfirmedPct))},${esc('% del horario con reservas confirmadas')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Ocupación operativa')},${esc(fmtPct(k.occupancyOperationalPct))},${esc('Pendientes y confirmadas sobre horas abiertas')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Horas muertas')},${esc(`${fmtNum(k.deadHours)} h`)},${esc('Horas abiertas sin reserva confirmada')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Ingresos cobrados')},${esc(fmtMoney(k.revenueTotal))},${esc('Pagos y abonos del periodo')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Ingreso por hora abierta')},${esc(fmtMoney(k.revPath))},${esc('Ingresos cobrados ÷ horas abiertas del centro')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Ticket promedio')},${esc(fmtMoney(k.avgTicket))},${esc('Ingresos cobrados ÷ reservas pagadas o con abono')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Tasa de cancelación')},${esc(fmtPct(k.cancellationRatePct))},${esc('Canceladas sobre el total')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Clientes recurrentes')},${esc(fmtNum(k.recurringClients))},${esc('Con 2+ reservas confirmadas')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Reservas totales')},${esc(fmtNum(k.reservationsTotal))},${esc('Todos los estados')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Reservas confirmadas')},${esc(fmtNum(k.reservationsConfirmed))},${esc('Solo confirmadas')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Reservas canceladas')},${esc(fmtNum(k.reservationsCancelled))},${esc('Anuladas en el periodo')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Hora con más reservas')},${esc(k.peakHour == null ? '-' : `${k.peakHour}:00`)},${esc('Mayor cantidad de confirmadas')}`
      )
      rows.push(
        `${esc('KPIS CLAVE')},${esc('Hora con menos reservas')},${esc(k.valleyHour == null ? '-' : `${k.valleyHour}:00`)},${esc('Menor cantidad de confirmadas')}`
      )

      rows.push('')
      rows.push(
        `${esc('COMPARATIVA')},${esc('Ingresos periodo anterior')},${esc(fmtMoney(snapshot.comparative.previousRevenueTotal))},${esc('Base de comparación del periodo previo')}`
      )
      rows.push(
        `${esc('COMPARATIVA')},${esc('Diferencia de ingresos')},${esc(fmtMoney(snapshot.comparative.revenueDeltaAbs))},${esc('Cambio absoluto vs periodo anterior')}`
      )
      rows.push(
        `${esc('COMPARATIVA')},${esc('Variación porcentual')},${esc(fmtPct(snapshot.comparative.revenueDeltaPct))},${esc('Cambio relativo vs periodo anterior')}`
      )

      rows.push('')
      rows.push('ALERTAS,Tipo de alerta,Mensaje,')
      snapshot.alerts.forEach((a, idx) => {
        const severityLabel =
          a.severity === 'critical'
            ? 'Crítica'
            : a.severity === 'warning'
              ? 'Advertencia'
              : 'Informativa'
        rows.push(
          `${esc('ALERTAS')},${esc(`Alerta ${idx + 1} (${severityLabel})`)},${esc(a.message)},`
        )
      })
    }

    rows.push('')
    rows.push('INGRESOS DIARIOS,FECHA,INGRESOS DEL DÍA,RESERVAS CONFIRMADAS')
    args.incomeSeries.forEach((p) => {
      rows.push(
        `${esc('INGRESOS DIARIOS')},${esc(fmtDate(p.bucketDate))},${esc(fmtMoney(p.revenueCollected))},${esc(fmtNum(p.reservationsConfirmed))}`
      )
    })

    rows.push('')
    rows.push('RENDIMIENTO POR CANCHA,CANCHA,RESERVAS TOTALES,CONFIRMADAS,CANCELADAS,INGRESOS')
    args.courtsBreakdown.forEach((c) => {
      rows.push(
        `${esc('RENDIMIENTO POR CANCHA')},${esc(c.courtName)},${esc(fmtNum(c.reservationsTotal))},${esc(fmtNum(c.reservationsConfirmed))},${esc(fmtNum(c.reservationsCancelled))},${esc(fmtMoney(c.revenueCollected))}`
      )
    })

    const blob = new Blob([`\uFEFF${rows.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `${args.fileBaseName ?? 'venue-bi'}-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])
}

