import { createClient } from '@supabase/supabase-js'

import type { MatchType } from '@/lib/types'

export type RancaguaSeoMatchRow = {
  id: string
  title: string
  location: string
  date_time: string
  type: MatchType
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Listados SEO: RLS solo permite a anon leer partidos `open`; rival/players requieren
 * service role en servidor (solo columnas públicas del partido).
 */
export async function fetchRancaguaSeoMatches(options: {
  typeFilter: 'all' | MatchType
}): Promise<RancaguaSeoMatchRow[]> {
  const supabase = createServiceClient()
  if (!supabase) return []

  const { data: cities } = await supabase
    .from('geo_cities')
    .select('id')
    .or('name.ilike.%Rancagua%,slug.eq.rancagua')

  const cityIds = (cities ?? []).map((c) => c.id as string).filter(Boolean)
  const orParts = ['location.ilike.%Rancagua%', 'venue.ilike.%Rancagua%']
  if (cityIds.length > 0) {
    orParts.push(`city_id.in.(${cityIds.join(',')})`)
  }

  let q = supabase
    .from('match_opportunities')
    .select('id, title, location, date_time, type')
    .in('status', ['pending', 'confirmed'])
    .gte('date_time', new Date().toISOString())
    .or(orParts.join(','))
    .order('date_time', { ascending: true })
    .limit(100)

  if (options.typeFilter !== 'all') {
    q = q.eq('type', options.typeFilter)
  }

  const { data, error } = await q
  if (error || !data) return []

  return data.map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? 'Partido',
    location: (row.location as string) ?? '',
    date_time: row.date_time as string,
    type: row.type as MatchType,
  }))
}
