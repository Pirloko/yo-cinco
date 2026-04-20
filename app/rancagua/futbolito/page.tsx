import type { Metadata } from 'next'
import Link from 'next/link'

import { RancaguaSeoPage } from '@/components/seo/rancagua-seo-page'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'
import { fetchRancaguaSeoMatches } from '@/lib/supabase/seo-rancagua-matches'

const PATH = '/rancagua/futbolito'

/** Listados actualizados desde Supabase sin reconstruir todo el sitio. */
export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  return {
    title: 'Futbolito en Rancagua | Sportmatch',
    description:
      'Encuentra partidos de futbolito, rivales y jugadores en Rancagua. Sportmatch conecta equipos y personas para jugar fútbol amateur con reserva de cancha y revueltas.',
    alternates: { canonical },
    openGraph: {
      title: 'Futbolito en Rancagua | Sportmatch',
      description:
        'Encuentra partidos de futbolito y pichangas en Rancagua. Listado actualizado de partidos abiertos.',
      url: canonical,
    },
  }
}

export default async function FutbolitoRancaguaPage() {
  const origin = getSeoSiteOrigin()
  const matches = await fetchRancaguaSeoMatches({ typeFilter: 'all' })

  return (
    <RancaguaSeoPage
      h1="Partidos de futbolito en Rancagua"
      intro={
        <>
          <p>
            En Sportmatch puedes encontrar partidos de futbolito y fútbol amateur
            en Rancagua: rivales para tu equipo, cupos cuando faltan jugadores y
            revueltas abiertas para completar equipos. Publicamos listados
            actualizados con fecha y lugar para que entres a la app, te sumes al
            que te calce y coordines con el resto del grupo. Todo queda pensado
            para la cancha chica y el ritmo local, sin vueltas innecesarias.
          </p>
          <nav
            className="rounded-xl border border-border bg-muted/30 p-4"
            aria-label="Canchas y sectores en Rancagua"
          >
            <p className="text-sm font-medium text-foreground">
              Canchas y sectores (futbolito y fútbol 7)
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              <li>
                <Link
                  href="/rancagua/canchas/santa-helena"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Santa Helena
                </Link>
              </li>
              <li>
                <Link
                  href="/rancagua/canchas/san-lorenzo"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  San Lorenzo
                </Link>
              </li>
              <li>
                <Link
                  href="/rancagua/canchas/energy"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Energy
                </Link>
              </li>
              <li>
                <Link
                  href="/rancagua/canchas/san-damian"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  San Damián
                </Link>
              </li>
            </ul>
          </nav>
        </>
      }
      matches={matches}
      seoPageFullUrl={`${origin}${PATH}`}
      siteOrigin={origin}
    />
  )
}
