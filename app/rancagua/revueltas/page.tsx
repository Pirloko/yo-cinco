import type { Metadata } from 'next'

import { RancaguaSeoPage } from '@/components/seo/rancagua-seo-page'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'
import { fetchRancaguaSeoMatches } from '@/lib/supabase/seo-rancagua-matches'

const PATH = '/rancagua/revueltas'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  return {
    title: 'Revueltas de fútbol en Rancagua | Sportmatch',
    description:
      'Revueltas abiertas en Rancagua: arma equipos al azar y juega. Listado de partidos tipo open en Sportmatch.',
    alternates: { canonical },
    openGraph: {
      title: 'Revueltas de fútbol en Rancagua | Sportmatch',
      description:
        'Encuentra revueltas y partidos abiertos en Rancagua para sumarte desde la app.',
      url: canonical,
    },
  }
}

export default async function RevueltasRancaguaPage() {
  const origin = getSeoSiteOrigin()
  const matches = await fetchRancaguaSeoMatches({ typeFilter: 'open' })

  return (
    <RancaguaSeoPage
      h1="Revueltas y partidos abiertos en Rancagua"
      intro={
        <p>
          Las revueltas son partidos abiertos donde se arman equipos al voleo y
          se completa la lista de jugadores en Rancagua. En Sportmatch puedes ver
          cuándo y dónde se juega, y desde el enlace entras a la aplicación para
          sumarte con tu rol (incluido arquero cuando corresponde). Es la
          forma más directa de meterse a una pichanga mixta sin equipo fijo,
          manteniendo la organización y la comunicación en un solo lugar.
        </p>
      }
      matches={matches}
      seoPageFullUrl={`${origin}${PATH}`}
      siteOrigin={origin}
    />
  )
}
