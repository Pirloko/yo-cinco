import type { Metadata } from 'next'

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
        <p>
          En Sportmatch podés encontrar partidos de futbolito y fútbol amateur en
          Rancagua: rivales para tu equipo, cupos cuando faltan jugadores y
          revueltas abiertas para completar equipos. Publicamos listados
          actualizados con fecha y lugar para que entres a la app, te sumes al
          que te calce y coordines con el resto del grupo. Todo queda pensado
          para la cancha chica y el ritmo local, sin vueltas innecesarias.
        </p>
      }
      matches={matches}
      seoPageFullUrl={`${origin}${PATH}`}
      siteOrigin={origin}
    />
  )
}
