'use client'

import Link from 'next/link'
import {
  BarChart3,
  CalendarCheck,
  Clock,
  ListChecks,
  Megaphone,
  MessageCircle,
  Star,
  UserCircle,
} from 'lucide-react'

import { BrandMark } from '@/components/brand-mark'
import { ThemeMenuButton } from '@/components/theme-controls'
import { Button } from '@/components/ui/button'
import { VenueB2bDemoMetricsSection } from '@/components/venue-b2b/venue-b2b-demo-metrics-section'
import { Card, CardContent } from '@/components/ui/card'
import { SPORTMATCH_GA_EVENTS, trackSportmatchEvent } from '@/lib/gtag'
import {
  VENUE_B2B_AUDIENCE_SECTION,
  VENUE_B2B_BENEFITS,
  VENUE_B2B_FINAL_CTA_SUB,
  VENUE_B2B_FINAL_CTA_TITLE,
  VENUE_B2B_MAIN_COPY_LINES,
  VENUE_B2B_MEMBERSHIP_SECTION,
  VENUE_B2B_MEMBERSHIP_STEPS,
  VENUE_B2B_PAGE_HERO_INTRO,
  VENUE_B2B_WHATSAPP_PRIMARY_LABEL,
} from '@/lib/venue-b2b-marketing'

const BENEFIT_ICONS = [
  Megaphone,
  CalendarCheck,
  Clock,
  BarChart3,
  Star,
  ListChecks,
] as const

type VenueB2bPublicPageProps = {
  whatsappHref: string | null
}

function trackWhatsappClick(placement: 'hero' | 'footer') {
  trackSportmatchEvent(SPORTMATCH_GA_EVENTS.venueB2bWhatsappClick, {
    cta_placement: placement,
  })
}

/**
 * Landing pública B2B (/para-centros): beneficios, KPIs de ejemplo y flujo de alta.
 */
export function VenueB2bPublicPage({ whatsappHref }: VenueB2bPublicPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,oklch(0.72_0.19_142_/_0.12),transparent_55%)] dark:bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,oklch(0.72_0.19_142_/_0.18),transparent_50%)]"
        aria-hidden
      />

      <header className="sticky top-0 z-20 flex min-h-[4.5rem] items-center justify-between border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur-md md:min-h-[5.5rem] md:px-8 md:py-3">
        <Link
          href="/"
          className="min-w-0 shrink outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Ir al inicio SPORTMATCH"
        >
          <BrandMark
            size="md"
            showLogo
            wordmarkTypography
            textClassName="text-foreground"
          />
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeMenuButton />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-foreground hover:bg-foreground/5 md:h-11 md:w-11 dark:hover:bg-white/10"
            asChild
          >
            <Link
              href="/?screen=auth"
              aria-label="Iniciar sesión"
              title="Iniciar sesión"
            >
              <UserCircle className="h-[1.35rem] w-[1.35rem] md:h-6 md:w-6" aria-hidden />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto w-full max-w-3xl scroll-mt-28 px-4 pb-10 pt-10 text-center md:pb-14 md:pt-14">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Sportmatch para sedes
          </p>
          <h1 className="font-brand-heading text-balance text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
            <span className="block">{VENUE_B2B_MAIN_COPY_LINES.lead}</span>
            <span className="mt-3 block text-primary md:mt-4">
              {VENUE_B2B_MAIN_COPY_LINES.support}
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
            {VENUE_B2B_PAGE_HERO_INTRO}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            {whatsappHref ? (
              <Button
                size="lg"
                className="font-brand h-14 min-w-[220px] rounded-full px-10 text-base shadow-lg shadow-primary/25 md:text-lg"
                asChild
              >
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackWhatsappClick('hero')}
                >
                  <MessageCircle className="mr-2 h-5 w-5" aria-hidden />
                  {VENUE_B2B_WHATSAPP_PRIMARY_LABEL}
                </a>
              </Button>
            ) : null}
            <Button
              size="lg"
              variant="outline"
              asChild
              className="font-brand h-14 min-w-[200px] rounded-full border-2 border-border bg-secondary/80 px-10 text-base text-foreground backdrop-blur-sm hover:bg-secondary md:text-lg"
            >
              <Link href="/">Volver al inicio</Link>
            </Button>
          </div>

          {!whatsappHref ? (
            <p className="mt-6 text-xs text-muted-foreground">
              Configura{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">
                NEXT_PUBLIC_VENUE_B2B_WHATSAPP
              </code>{' '}
              para mostrar el botón de contacto.
            </p>
          ) : null}
        </section>

        <div className="mx-auto w-full max-w-5xl space-y-16 px-4 pb-20 md:space-y-20 md:pb-24">
          {/* Audiencia */}
          <section
            className="scroll-mt-28"
            aria-labelledby="venue-b2b-audience-heading"
          >
            <h2
              id="venue-b2b-audience-heading"
              className="font-brand-heading text-2xl text-foreground md:text-3xl"
            >
              {VENUE_B2B_AUDIENCE_SECTION.title}
            </h2>
            <p className="mt-4 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              {VENUE_B2B_AUDIENCE_SECTION.intro}
            </p>
            <ul className="mt-6 max-w-3xl list-inside list-disc space-y-2 text-sm leading-relaxed text-foreground marker:text-primary md:text-base">
              {VENUE_B2B_AUDIENCE_SECTION.bullets.map((line) => (
                <li key={line} className="pl-1">
                  {line}
                </li>
              ))}
            </ul>
          </section>

          {/* Beneficios */}
          <section
            className="scroll-mt-28"
            aria-labelledby="venue-b2b-benefits-heading"
          >
            <h2
              id="venue-b2b-benefits-heading"
              className="font-brand-heading text-2xl text-foreground md:text-3xl"
            >
              Ventajas de sumar tu centro
            </h2>
            <p className="mt-4 max-w-3xl text-pretty text-sm text-muted-foreground md:text-base">
              Herramientas pensadas para la operación real de una sede que recibe
              pichangas y equipos.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
              {VENUE_B2B_BENEFITS.map((b, i) => {
                const Icon = BENEFIT_ICONS[i] ?? ListChecks
                return (
                  <Card
                    key={b.title}
                    className="gap-0 rounded-2xl py-0 shadow-sm transition-colors hover:border-primary/40 dark:shadow-none dark:hover:border-primary/50"
                  >
                    <CardContent className="p-6">
                      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/20">
                        <Icon className="h-7 w-7" strokeWidth={2} aria-hidden />
                      </div>
                      <h3 className="font-brand-heading mb-2 text-lg text-foreground">
                        {b.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {b.description}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>

          <VenueB2bDemoMetricsSection />

          {/* Pasos membresía / alta */}
          <section className="scroll-mt-28" aria-labelledby="venue-b2b-steps-heading">
            <h2
              id="venue-b2b-steps-heading"
              className="font-brand-heading text-2xl text-foreground md:text-3xl"
            >
              {VENUE_B2B_MEMBERSHIP_SECTION.title}
            </h2>
            <p className="mt-4 max-w-3xl text-pretty text-sm text-muted-foreground md:text-base">
              {VENUE_B2B_MEMBERSHIP_SECTION.intro}
            </p>
            <ol className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              {VENUE_B2B_MEMBERSHIP_STEPS.map((step, index) => (
                <li key={step.title}>
                  <Card className="h-full gap-0 rounded-2xl py-0 dark:bg-card/80">
                    <CardContent className="p-6">
                      <span className="font-brand-heading mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-base text-primary">
                        {index + 1}
                      </span>
                      <h3 className="font-brand-heading mb-2 text-base text-foreground">
                        {step.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {step.body}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </section>

          {/* CTA final */}
          <section
            className="scroll-mt-28"
            aria-labelledby="venue-b2b-final-cta"
          >
            <Card className="gap-0 rounded-2xl border-primary/35 bg-primary/5 py-0 dark:bg-primary/10">
              <CardContent className="px-6 py-10 text-center md:px-10 md:py-12">
                <h2
                  id="venue-b2b-final-cta"
                  className="font-brand-heading text-xl text-foreground md:text-2xl"
                >
                  {VENUE_B2B_FINAL_CTA_TITLE}
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
                  {VENUE_B2B_FINAL_CTA_SUB}
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  {whatsappHref ? (
                    <Button
                      size="lg"
                      className="font-brand h-14 min-w-[220px] rounded-full px-10 text-base shadow-lg shadow-primary/25 md:text-lg"
                      asChild
                    >
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackWhatsappClick('footer')}
                      >
                        <MessageCircle className="mr-2 h-5 w-5" aria-hidden />
                        {VENUE_B2B_WHATSAPP_PRIMARY_LABEL}
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="font-brand h-14 min-w-[200px] rounded-full border-2 border-border bg-background/80 px-10 text-base backdrop-blur-sm md:text-lg"
                  >
                    <Link href="/">Volver al inicio</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-6 px-4">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 md:flex-row">
          <BrandMark
            size="sm"
            textClassName="font-brand-heading text-base text-foreground"
          />
          <p className="text-sm text-muted-foreground">
            2026 SPORTMATCH. Hecho en Chile.
          </p>
        </div>
      </footer>
    </div>
  )
}
