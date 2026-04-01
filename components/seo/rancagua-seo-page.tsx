import type { ReactNode } from 'react'

import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import type { RancaguaSeoMatchRow } from '@/lib/supabase/seo-rancagua-matches'
import { buildRancaguaSportsEventJsonLd } from '@/lib/seo/rancagua-json-ld'

type Props = {
  h1: string
  intro: ReactNode
  matches: RancaguaSeoMatchRow[]
  seoPageFullUrl: string
  siteOrigin: string
}

export function RancaguaSeoPage({
  h1,
  intro,
  matches,
  seoPageFullUrl,
  siteOrigin,
}: Props) {
  const jsonLd = buildRancaguaSportsEventJsonLd(
    matches,
    seoPageFullUrl,
    siteOrigin
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-balance md:text-3xl">
          {h1}
        </h1>
        <div className="mt-4 space-y-4 text-muted-foreground leading-relaxed">
          {intro}
        </div>

        <section className="mt-10" aria-labelledby="partidos-heading">
          <h2 id="partidos-heading" className="sr-only">
            Partidos próximos
          </h2>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay partidos publicados próximos en Rancagua por ahora. Volvé a
              la app para crear o buscar uno.
            </p>
          ) : (
            <ul className="space-y-4 border border-border rounded-xl p-4 md:p-6">
              {matches.map((m) => (
                <li key={m.id}>
                  <a
                    href={`/?matchId=${encodeURIComponent(m.id)}`}
                    className="block rounded-lg border border-transparent px-2 py-3 transition-colors hover:border-primary/30 hover:bg-muted/40"
                  >
                    <span className="font-semibold text-foreground">
                      {m.title}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {formatMatchInTimezone(
                        m.date_time,
                        "EEEE d 'de' MMMM yyyy, HH:mm"
                      )}{' '}
                      · {m.location}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd),
        }}
      />
    </div>
  )
}
