import { NextResponse } from 'next/server'

import { parseAdminPlayersBusinessSnapshot } from '@/lib/admin/ceo-snapshot'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'

type PlayerRange = 'today' | '7d' | '15d' | '30d' | '90d'

const ONLINE_WINDOW_MS = 3 * 60 * 1000

function buildFromDate(range: PlayerRange): Date {
  const now = new Date()
  const d = new Date(now)
  switch (range) {
    case 'today':
      d.setHours(0, 0, 0, 0)
      return d
    case '7d':
      d.setDate(d.getDate() - 7)
      return d
    case '15d':
      d.setDate(d.getDate() - 15)
      return d
    case '30d':
      d.setDate(d.getDate() - 30)
      return d
    case '90d':
      d.setDate(d.getDate() - 90)
      return d
    default:
      d.setDate(d.getDate() - 30)
      return d
  }
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 })
    }

    const url = new URL(req.url)
    const range = (url.searchParams.get('range') ?? '30d') as PlayerRange
    const regionId = url.searchParams.get('regionId')?.trim() || ''
    const cityId = url.searchParams.get('cityId')?.trim() || ''

    if (!['today', '7d', '15d', '30d', '90d'].includes(range)) {
      return NextResponse.json({ error: 'Rango inválido' }, { status: 400 })
    }

    const admin = createAdminClient()

    let cityIdsFilter: string[] | undefined
    if (cityId) {
      cityIdsFilter = [cityId]
    } else if (regionId) {
      const { data: citiesInRegion, error: eCities } = await admin
        .from('geo_cities')
        .select('id')
        .eq('region_id', regionId)
      if (eCities) {
        return NextResponse.json({ error: eCities.message }, { status: 500 })
      }
      cityIdsFilter = (citiesInRegion ?? []).map((c: { id: string }) => c.id)
      if (cityIdsFilter.length === 0) {
        return NextResponse.json({
          range,
          regionId: regionId || null,
          cityId: cityId || null,
          from: buildFromDate(range).toISOString(),
          onlineWindowMinutes: ONLINE_WINDOW_MS / 60000,
          kpis: {
            totalActivePlayers: 0,
            createdToday: 0,
            onlineNow: 0,
            newPlayersInRange: 0,
            newTeamsInRange: 0,
            organizerEventsInRange: 0,
          },
          users: [],
          teams: [],
          organizerEvents: [],
          playerDirectory: [],
          playerDirectoryTotal: 0,
          business: null,
          businessError: null,
        })
      }
    }

    const applyCity = <T extends { in: (col: string, vals: string[]) => T }>(q: T) => {
      if (cityIdsFilter && cityIdsFilter.length > 0) {
        return q.in('city_id', cityIdsFilter)
      }
      return q
    }

    const nowIso = new Date().toISOString()
    const from = buildFromDate(range)
    const fromIso = from.toISOString()
    const todayStart = startOfToday().toISOString()
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()

    const playerBase = () =>
      applyCity(
        admin
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('account_type', 'player')
          .is('mod_banned_at', null)
      )

    const { count: totalActivePlayers } = await playerBase()

    let qCreatedToday = admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('account_type', 'player')
      .gte('created_at', todayStart)
    qCreatedToday = applyCity(qCreatedToday)
    const { count: createdToday } = await qCreatedToday

    let qOnline = admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('account_type', 'player')
      .is('mod_banned_at', null)
      .gte('last_seen_at', onlineSince)
    qOnline = applyCity(qOnline)
    const { count: onlineNow } = await qOnline

    let qNewPlayers = admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('account_type', 'player')
      .gte('created_at', fromIso)
      .lte('created_at', nowIso)
    qNewPlayers = applyCity(qNewPlayers)
    const { count: newPlayersInRange } = await qNewPlayers

    let qNewTeams = admin
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fromIso)
      .lte('created_at', nowIso)
    qNewTeams = applyCity(qNewTeams)
    const { count: newTeamsInRange } = await qNewTeams

    let qOpp = admin
      .from('match_opportunities')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fromIso)
      .lte('created_at', nowIso)
    qOpp = applyCity(qOpp)
    const { count: organizerEventsInRange } = await qOpp

    let dirCountQ = applyCity(
      admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('account_type', 'player')
        .is('mod_banned_at', null)
    )
    const { count: playerDirectoryTotal } = await dirCountQ

    let directoryQuery = admin
      .from('profiles')
      .select('id, name, city, city_id, created_at, last_seen_at')
      .eq('account_type', 'player')
      .is('mod_banned_at', null)
      .order('name', { ascending: true })
      .limit(200)
    directoryQuery = applyCity(directoryQuery)
    const { data: directoryRows, error: eDirectory } = await directoryQuery
    if (eDirectory) return NextResponse.json({ error: eDirectory.message }, { status: 500 })

    let usersQuery = admin
      .from('profiles')
      .select('id, name, city, city_id, created_at, last_seen_at')
      .eq('account_type', 'player')
      .gte('created_at', fromIso)
      .lte('created_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(120)
    usersQuery = applyCity(usersQuery)
    const { data: userRows, error: eUsers } = await usersQuery
    if (eUsers) return NextResponse.json({ error: eUsers.message }, { status: 500 })

    let teamsQuery = admin
      .from('teams')
      .select('id, name, created_at, captain_id, city_id')
      .gte('created_at', fromIso)
      .lte('created_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(120)
    teamsQuery = applyCity(teamsQuery)
    const { data: teamRows, error: eTeams } = await teamsQuery
    if (eTeams) return NextResponse.json({ error: eTeams.message }, { status: 500 })

    let oppQuery = admin
      .from('match_opportunities')
      .select('id, title, type, created_at, creator_id, city_id')
      .gte('created_at', fromIso)
      .lte('created_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(120)
    oppQuery = applyCity(oppQuery)
    const { data: oppRows, error: eOpp } = await oppQuery
    if (eOpp) return NextResponse.json({ error: eOpp.message }, { status: 500 })

    const captainIds = [...new Set((teamRows ?? []).map((t: { captain_id: string }) => t.captain_id))]
    const creatorIds = [...new Set((oppRows ?? []).map((o: { creator_id: string }) => o.creator_id))]
    const profileIds = [...new Set([...captainIds, ...creatorIds])]

    const profileNameById = new Map<string, string>()
    if (profileIds.length > 0) {
      const { data: profs } = await admin.from('profiles').select('id, name').in('id', profileIds)
      for (const p of profs ?? []) {
        profileNameById.set((p as { id: string }).id, (p as { name: string }).name ?? '')
      }
    }

    const allCityIds = [
      ...new Set([
        ...(directoryRows ?? []).map((u: { city_id: string }) => u.city_id),
        ...(userRows ?? []).map((u: { city_id: string }) => u.city_id),
        ...(teamRows ?? []).map((t: { city_id: string }) => t.city_id),
        ...(oppRows ?? []).map((o: { city_id: string }) => o.city_id),
      ]),
    ]
    const cityMeta = new Map<string, { name: string; region_id: string }>()
    if (allCityIds.length > 0) {
      const { data: cities } = await admin
        .from('geo_cities')
        .select('id, name, region_id')
        .in('id', allCityIds)
      for (const c of cities ?? []) {
        const row = c as { id: string; name: string; region_id: string }
        cityMeta.set(row.id, { name: row.name, region_id: row.region_id })
      }
    }

    const regionIds = [...new Set([...cityMeta.values()].map((m) => m.region_id))]
    const regionNameById = new Map<string, string>()
    if (regionIds.length > 0) {
      const { data: regions } = await admin.from('geo_regions').select('id, name').in('id', regionIds)
      for (const r of regions ?? []) {
        regionNameById.set((r as { id: string }).id, (r as { name: string }).name ?? '')
      }
    }

    const mapProfileRow = (u: Record<string, unknown>) => {
      const cid = u.city_id as string
      const cm = cityMeta.get(cid)
      return {
        id: u.id as string,
        name: (u.name as string) ?? '',
        city: (u.city as string) ?? '',
        cityId: cid,
        cityName: cm?.name ?? null,
        regionId: cm?.region_id ?? null,
        regionName: cm ? regionNameById.get(cm.region_id) ?? null : null,
        createdAt: u.created_at as string,
        lastSeenAt: (u.last_seen_at as string | null) ?? null,
      }
    }

    const playerDirectory = (directoryRows ?? []).map((u) => mapProfileRow(u as Record<string, unknown>))

    const users = (userRows ?? []).map((u) => mapProfileRow(u as Record<string, unknown>))

    const teams = (teamRows ?? []).map((t: Record<string, unknown>) => {
      const cid = t.city_id as string
      const cm = cityMeta.get(cid)
      const capId = t.captain_id as string
      return {
        id: t.id as string,
        name: (t.name as string) ?? '',
        createdAt: t.created_at as string,
        captainId: capId,
        captainName: profileNameById.get(capId) ?? '—',
        cityId: cid,
        cityName: cm?.name ?? null,
        regionId: cm?.region_id ?? null,
        regionName: cm ? regionNameById.get(cm.region_id) ?? null : null,
      }
    })

    const typeLabel = (ty: string) => {
      if (ty === 'open') return 'Revuelta'
      if (ty === 'rival') return 'Rival'
      if (ty === 'players') return 'Yo + cinco'
      return ty
    }

    const organizerEvents = (oppRows ?? []).map((o: Record<string, unknown>) => {
      const cid = o.city_id as string
      const cm = cityMeta.get(cid)
      const cr = o.creator_id as string
      return {
        id: o.id as string,
        title: (o.title as string) ?? '',
        type: o.type as string,
        typeLabel: typeLabel((o.type as string) ?? ''),
        createdAt: o.created_at as string,
        organizerId: cr,
        organizerName: profileNameById.get(cr) ?? '—',
        cityId: cid,
        cityName: cm?.name ?? null,
        regionId: cm?.region_id ?? null,
        regionName: cm ? regionNameById.get(cm.region_id) ?? null : null,
      }
    })

    const cityIdsForRpc =
      cityIdsFilter && cityIdsFilter.length > 0 ? cityIdsFilter : null
    const { data: bizRaw, error: bizErr } = await admin.rpc(
      'admin_players_business_snapshot',
      { p_city_ids: cityIdsForRpc }
    )
    const business = bizErr ? null : parseAdminPlayersBusinessSnapshot(bizRaw)

    return NextResponse.json({
      range,
      regionId: regionId || null,
      cityId: cityId || null,
      from: fromIso,
      onlineWindowMinutes: ONLINE_WINDOW_MS / 60000,
      kpis: {
        totalActivePlayers: totalActivePlayers ?? 0,
        createdToday: createdToday ?? 0,
        onlineNow: onlineNow ?? 0,
        newPlayersInRange: newPlayersInRange ?? 0,
        newTeamsInRange: newTeamsInRange ?? 0,
        organizerEventsInRange: organizerEventsInRange ?? 0,
      },
      users,
      teams,
      organizerEvents,
      playerDirectory,
      playerDirectoryTotal: playerDirectoryTotal ?? 0,
      business,
      businessError: bizErr ? bizErr.message : null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
