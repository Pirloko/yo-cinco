import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('sports_venues')
      .select(
        'id, owner_id, name, address, phone, city, city_id, maps_url, created_at, is_paused, slot_duration_minutes'
      )
      .order('name', { ascending: true })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
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

    return NextResponse.json({ venues })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
