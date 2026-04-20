import type { Metadata } from 'next'

import { RancaguaSeoPage } from '@/components/seo/rancagua-seo-page'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'
import { fetchRancaguaSeoMatches } from '@/lib/supabase/seo-rancagua-matches'

const PATH = '/rancagua/faltan-jugadores'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  return {
    title: 'Faltan jugadores en Rancagua | Sportmatch',
    description:
      'Partidos que buscan jugadores o arquero en Rancagua. Únete desde la app Sportmatch y completa la pichanga.',
    alternates: { canonical },
    openGraph: {
      title: 'Faltan jugadores en Rancagua | Sportmatch',
      description:
        'Oportunidades tipo &quot;faltan jugadores&quot; en Rancagua para completar equipos.',
      url: canonical,
    },
  }
}

export default async function FaltanJugadoresRancaguaPage() {
  const origin = getSeoSiteOrigin()
  const matches = await fetchRancaguaSeoMatches({ typeFilter: 'players' })

  return (
    <RancaguaSeoPage
      h1="Partidos donde faltan jugadores en Rancagua"
      intro={
        <p>
          Cuando a la pichanga le faltan jugadores o arquero, los organizadores
          la publican en Sportmatch para que completes el cupo en Rancagua. Este
          listado muestra partidos activos con fecha futura: entras con el
          enlace, abres la app y te ofreces según lo que busque el creador
          (arco, campo o ambos). Así evitas quedarte a las malas con equipos
          incompletos y mantienes el juego parejo para todos los que van al
          encuentro.
        </p>
      }
      matches={matches}
      seoPageFullUrl={`${origin}${PATH}`}
      siteOrigin={origin}
    />
  )
}
