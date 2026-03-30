import type { SupabaseClient } from '@supabase/supabase-js'
import type { GeoCity, GeoCountry, GeoRegion } from '@/lib/types'
import { GEO_DEFAULT_CITY_SLUG } from '@/lib/geo-constants'

/**
 * Embeds de una sola relación: el parser de tipos de Supabase no infiere bien
 * cadenas con muchos niveles; país/región se leen vía `fetchGeoCatalogActive` cuando haga falta.
 */
export const PROFILE_SELECT_WITH_GEO =
  '*,geo_city:geo_cities!city_id(id,name,slug,region_id)'

export const MATCH_OPPORTUNITY_SELECT_WITH_GEO =
  '*,geo_city:geo_cities!city_id(id,name,slug,region_id)'

export const SPORTS_VENUE_SELECT_WITH_GEO =
  '*,geo_city:geo_cities!city_id(id,name,slug,region_id)'

export const TEAM_SELECT_WITH_GEO =
  '*,geo_city:geo_cities!city_id(id,name,slug)'

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
  let q = supabase.from('geo_countries').select('*').order('name')
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
    .select('*')
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
    .select('*')
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
