import type { Metadata } from 'next'
import Link from 'next/link'

import { RancaguaSeoPage } from '@/components/seo/rancagua-seo-page'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'
import { fetchRancaguaSeoMatches } from '@/lib/supabase/seo-rancagua-matches'

const PATH = '/rancagua/canchas/san-lorenzo'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  return {
    title: 'Canchas de fútbol 7 y futbolito en San Lorenzo Rancagua | Sportmatch',
    description:
      'San Lorenzo, Rancagua: futbolito, fútbol 7 y canchas para jugar con equipo o revuelta. Encuentra partidos y reserva cancha con Sportmatch.',
    alternates: { canonical },
    openGraph: {
      title: 'Canchas en San Lorenzo Rancagua | Sportmatch',
      description:
        'Guía para jugar futbolito y fútbol 7 en canchas en Rancagua, sector San Lorenzo. Listado de partidos y acceso a la app.',
      url: canonical,
    },
  }
}

export default async function SanLorenzoCanchasPage() {
  const origin = getSeoSiteOrigin()
  const matches = await fetchRancaguaSeoMatches({
    typeFilter: 'all',
    locationKeywords: ['san lorenzo'],
  })

  return (
    <RancaguaSeoPage
      h1="Canchas de futbolito y fútbol 7 en San Lorenzo Rancagua"
      intro={
        <>
          <p>
            El sector <strong>San Lorenzo</strong> concentra a quienes buscan
            jugar <strong>futbolito</strong> o <strong>fútbol 7</strong> sin
            salir de <strong>Rancagua</strong>: encuentros entre amigos,
            rivales para tu equipo y espacios donde reservar la cancha con
            anticipación. Las <strong>canchas en Rancagua</strong> suelen
            mezclar formatos reducidos y horarios que calzan después del
            trabajo; Sportmatch agrupa avisos reales para que entres a la app,
            veas el detalle y coordines pago y confirmación con el grupo.
          </p>
          <p>
            Para más opciones en toda la ciudad, visita{' '}
            <Link
              href="/rancagua/futbolito"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              partidos de futbolito en Rancagua
            </Link>
            . Otras zonas útiles:{' '}
            <Link
              href="/rancagua/canchas/santa-helena"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Santa Helena
            </Link>
            ,{' '}
            <Link
              href="/rancagua/canchas/energy"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Energy
            </Link>{' '}
            y{' '}
            <Link
              href="/rancagua/canchas/san-damian"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              San Damián
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
