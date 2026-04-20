import type { Metadata } from 'next'

import { RancaguaSeoPage } from '@/components/seo/rancagua-seo-page'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'
import { fetchRancaguaSeoMatches } from '@/lib/supabase/seo-rancagua-matches'

const PATH = '/rancagua/buscar-rival'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  return {
    title: 'Buscar rival en Rancagua | Sportmatch',
    description:
      'Desafía a otro equipo: partidos tipo rival en Rancagua. En Sportmatch ves oportunidades confirmadas o pendientes y entras a la app para coordinar.',
    alternates: { canonical },
    openGraph: {
      title: 'Buscar rival en Rancagua | Sportmatch',
      description:
        'Listado de partidos busca rival en Rancagua. Encuentra equipos para jugar fútbol amateur.',
      url: canonical,
    },
  }
}

export default async function BuscarRivalRancaguaPage() {
  const origin = getSeoSiteOrigin()
  const matches = await fetchRancaguaSeoMatches({ typeFilter: 'rival' })

  return (
    <RancaguaSeoPage
      h1="Buscar rival para partido en Rancagua"
      intro={
        <p>
          Si tu equipo busca rival en Rancagua, aquí ves publicaciones activas
          donde otro grupo ya dejó la pichanga armada o está buscando
          contrincante. Sportmatch concentra el tipo de partido &quot;rival&quot;
          para que capitanes y jugadores entren a la app, revisen fecha, nivel y
          ubicación, y coordinen el desafío sin depender de grupos de WhatsApp
          dispersos. Ideal para mantener el ritmo de competencia amateur en la
          ciudad.
        </p>
      }
      matches={matches}
      seoPageFullUrl={`${origin}${PATH}`}
      siteOrigin={origin}
    />
  )
}
