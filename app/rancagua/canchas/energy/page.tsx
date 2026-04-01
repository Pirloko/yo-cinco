import type { Metadata } from 'next'
import Link from 'next/link'

import { RancaguaSeoPage } from '@/components/seo/rancagua-seo-page'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'
import { fetchRancaguaSeoMatches } from '@/lib/supabase/seo-rancagua-matches'

const PATH = '/rancagua/canchas/energy'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  return {
    title: 'Canchas Energy Rancagua: futbolito y fútbol 7 | Sportmatch',
    description:
      'Partidos y canchas tipo Energy en Rancagua: futbolito, fútbol 7 y reservas. Sportmatch conecta jugadores y equipos con listados actualizados.',
    alternates: { canonical },
    openGraph: {
      title: 'Canchas Energy en Rancagua | Sportmatch',
      description:
        'Encontrá futbolito y fútbol 7 en canchas en Rancagua vinculadas a Energy. Sumate a partidos desde la app.',
      url: canonical,
    },
  }
}

export default async function EnergyCanchasPage() {
  const origin = getSeoSiteOrigin()
  const matches = await fetchRancaguaSeoMatches({
    typeFilter: 'all',
    locationKeywords: ['energy'],
  })

  return (
    <RancaguaSeoPage
      h1="Canchas de futbolito y fútbol 7 en Energy Rancagua"
      intro={
        <>
          <p>
            Cuando buscás <strong>futbolito</strong> o <strong>fútbol 7</strong>{' '}
            y el nombre del recinto o la ubicación incluye{' '}
            <strong>Energy</strong>, conviene tener un solo lugar donde ver
            quién arma partido y cuándo rueda la pelota en las{' '}
            <strong>canchas en Rancagua</strong>. Sportmatch muestra títulos y
            lugares publicados por organizadores reales: desde ahí abrís la
            aplicación, te sumás como jugador o arquero y seguís el hilo con el
            grupo para la reserva y el pago de la cancha.
          </p>
          <p>
            Explorá también la guía general de{' '}
            <Link
              href="/rancagua/futbolito"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              futbolito en Rancagua
            </Link>
            , u otras áreas como{' '}
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
              href="/rancagua/canchas/san-damian"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              San Damián
            </Link>
            , según el sector que te quede más cómodo para jugar.
          </p>
        </>
      }
      matches={matches}
      seoPageFullUrl={`${origin}${PATH}`}
      siteOrigin={origin}
    />
  )
}
