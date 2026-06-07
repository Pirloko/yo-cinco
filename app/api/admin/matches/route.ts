import { NextResponse } from 'next/server'

import {
  mapAdminMatchListItem,
  type AdminMatchListSummary,
} from '@/lib/admin/match-dashboard'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

const MATCH_SELECT =
  'id, type, title, location, venue, city_id, date_time, level, creator_id, players_needed, players_joined, status, created_at, finalized_at, rival_result, casual_completed, suspended_at, suspended_reason, revuelta_result, rival_outcome_disputed'

const VALID_STATUS = new Set([
  'all',
  'upcoming',
  'active',
  'completed',
  'suspended',
  'cancelled',
])
const VALID_TYPES = new Set([
  'all',
  'open',
  'team_pick_public',
  'team_pick_private',
  'rival',
  'players',
])
const VALID_SCOPE = new Set(['all', 'mine'])

async function resolveCityIdsFilter(
  admin: ReturnType<typeof createAdminClient>,
  regionId: string,
  cityId: string
): Promise<string[] | undefined> {
  if (cityId) return [cityId]
  if (!regionId) return undefined
  const { data: citiesInRegion, error } = await admin
    .from('geo_cities')
    .select('id')
    .eq('region_id', regionId)
  if (error) throw new Error(error.message)
  const ids = (citiesInRegion ?? []).map((c: { id: string }) => c.id)
  return ids.length > 0 ? ids : []
}

function applyCityFilter<T extends { in: (col: string, vals: string[]) => T }>(
  q: T,
  cityIdsFilter: string[] | undefined
) {
  if (cityIdsFilter && cityIdsFilter.length > 0) {
    return q.in('city_id', cityIdsFilter)
  }
  return q
}

type FilterOpts = {
  statusFilter: string
  typeFilter: string
  scope: string
  search: string
  adminUserId: string
}

function applyListFilters<Q extends {
  eq: (col: string, val: string) => Q
  in: (col: string, vals: string[]) => Q
  not: (col: string, op: string, val: null) => Q
  is: (col: string, val: null) => Q
  gte: (col: string, val: string) => Q
  or: (filters: string) => Q
}>(q: Q, opts: FilterOpts): Q {
  const now = new Date().toISOString()

  if (opts.scope === 'mine') {
    q = q.eq('creator_id', opts.adminUserId)
  }

  if (opts.typeFilter !== 'all') {
    q = q.eq('type', opts.typeFilter)
  }

  switch (opts.statusFilter) {
    case 'upcoming':
      q = q.in('status', ['pending', 'confirmed']).gte('date_time', now)
      break
    case 'active':
      q = q.in('status', ['pending', 'confirmed'])
      break
    case 'completed':
      q = q.eq('status', 'completed')
      break
    case 'suspended':
      q = q.eq('status', 'cancelled').not('suspended_at', 'is', null)
      break
    case 'cancelled':
      q = q.eq('status', 'cancelled').is('suspended_at', null)
      break
    default:
      break
  }

  if (opts.search) {
    const safe = opts.search.replace(/[%_]/g, '')
    q = q.or(`title.ilike.%${safe}%,venue.ilike.%${safe}%,location.ilike.%${safe}%`)
  }

  return q
}

async function fetchSummary(
  admin: ReturnType<typeof createAdminClient>,
  cityIdsFilter: string[] | undefined,
  scope: string,
  adminUserId: string
): Promise<AdminMatchListSummary> {
  const now = new Date().toISOString()

  const base = () => {
    let q = admin.from('match_opportunities').select('*', { count: 'exact', head: true })
    q = applyCityFilter(q, cityIdsFilter)
    if (scope === 'mine') q = q.eq('creator_id', adminUserId)
    return q
  }

  const [{ count: total }, { count: upcoming }, { count: completed }, { count: suspended }, { count: active }] =
    await Promise.all([
      base(),
      base().in('status', ['pending', 'confirmed']).gte('date_time', now),
      base().eq('status', 'completed'),
      base().eq('status', 'cancelled').not('suspended_at', 'is', null),
      base().in('status', ['pending', 'confirmed']),
    ])

  return {
    total: total ?? 0,
    upcoming: upcoming ?? 0,
    completed: completed ?? 0,
    suspended: suspended ?? 0,
    active: active ?? 0,
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }

    const url = new URL(req.url)
    const regionId = url.searchParams.get('regionId')?.trim() || ''
    const cityId = url.searchParams.get('cityId')?.trim() || ''
    const statusFilter = url.searchParams.get('status')?.trim() || 'all'
    const typeFilter = url.searchParams.get('type')?.trim() || 'all'
    const scope = url.searchParams.get('scope')?.trim() || 'all'
    const search = url.searchParams.get('search')?.trim() || ''
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 100)
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0)

    if (!VALID_STATUS.has(statusFilter)) {
      return NextResponse.json({ error: 'Filtro de estado inválido' }, { status: 400 })
    }
    if (!VALID_TYPES.has(typeFilter)) {
      return NextResponse.json({ error: 'Filtro de tipo inválido' }, { status: 400 })
    }
    if (!VALID_SCOPE.has(scope)) {
      return NextResponse.json({ error: 'Alcance inválido' }, { status: 400 })
    }

    const admin = createAdminClient()
    const cityIdsFilter = await resolveCityIdsFilter(admin, regionId, cityId)

    if (cityIdsFilter && cityIdsFilter.length === 0) {
      return NextResponse.json({
        regionId: regionId || null,
        cityId: cityId || null,
        status: statusFilter,
        type: typeFilter,
        scope,
        search: search || null,
        limit,
        offset,
        total: 0,
        summary: {
          total: 0,
          upcoming: 0,
          completed: 0,
          suspended: 0,
          active: 0,
        },
        matches: [],
      })
    }

    const filterOpts: FilterOpts = {
      statusFilter,
      typeFilter,
      scope,
      search,
      adminUserId: auth.userId,
    }

    let listQuery = admin
      .from('match_opportunities')
      .select(MATCH_SELECT, { count: 'exact' })
    listQuery = applyCityFilter(listQuery, cityIdsFilter)
    listQuery = applyListFilters(listQuery, filterOpts)
    listQuery = listQuery.order('date_time', { ascending: false }).range(offset, offset + limit - 1)

    const [summary, { data: rows, error, count }] = await Promise.all([
      fetchSummary(admin, cityIdsFilter, scope, auth.userId),
      listQuery,
    ])

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const matchRows = rows ?? []
    const cityIds = [...new Set(matchRows.map((r) => r.city_id as string).filter(Boolean))]
    const creatorIds = [...new Set(matchRows.map((r) => r.creator_id as string).filter(Boolean))]

    const cityMeta = new Map<string, { name: string; region_id: string }>()
    if (cityIds.length > 0) {
      const { data: cities } = await admin
        .from('geo_cities')
        .select('id, name, region_id')
        .in('id', cityIds)
      for (const c of cities ?? []) {
        const row = c as { id: string; name: string; region_id: string }
        cityMeta.set(row.id, { name: row.name, region_id: row.region_id })
      }
    }

    const regionIds = [...new Set([...cityMeta.values()].map((c) => c.region_id))]
    const regionNameById = new Map<string, string>()
    if (regionIds.length > 0) {
      const { data: regions } = await admin
        .from('geo_regions')
        .select('id, name')
        .in('id', regionIds)
      for (const r of regions ?? []) {
        regionNameById.set((r as { id: string }).id, (r as { name: string }).name)
      }
    }

    const profileById = new Map<string, { name: string; accountType: string | null }>()
    if (creatorIds.length > 0) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, name, account_type')
        .in('id', creatorIds)
      for (const p of profs ?? []) {
        const row = p as { id: string; name: string; account_type: string | null }
        profileById.set(row.id, { name: row.name ?? '—', accountType: row.account_type })
      }
    }

    const matches = matchRows.map((row) => {
      const cid = row.city_id as string
      const cm = cityMeta.get(cid)
      const cr = row.creator_id as string
      const prof = profileById.get(cr)
      return mapAdminMatchListItem(row as Record<string, unknown>, {
        cityName: cm?.name ?? null,
        regionId: cm?.region_id ?? null,
        regionName: cm ? regionNameById.get(cm.region_id) ?? null : null,
        creatorName: prof?.name ?? '—',
        creatorAccountType: prof?.accountType ?? null,
        adminUserId: auth.userId,
      })
    })

    return NextResponse.json({
      regionId: regionId || null,
      cityId: cityId || null,
      status: statusFilter,
      type: typeFilter,
      scope,
      search: search || null,
      limit,
      offset,
      total: count ?? 0,
      summary,
      matches,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
