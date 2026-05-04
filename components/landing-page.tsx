'use client'

import { useId, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SPORTMATCH_GA_EVENTS, trackSportmatchEvent } from '@/lib/gtag'
import { useAppUI } from '@/lib/app-context'
import { Target, Users, Shuffle, ChevronRight, Building2, UserCircle } from 'lucide-react'
import { ThemeMenuButton } from '@/components/theme-controls'
import { BrandMark } from '@/components/brand-mark'
import {
  VENUE_B2B_LANDING_CTA_LABEL,
  VENUE_B2B_MAIN_COPY_LINES,
} from '@/lib/venue-b2b-marketing'

export function LandingPage() {
  const { setCurrentScreen } = useAppUI()

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Fondo suave: oscuro = casi negro con matiz; claro = blanco roto */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,oklch(0.72_0.19_142_/_0.12),transparent_55%)] dark:bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,oklch(0.72_0.19_142_/_0.18),transparent_50%)]"
        aria-hidden
      />

      <header className="sticky top-0 z-20 flex min-h-[4.5rem] items-center justify-between border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur-md md:min-h-[5.5rem] md:px-8 md:py-3">
        <BrandMark
          size="md"
          showLogo
          wordmarkTypography
          textClassName="text-foreground"
        />
        <div className="flex shrink-0 items-center gap-1">
          <ThemeMenuButton />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-foreground hover:bg-foreground/5 md:h-11 md:w-11 dark:hover:bg-white/10"
            onClick={() => setCurrentScreen('auth')}
            aria-label="Iniciar sesión"
            title="Iniciar sesión"
          >
            <UserCircle className="h-[1.35rem] w-[1.35rem] md:h-6 md:w-6" aria-hidden />
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero: copy + CTAs */}
        <section className="mx-auto w-full max-w-4xl px-4 pb-6 pt-10 text-center md:pt-14">
          <h1 className="font-brand-heading text-balance text-4xl leading-[1.08] tracking-tight text-foreground md:text-6xl md:leading-[1.06] lg:text-7xl">
            <span className="block">Encuentra tu próximo</span>
            <span className="block text-primary">partido hoy</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg lg:text-xl">
            Juega fútbol amateur 6 vs 6 en tu zona. Conecta con rivales,
            completa tu equipo y únete a partidos abiertos en minutos.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <Button
              size="lg"
              className="font-brand h-14 min-w-[200px] rounded-full px-10 text-base shadow-lg shadow-primary/25 md:text-lg"
              onClick={() => setCurrentScreen('auth')}
            >
              Empezar ahora
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-brand h-14 min-w-[200px] rounded-full border-2 border-border bg-secondary/80 px-10 text-base text-foreground backdrop-blur-sm hover:bg-secondary md:text-lg"
              onClick={() => setCurrentScreen('auth')}
            >
              Explorar partidos
            </Button>
          </div>
        </section>

        {/* Logo oficial + tarjeta centros + aviso apps */}
        <section className="relative mx-auto w-full max-w-3xl flex-shrink-0 px-4 pb-6 md:pb-10">
          <div className="animate-float-logo relative mx-auto w-full max-w-[min(100%,520px)]">
            <div
              className="pointer-events-none absolute left-1/2 top-[45%] -z-0 h-[min(70vw,420px)] w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl dark:bg-primary/35"
              aria-hidden
            />
            <div className="relative z-10 mx-auto w-full">
              <Image
                src="/logohome.webp"
                alt="SPORTMATCH: ubicación y deportes"
                width={1200}
                height={800}
                className="h-auto w-full object-contain drop-shadow-[0_0_48px_oklch(0.72_0.19_142_/_0.25)] dark:drop-shadow-[0_0_64px_oklch(0.72_0.19_142_/_0.35)]"
                sizes="(max-width: 768px) 100vw, 520px"
                priority
              />
              <CurvedArchWordmark />
            </div>
          </div>

          {/* Centros deportivos: justo encima de “Apps móviles” */}
          <div
            className="mx-auto mt-8 w-full max-w-4xl md:mt-10"
            aria-label="Sportmatch para centros deportivos"
          >
            <Card className="gap-0 rounded-2xl py-0 shadow-sm transition-colors hover:border-primary/40 dark:shadow-none dark:hover:border-primary/50 md:text-center">
              <CardContent className="space-y-4 p-6 md:space-y-5 md:p-8">
                <div className="mb-1 flex justify-center md:mb-0">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/20">
                    <Building2 className="h-7 w-7" strokeWidth={2} aria-hidden />
                  </div>
                </div>
                <h2 className="font-brand-heading text-balance text-xl text-foreground md:text-2xl">
                  {VENUE_B2B_MAIN_COPY_LINES.lead}
                </h2>
                <p className="mx-auto max-w-xl text-pretty text-sm leading-relaxed text-primary md:text-base">
                  {VENUE_B2B_MAIN_COPY_LINES.support}
                </p>
                <p className="mx-auto max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
                  Si administras canchas y quieres más jugadores, reservas ordenadas y
                  métricas claras, entra y te explicamos la propuesta para sedes.
                </p>
                <div className="flex justify-center pt-2">
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="font-brand h-12 min-w-[200px] rounded-full border-2 border-primary/50 bg-secondary/60 px-8 text-base text-foreground backdrop-blur-sm hover:border-primary hover:bg-secondary md:h-14 md:px-10 md:text-lg"
                  >
                    <Link
                      href="/para-centros"
                      onClick={() =>
                        trackSportmatchEvent(
                          SPORTMATCH_GA_EVENTS.venueB2bNavClick,
                          { nav_source: 'landing_card' }
                        )
                      }
                    >
                      {VENUE_B2B_LANDING_CTA_LABEL}
                      <ChevronRight className="ml-2 h-5 w-5" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <MobileStoresBelowLogo />
        </section>

        {/* Tarjetas */}
        <section className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6 md:pt-10">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
            <FeatureCard
              icon={<Target className="h-7 w-7" strokeWidth={2} />}
              title="Encuentra rival"
              description="Tu equipo contra otro equipo. Coordina partidos competitivos."
            />
            <FeatureCard
              icon={<Users className="h-7 w-7" strokeWidth={2} />}
              title="Encuentra jugadores"
              description="¿Te falta gente? Completa tu equipo de forma rápida."
            />
            <FeatureCard
              icon={<Shuffle className="h-7 w-7" strokeWidth={2} />}
              title="Revueltas abiertas"
              description="Súmate a partidos abiertos y conoce nuevos jugadores."
            />
          </div>
        </section>
      </main>

      {/* Stats */}
      <div className="border-t border-border bg-muted/30 py-10 dark:bg-secondary/40">
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-6 px-4 text-center">
          <div>
            <div className="font-brand-heading text-2xl text-accent md:text-3xl">500+</div>
            <div className="mt-1 text-sm text-muted-foreground">Jugadores</div>
          </div>
          <div>
            <div className="font-brand-heading text-2xl text-accent md:text-3xl">120+</div>
            <div className="mt-1 text-sm text-muted-foreground">Partidos / mes</div>
          </div>
          <div>
            <div className="font-brand-heading text-2xl text-accent md:text-3xl">15</div>
            <div className="mt-1 text-sm text-muted-foreground">Canchas</div>
          </div>
        </div>
      </div>

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

/**
 * Wordmark curvo (arco “sonrisa”) con texto sobre trazo SVG — referencia tipo lettering deportivo.
 */
function CurvedArchWordmark() {
  const raw = useId()
  const sid = raw.replace(/[^a-zA-Z0-9]/g, '') || 'sm'
  const pathId = `sportmatch-arch-${sid}`
  const gradId = `sportmatch-grad-${sid}`

  return (
    <div
      className="arch-wordmark-wrap mx-auto -mt-4 w-full max-w-[min(100%,400px)] px-1 md:-mt-6 md:max-w-[420px]"
      aria-label="SportMatch"
      role="img"
    >
      <svg
        className="arch-wordmark-svg w-full overflow-visible"
        viewBox="0 0 440 108"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <path id={pathId} d="M 18 82 Q 220 4 422 82" />
          <linearGradient
            id={gradId}
            className="arch-wordmark__gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="48%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>

        <text
          className="arch-wordmark__text font-brand"
          fill={`url(#${gradId})`}
          letterSpacing="0.07em"
        >
          <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
            SportMatch
          </textPath>
        </text>
      </svg>
    </div>
  )
}

/**
 * Debajo del logo hero: aviso de tiendas (solo informativo, sin enlaces).
 * Diseño: dos “píldoras” horizontales estilo fila de descargas, tono suave.
 */
function MobileStoresBelowLogo() {
  return (
    <div
      className="mx-auto mt-8 w-full max-w-lg select-none"
      role="region"
      aria-label="Aplicaciones móviles próximamente en App Store y Google Play"
    >
      <p className="mb-5 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Apps móviles
      </p>
      <ul className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
        <li className="flex flex-col items-center gap-2">
          <span className="rounded-md bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Próximamente
          </span>
          {/* Badges oficiales Apple (negro claro / blanco oscuro, guías App Store) */}
          <Image
            src="/badge-app-store.svg"
            alt="Descarga en App Store"
            width={180}
            height={60}
            className="h-14 w-auto max-w-[min(100%,240px)] object-contain object-left dark:hidden"
          />
          <Image
            src="/badge-app-store-white.svg"
            alt="Descarga en App Store"
            width={180}
            height={60}
            className="hidden h-14 w-auto max-w-[min(100%,240px)] object-contain object-left dark:block"
          />
        </li>
        <li className="flex flex-col items-center gap-2">
          <span className="rounded-md bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Próximamente
          </span>
          {/* Badge oficial Google Play */}
          <Image
            src="/badge-google-play.webp"
            alt="Disponible en Google Play"
            width={480}
            height={186}
            className="h-14 w-auto max-w-[min(100%,240px)] object-contain object-left opacity-95"
            sizes="240px"
          />
        </li>
      </ul>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-primary/40 dark:shadow-none dark:hover:border-primary/50">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/20">
        {icon}
      </div>
      <h3 className="font-brand-heading mb-2 text-lg text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}
