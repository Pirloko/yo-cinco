'use client'

import { Download, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { VenueBiRangePreset } from '@/lib/venue-bi/types'

type Props = {
  preset: VenueBiRangePreset
  setPreset: (p: VenueBiRangePreset) => void
  customFrom: string
  customTo: string
  setCustomFrom: (v: string) => void
  setCustomTo: (v: string) => void
  onExportCsv: () => void
  loading?: boolean
}

export function VenueBiFiltersToolbar({
  preset,
  setPreset,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
  onExportCsv,
  loading = false,
}: Props) {
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-3 shadow-sm ring-1 ring-black/[0.04] dark:bg-card/80 dark:ring-white/[0.06]">
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['today', 'Hoy'],
          ['7d', '7 días'],
          ['30d', '30 días'],
          ['custom', 'Personalizado'],
        ] as const).map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={preset === id ? 'default' : 'ghost'}
            className="rounded-full"
            onClick={() => setPreset(id)}
          >
            {label}
          </Button>
        ))}
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={onExportCsv} disabled={loading}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>
      </div>
      {preset === 'custom' ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="sm:col-span-1 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Rango personalizado
          </div>
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      ) : null}
    </div>
  )
}

