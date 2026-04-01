import type { Metadata } from 'next'
import Link from 'next/link'

import { RancaguaSeoPage } from '@/components/seo/rancagua-seo-page'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'
import { fetchRancaguaSeoMatches } from '@/lib/supabase/seo-rancagua-matches'

const PATH = '/rancagua/canchas/san-damian'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  return {
    title: 'Canchas San Damián Rancagua: futbolito y fútbol 7 | Sportmatch',
    description:
      'Futbolito y fútbol 7 en San Damián, Rancagua. Partidos abiertos, rivales y canchas: listado Sportmatch y enlace a la app.',
    alternates: { canonical },
    openGraph: {
      title: 'Canchas en San Damián Rancagua | Sportmatch',
      description:
        'Jugá en canchas en Rancagua zona San Damián: futbolito, fútbol 7 y coordinación de equipos con Sportmatch.',
      url: canonical,
    },
  }
}

export default async function SanDamianCanchasPage() {
  const origin = getSeoSiteOrigin()
  const matches = await fetchRancaguaSeoMatches({
    typeFilter: 'all',
    locationKeywords: ['san damian', 'san damián'],
  })

  return (
    <RancaguaSeoPage
      h1="Canchas de futbolito en San Damián Rancagua"
      intro={
        <>
          <p>
            <strong>San Damián</strong> es una referencia habitual para quienes
            arman <strong>futbolito</strong> o <strong>fútbol 7</strong> en el
            Gran <strong>Rancagua</strong>: buena oferta de turnos, equipos que
            repiten semanalmente y jugadores que buscan cupo suelto. Las{' '}
            <strong>canchas en Rancagua</strong> de este sector combinan
            iluminación, pasto sintético o cemento según el recinto; lo
            importante es encontrar un partido que calce con tu nivel y tu
            horario. En Sportmatch los organizadores publican título, fecha y
            ubicación para que reserves tu lugar y charles con el grupo en el
            chat del partido.
          </p>
          <p>
            No te pierdas la página principal de{' '}
            <Link
              href="/rancagua/futbolito"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              futbolito y partidos en Rancagua
            </Link>
            . Otras entradas por zona:{' '}
            <Link
              href="/rancagua/canchas/santa-helena"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Santa Helena
            </Link>
            ,{' '}
            <Link
              href="/rancagua/canchas/san-lorenzo"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              San Lorenzo
            </Link>{' '}
            y{' '}
            <Link
              href="/rancagua/canchas/energy"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Energy
            </Link>
            .
          </p>
        </>
      }
      matches={matches}
      seoPageFullUrl={`${origin}${PATH}`}
      siteOrigin={origin}
    />
  )
}
