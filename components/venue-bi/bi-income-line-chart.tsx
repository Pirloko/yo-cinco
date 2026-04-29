'use client'

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { VenueBiIncomePoint } from '@/lib/venue-bi/types'

const chartConfig = {
  revenue: {
    label: 'Ingresos',
    color: 'hsl(142 78% 45%)',
  },
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

export function VenueBiIncomeLineChart({ data }: { data: VenueBiIncomePoint[] }) {
  return (
    <Card className="border-border bg-card shadow-sm ring-1 ring-black/[0.04] dark:bg-zinc-950/80 dark:ring-white/[0.06]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-foreground dark:text-zinc-200">
          Ingresos por día
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <LineChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="bucketDate" tickFormatter={shortDate} />
            <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="revenueCollected"
              name="revenue"
              stroke="var(--color-revenue)"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

