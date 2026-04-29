'use client'

import { AlertTriangle, Info, Siren } from 'lucide-react'
import type { VenueBiAlert } from '@/lib/venue-bi/types'

function iconBySeverity(severity: VenueBiAlert['severity']) {
  if (severity === 'critical') return Siren
  if (severity === 'warning') return AlertTriangle
  return Info
}

export function VenueBiAlertsPanel({ alerts }: { alerts: VenueBiAlert[] }) {
  if (!alerts.length) return null
  return (
    <div className="space-y-2">
      {alerts.map((a, idx) => {
        const Icon = iconBySeverity(a.severity)
        return (
          <div
            key={`${a.kind}-${idx}`}
            className="rounded-xl border border-amber-200/90 bg-amber-50 p-3 text-sm shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:shadow-none"
          >
            <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-300">
              <Icon className="h-4 w-4 shrink-0" />
              Alerta BI
            </p>
            <p className="mt-1 text-amber-950/85 dark:text-amber-100/90">{a.message}</p>
          </div>
        )
      })}
    </div>
  )
}

