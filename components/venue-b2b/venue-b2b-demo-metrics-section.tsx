'use client'

import { Card, CardContent } from '@/components/ui/card'
import { VenueBiCourtsBarChart } from '@/components/venue-bi/bi-courts-bar-chart'
import { VenueBiIncomeLineChart } from '@/components/venue-bi/bi-income-line-chart'
import {
  VENUE_B2B_DEMO_COURTS_BREAKDOWN,
  VENUE_B2B_DEMO_INCOME_SERIES,
} from '@/lib/venue-b2b-demo-bi-data'
import {
  VENUE_B2B_KPI_DISCLAIMER,
  VENUE_B2B_KPI_EXAMPLES,
} from '@/lib/venue-b2b-marketing'

/**
 * Bloque “Ejemplos del tipo de métricas”: mismos componentes de gráfico que el panel de sede + KPIs resumen.
 */
export function VenueB2bDemoMetricsSection() {
  return (
    <section className="scroll-mt-28" aria-labelledby="venue-b2b-kpi-heading">
      <h2
        id="venue-b2b-kpi-heading"
        className="font-brand-heading text-2xl text-foreground md:text-3xl"
      >
        Ejemplos del tipo de métricas que verías
      </h2>
      <p className="mt-4 max-w-3xl text-pretty text-sm text-muted-foreground md:text-base">
        En el panel puedes hacer seguimiento de señales operativas y de ingresos según
        cómo registres reservas y cobros. Abajo, los mismos tipos de visualización que
        usa el panel de tu sede (datos de demostración).
      </p>
      <p
        className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-foreground dark:border-amber-400/25 dark:bg-amber-400/10 md:text-sm"
        role="note"
      >
        {VENUE_B2B_KPI_DISCLAIMER}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {VENUE_B2B_KPI_EXAMPLES.map((k) => (
          <Card
            key={k.label}
            className="gap-0 rounded-2xl border border-border bg-muted/30 py-0 dark:bg-secondary/40"
          >
            <CardContent className="p-4 text-center md:p-5">
              <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
              <div className="font-brand-heading mt-2 text-2xl text-accent md:text-3xl">
                {k.value}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-muted-foreground md:text-xs">
                {k.caption}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <VenueBiIncomeLineChart data={VENUE_B2B_DEMO_INCOME_SERIES} />
        <VenueBiCourtsBarChart data={VENUE_B2B_DEMO_COURTS_BREAKDOWN} />
      </div>
    </section>
  )
}
