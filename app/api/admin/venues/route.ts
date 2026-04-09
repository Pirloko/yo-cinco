import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'
import {
  apiLog,
  checkRateLimit,
  createApiContext,
  errorJson,
  reportServerError,
  successJson,
} from '@/lib/server/api-utils'

export async function GET(req: Request) {
  const ctx = createApiContext(req)
  const rl = checkRateLimit(req, {
    bucket: 'api:admin:venues:get',
    limit: 120,
    windowMs: 60_000,
  })
  if (!rl.ok) {
    return errorJson(
      ctx,
      429,
      'Demasiadas solicitudes al panel de centros.',
      'rate_limited',
      undefined,
      { 'Retry-After': String(rl.retryAfterSec) }
    )
  }
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return errorJson(ctx, 403, auth.error, 'forbidden')
    }
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('sports_venues')
      .select(
        'id, owner_id, name, address, phone, city, city_id, maps_url, created_at, is_paused, slot_duration_minutes'
      )
      .order('name', { ascending: true })
    if (error) {
      apiLog('error', 'admin_venues_query_failed', ctx, { message: error.message })
      return errorJson(ctx, 500, error.message, 'admin_venues_query_failed')
    }
    const venueRows =
      (rows as
        | Array<{
            id: string
            owner_id: string
            name: string
            address: string
            phone: string
            city: string
            city_id: string | null
            maps_url: string | null
            created_at: string
            is_paused: boolean | null
            slot_duration_minutes: number
          }>
        | null) ?? []

    const cityIds = [...new Set(venueRows.map((v) => v.city_id).filter(Boolean))] as string[]
    let cityRows: Array<{ id: string; name: string; region_id: string }> = []
    let regionRows: Array<{ id: string; name: string }> = []
    if (cityIds.length > 0) {
      const { data: cities } = await admin
        .from('geo_cities')
        .select('id, name, region_id')
        .in('id', cityIds)
      cityRows = (cities as typeof cityRows | null) ?? []
      const regionIds = [...new Set(cityRows.map((c) => c.region_id).filter(Boolean))]
      if (regionIds.length > 0) {
        const { data: regions } = await admin
          .from('geo_regions')
          .select('id, name')
          .in('id', regionIds)
        regionRows = (regions as typeof regionRows | null) ?? []
      }
    }

    const regionNameById = new Map(regionRows.map((r) => [r.id, r.name]))
    const cityMetaById = new Map(
      cityRows.map((c) => [
        c.id,
        {
          name: c.name,
          regionId: c.region_id,
          regionName: regionNameById.get(c.region_id) ?? null,
        },
      ]),
    )

    const venues = venueRows.map((v) => {
      const cm = v.city_id ? cityMetaById.get(v.city_id) : undefined
      return {
        id: v.id,
        ownerId: v.owner_id,
        name: v.name,
        address: v.address ?? '',
        phone: v.phone ?? '',
        city: v.city ?? '',
        cityId: v.city_id ?? '',
        cityName: cm?.name ?? v.city ?? '',
        regionId: cm?.regionId ?? null,
        regionName: cm?.regionName ?? null,
        mapsUrl: v.maps_url ?? null,
        isPaused: v.is_paused ?? false,
        slotDurationMinutes: v.slot_duration_minutes ?? 60,
        createdAt: v.created_at,
      }
    })

    apiLog('info', 'admin_venues_listed', ctx, { count: venues.length })
    return successJson(ctx, { venues })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    apiLog('error', 'admin_venues_unhandled_error', ctx, { message: msg })
    void reportServerError(e, ctx, { route: 'admin/venues' })
    return errorJson(ctx, 500, msg, 'internal_error')
  }
}
