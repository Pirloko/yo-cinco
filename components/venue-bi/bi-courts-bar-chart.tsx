'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { VenueBiCourtBreakdown } from '@/lib/venue-bi/types'

const chartConfig = {
  revenue: {
    label: 'Ingreso',
    color: 'hsl(43 95% 56%)',
  },
}

export function VenueBiCourtsBarChart({ data }: { data: VenueBiCourtBreakdown[] }) {
  return (
    <Card className="border-border bg-card shadow-sm ring-1 ring-black/[0.04] dark:bg-zinc-950/80 dark:ring-white/[0.06]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wide text-foreground dark:text-zinc-200">
          Rendimiento por cancha
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="courtName" />
            <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="revenueCollected"
              name="revenue"
              fill="var(--color-revenue)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

