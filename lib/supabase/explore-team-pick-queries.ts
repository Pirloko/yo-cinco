import type { SupabaseClient } from '@supabase/supabase-js'
import type { Gender } from '@/lib/types'
import { MATCH_OPPORTUNITIES_CLIENT_VIEW } from '@/lib/supabase/geo-queries'
import {
  DEFAULT_TEAM_PICK_COLOR_A,
  DEFAULT_TEAM_PICK_COLOR_B,
  normalizeTeamPickHexColor,
} from '@/lib/team-pick-ui'

export type ExplorePublicTeamPickRow = {
  id: string
  /** Discrimina público vs privado listado públicamente (privado sigue exigiendo código para unirse). */
  listingKind: 'team_pick_public' | 'team_pick_private'
  title: string
  venue: string
  location: string
  cityId: string
  cityRegionId?: string
  dateTime: Date
  playersJoined: number
  playersNeeded: number
  teamPickColorA: string
  teamPickColorB: string
}

type GeoEmbed = { region_id?: string | null } | null

/**
 * Partidos 6vs6 para Explorar: públicos + privados visibles en listado (el privado exige código para unirse).
 */
export async function fetchPublicTeamPickMatchesForExplore(
  supabase: SupabaseClient,
  opts: {
    gender: Gender
    regionId?: string | null
    cityId?: string | null
  }
): Promise<ExplorePublicTeamPickRow[]> {
  const { data, error } = await supabase
    .from(MATCH_OPPORTUNITIES_CLIENT_VIEW)
    .select(
      'id, type, title, venue, location, city_id, date_time, players_needed, players_joined, team_pick_color_a, team_pick_color_b, geo_city:geo_cities!city_id(region_id)'
    )
    .in('type', ['team_pick_public', 'team_pick_private'])
    .in('status', ['pending', 'confirmed'])
    .eq('gender', opts.gender)
    .gte('date_time', new Date().toISOString())
    .order('date_time', { ascending: true })
    .limit(80)

  if (error || !data?.length) return []

  const regionId = opts.regionId?.trim() || null
  const cityId = opts.cityId?.trim() || null

  const out: ExplorePublicTeamPickRow[] = []
  for (const raw of data as unknown as Array<{
    id: string
    type: string
    title: string | null
    venue: string | null
    location: string | null
    city_id: string | null
    date_time: string
    players_needed: number | null
    players_joined: number | null
    team_pick_color_a?: string | null
    team_pick_color_b?: string | null
    geo_city?: GeoEmbed | GeoEmbed[]
  }>) {
    const embed = raw.geo_city
    const geo = Array.isArray(embed) ? embed[0] : embed
    const cityRegion = geo?.region_id?.trim() || undefined
    if (regionId && cityRegion && cityRegion !== regionId) continue
    const cid = (raw.city_id as string) || ''
    if (cityId && cid !== cityId) continue

    const a =
      normalizeTeamPickHexColor(raw.team_pick_color_a) ?? DEFAULT_TEAM_PICK_COLOR_A
    const b =
      normalizeTeamPickHexColor(raw.team_pick_color_b) ?? DEFAULT_TEAM_PICK_COLOR_B

    const listingKind =
      raw.type === 'team_pick_private' ? 'team_pick_private' : 'team_pick_public'

    out.push({
      id: raw.id,
      listingKind,
      title: (raw.title as string)?.trim() || '6vs6',
      venue: (raw.venue as string)?.trim() || '',
      location: (raw.location as string)?.trim() || '',
      cityId: cid,
      cityRegionId: cityRegion,
      dateTime: new Date(raw.date_time),
      playersJoined: raw.players_joined ?? 0,
      playersNeeded: raw.players_needed ?? 12,
      teamPickColorA: a,
      teamPickColorB: b,
    })
  }

  return out
}
