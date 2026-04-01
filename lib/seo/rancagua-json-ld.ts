import type { RancaguaSeoMatchRow } from '@/lib/supabase/seo-rancagua-matches'

/** JSON-LD: lista de SportsEvent para una página SEO. */
export function buildRancaguaSportsEventJsonLd(
  matches: RancaguaSeoMatchRow[],
  seoPageFullUrl: string,
  siteOrigin: string
): Record<string, unknown> {
  const graph = matches.map((m) => ({
    '@type': 'SportsEvent',
    '@id': `${seoPageFullUrl}#match-${m.id}`,
    name: m.title,
    startDate: m.date_time,
    url: `${siteOrigin}/?matchId=${m.id}`,
    location: {
      '@type': 'Place',
      name: m.location || 'Rancagua, Chile',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Rancagua',
        addressCountry: 'CL',
      },
    },
  }))

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}
