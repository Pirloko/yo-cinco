import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { BrandMark } from '@/components/brand-mark'
import { buttonVariants } from '@/components/ui/button'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { cn } from '@/lib/utils'
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
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3 md:py-4">
          <Link
            href="/"
            aria-label="SportMatch, ir a la app"
            className="rounded-md outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <BrandMark
              size="sm"
              showLogo
              wordmarkTypography
              label="SportMatch"
              textClassName="text-foreground dark:text-white"
            />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 md:py-10">
        <h1 className="text-2xl font-bold tracking-tight text-balance md:text-3xl">
          {h1}
        </h1>
        <div className="mt-4 space-y-4 text-muted-foreground leading-relaxed">
          {intro}
        </div>

        <section
          className="mt-8 rounded-2xl border border-primary/20 bg-primary/[0.06] p-5 shadow-sm dark:bg-primary/10 md:p-7"
          aria-labelledby="cta-sportmatch-heading"
        >
          <h2
            id="cta-sportmatch-heading"
            className="text-lg font-semibold tracking-tight text-foreground md:text-xl"
          >
            Únete a Sportmatch
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground md:text-base">
            Crea tu perfil gratis, publica o únete a partidos y coordina la cancha
            desde el celular. En segundos estás adentro.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <a
              href="/?register=1"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-12 rounded-full px-8 text-base font-semibold shadow-md shadow-primary/20'
              )}
            >
              Crear perfil
              <ChevronRight className="size-5" aria-hidden />
            </a>
            <a
              href="/?screen=auth"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'h-12 rounded-full border-2 px-8 text-base font-medium'
              )}
            >
              Iniciar sesión
            </a>
            <a
              href="/"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'lg' }),
                'h-12 text-muted-foreground hover:text-foreground'
              )}
            >
              Ir a la app
            </a>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="partidos-heading">
          <h2 id="partidos-heading" className="sr-only">
            Partidos próximos
          </h2>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              No hay partidos publicados próximos en Rancagua por ahora.{' '}
              <a
                href="/?register=1"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Crea tu perfil
              </a>{' '}
              para publicar el primero o buscar rivales y cupos en la app.
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
