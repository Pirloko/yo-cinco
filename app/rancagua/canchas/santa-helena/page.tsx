import type { Metadata } from 'next'
import Link from 'next/link'

import { RancaguaSeoPage } from '@/components/seo/rancagua-seo-page'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'
import { fetchRancaguaSeoMatches } from '@/lib/supabase/seo-rancagua-matches'

const PATH = '/rancagua/canchas/santa-helena'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  return {
    title: 'Canchas de futbolito en Santa Helena Rancagua | Sportmatch',
    description:
      'Futbolito y fútbol 7 cerca de Santa Helena, Rancagua: encuentra partidos, rivales y reserva canchas. Listado en Sportmatch con enlaces a la app.',
    alternates: { canonical },
    openGraph: {
      title: 'Canchas de futbolito en Santa Helena Rancagua | Sportmatch',
      description:
        'Juega futbolito o fútbol 7 en canchas en Rancagua zona Santa Helena. Partidos publicados y guía para sumarte desde Sportmatch.',
      url: canonical,
    },
  }
}

export default async function SantaHelenaCanchasPage() {
  const origin = getSeoSiteOrigin()
  const matches = await fetchRancaguaSeoMatches({
    typeFilter: 'all',
    locationKeywords: ['santa helena'],
  })

  return (
    <RancaguaSeoPage
      h1="Canchas de futbolito en Santa Helena Rancagua"
      intro={
        <>
          <p>
            Santa Helena es uno de los sectores donde muchos equipos y grupos
            de amigos buscan{' '}
            <strong>futbolito</strong> y <strong>fútbol 7</strong> en la
            región: partidos rápidos, canchas más chicas y el ritmo típico de
            las <strong>canchas en Rancagua</strong>. En Sportmatch puedes ver
            publicaciones con fecha y lugar, sumarte a una revuelta o armar un
            desafío cuando necesitas completar nómina o reservar hora en un
            recinto cercano.
          </p>
          <p>
            Si quieres una vista general de partidos amateur en la ciudad, entra
            a{' '}
            <Link
              href="/rancagua/futbolito"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              futbolito en Rancagua
            </Link>
            . También conviene revisar otras zonas con instalaciones para{' '}
            <Link
              href="/rancagua/canchas/san-lorenzo"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              San Lorenzo
            </Link>
            ,{' '}
            <Link
              href="/rancagua/canchas/energy"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Energy
            </Link>{' '}
            o{' '}
            <Link
              href="/rancagua/canchas/san-damian"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              San Damián
            </Link>
            , según dónde te quede mejor coordinar la cancha y el equipo.
          </p>
        </>
      }
      matches={matches}
      seoPageFullUrl={`${origin}${PATH}`}
      siteOrigin={origin}
    />
  )
}
