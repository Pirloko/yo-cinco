import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

import { getSeoSiteOrigin } from '@/lib/seo/site-origin'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSeoSiteOrigin()
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    {
      url: `${base}/rancagua/futbolito`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/rancagua/buscar-rival`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/rancagua/faltan-jugadores`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/rancagua/revueltas`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/rancagua/canchas/santa-helena`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: `${base}/rancagua/canchas/san-lorenzo`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: `${base}/rancagua/canchas/energy`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: `${base}/rancagua/canchas/san-damian`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.85,
    },
  ]

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const teamEntries: MetadataRoute.Sitemap = []
  const venueEntries: MetadataRoute.Sitemap = []

  if (url && serviceKey) {
    const sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const [teamsRes, venuesRes] = await Promise.all([
      sb.from('teams').select('id').limit(8000),
      sb.from('sports_venues').select('id').eq('is_paused', false).limit(8000),
    ])
    if (teamsRes.data?.length) {
      for (const t of teamsRes.data) {
        teamEntries.push({
          url: `${base}/equipo/${t.id as string}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.65,
        })
      }
    }
    if (venuesRes.data?.length) {
      for (const v of venuesRes.data) {
        venueEntries.push({
          url: `${base}/centro/${v.id as string}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.65,
        })
      }
    }
  } else if (url && anonKey) {
    const sb = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await sb.from('sports_venues').select('id').eq('is_paused', false).limit(8000)
    if (data?.length) {
      for (const v of data) {
        venueEntries.push({
          url: `${base}/centro/${v.id as string}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.65,
        })
      }
    }
  }

  return [...staticEntries, ...teamEntries, ...venueEntries]
}
