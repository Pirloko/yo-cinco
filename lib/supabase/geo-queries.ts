import type { SupabaseClient } from '@supabase/supabase-js'
import type { GeoCity, GeoCountry, GeoRegion } from '@/lib/types'
import { GEO_DEFAULT_CITY_SLUG } from '@/lib/geo-constants'

/**
 * Embeds de una sola relación: el parser de tipos de Supabase no infiere bien
 * cadenas con muchos niveles; país/región se leen vía `fetchGeoCatalogActive` cuando haga falta.
 */
export const PROFILE_SELECT_WITH_GEO =
  'id, name, age, birth_date, gender, position, level, city, city_id, availability, photo_url, bio, whatsapp_phone, player_essentials_completed_at, stats_player_wins, stats_player_draws, stats_player_losses, stats_organized_completed, stats_organizer_wins, mod_yellow_cards, mod_red_cards, mod_suspended_until, mod_banned_at, mod_ban_reason, mod_last_yellow_at, mod_last_red_at, created_at, account_type, geo_city:geo_cities!city_id(id,name,slug,region_id)'

export const MATCH_OPPORTUNITY_SELECT_WITH_GEO =
  'id, type, title, description, location, venue, city_id, date_time, level, creator_id, team_name, players_needed, players_joined, players_seek_profile, gender, status, created_at, finalized_at, rival_result, casual_completed, suspended_at, suspended_reason, revuelta_lineup, revuelta_result, rival_captain_vote_challenger, rival_captain_vote_accepted, rival_outcome_disputed, match_stats_applied_at, sports_venue_id, venue_reservation_id, private_revuelta_team_id, geo_city:geo_cities!city_id(id,name,slug,region_id)'

export const SPORTS_VENUE_SELECT_WITH_GEO =
  'id, owner_id, name, address, maps_url, phone, city_id, city, is_paused, slot_duration_minutes, created_at, geo_city:geo_cities!city_id(id,name,slug,region_id)'

export const TEAM_SELECT_WITH_GEO =
  'id, name, logo_url, level, captain_id, vice_captain_id, city_id, city, gender, description, stats_wins, stats_draws, stats_losses, stats_win_streak, stats_loss_streak, created_at, geo_city:geo_cities!city_id(id,name,slug,region_id)'

function mapCountryRow(r: Record<string, unknown>): GeoCountry {
  return {
    id: r.id as string,
    isoCode: r.iso_code as string,
    name: r.name as string,
    isActive: (r.is_active as boolean) ?? true,
  }
}

function mapRegionRow(r: Record<string, unknown>): GeoRegion {
  return {
    id: r.id as string,
    countryId: r.country_id as string,
    code: r.code as string,
    name: r.name as string,
    isActive: (r.is_active as boolean) ?? true,
  }
}

function mapCityRow(r: Record<string, unknown>): GeoCity {
  return {
    id: r.id as string,
    regionId: r.region_id as string,
    name: r.name as string,
    slug: r.slug as string,
    isActive: (r.is_active as boolean) ?? true,
  }
}

export async function fetchDefaultCityId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase
    .from('geo_cities')
    .select('id')
    .eq('slug', GEO_DEFAULT_CITY_SLUG)
    .eq('is_active', true)
    .maybeSingle()
  if (error || !data) return null
  return data.id as string
}

/**
 * Resuelve `city_id` desde texto de UI (nombre o slug).
 * Si no hay coincidencia, devuelve la ciudad por defecto (Rancagua) si existe.
 */
export async function resolveCityIdFromLabel(
  supabase: SupabaseClient,
  cityLabel: string
): Promise<string | null> {
  const t = cityLabel.trim()
  if (!t) return fetchDefaultCityId(supabase)

  const slugGuess = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  if (slugGuess.length > 0) {
    const { data: bySlug } = await supabase
      .from('geo_cities')
      .select('id')
      .eq('is_active', true)
      .eq('slug', slugGuess)
      .maybeSingle()
    if (bySlug?.id) return bySlug.id as string
  }

  const { data: byName } = await supabase
    .from('geo_cities')
    .select('id')
    .eq('is_active', true)
    .ilike('name', t)
    .maybeSingle()
  if (byName?.id) return byName.id as string

  return fetchDefaultCityId(supabase)
}

export async function fetchGeoCountries(
  supabase: SupabaseClient,
  activeOnly = true
): Promise<GeoCountry[]> {
  let q = supabase
    .from('geo_countries')
    .select('id, iso_code, name, is_active')
    .order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error || !data) return []
  return data.map((r) => mapCountryRow(r as Record<string, unknown>))
}

export async function fetchGeoRegionsForCountry(
  supabase: SupabaseClient,
  countryId: string,
  activeOnly = true
): Promise<GeoRegion[]> {
  let q = supabase
    .from('geo_regions')
    .select('id, country_id, code, name, is_active')
    .eq('country_id', countryId)
    .order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error || !data) return []
  return data.map((r) => mapRegionRow(r as Record<string, unknown>))
}

export async function fetchGeoCitiesForRegion(
  supabase: SupabaseClient,
  regionId: string,
  activeOnly = true
): Promise<GeoCity[]> {
  let q = supabase
    .from('geo_cities')
    .select('id, region_id, name, slug, is_active')
    .eq('region_id', regionId)
    .order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error || !data) return []
  return data.map((r) => mapCityRow(r as Record<string, unknown>))
}

export type GeoCatalogActive = {
  countries: Array<
    GeoCountry & {
      regions: Array<
        GeoRegion & {
          cities: GeoCity[]
        }
      >
    }
  >
}

/** Países activos con regiones y ciudades activas (para selects admin / perfil). */
export async function fetchGeoCatalogActive(
  supabase: SupabaseClient
): Promise<GeoCatalogActive> {
  const countries = await fetchGeoCountries(supabase, true)
  const out: GeoCatalogActive['countries'] = []

  for (const c of countries) {
    const regions = await fetchGeoRegionsForCountry(supabase, c.id, true)
    const regionsWithCities = []
    for (const r of regions) {
      const cities = await fetchGeoCitiesForRegion(supabase, r.id, true)
      regionsWithCities.push({ ...r, cities })
    }
    out.push({ ...c, regions: regionsWithCities })
  }

  return { countries: out }
}
