import { NextResponse } from 'next/server'

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

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export async function GET(req: Request) {
  const ctx = createApiContext(req)
  const rl = checkRateLimit(req, {
    bucket: 'api:admin:geo:get',
    limit: 180,
    windowMs: 60_000,
  })
  if (!rl.ok) {
    return errorJson(
      ctx,
      429,
      'Demasiadas solicitudes al catálogo geográfico.',
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
    const [{ data: countries, error: e1 }, { data: regions, error: e2 }, { data: cities, error: e3 }] =
      await Promise.all([
        admin.from('geo_countries').select('*').order('name'),
        admin.from('geo_regions').select('*').order('name'),
        admin.from('geo_cities').select('*').order('name'),
      ])
    if (e1 || e2 || e3) {
      const msg = e1?.message ?? e2?.message ?? e3?.message ?? 'Error al leer catálogo'
      apiLog('error', 'admin_geo_read_failed', ctx, { message: msg })
      return errorJson(
        ctx,
        500,
        msg,
        'admin_geo_read_failed'
      )
    }
    return successJson(ctx, {
      countries: countries ?? [],
      regions: regions ?? [],
      cities: cities ?? [],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    apiLog('error', 'admin_geo_unhandled_error', ctx, { message: msg })
    void reportServerError(e, ctx, { route: 'admin/geo', method: 'GET' })
    return errorJson(ctx, 500, msg, 'internal_error')
  }
}

type Body =
  | {
      action: 'createCountry'
      isoCode: string
      name: string
      isActive?: boolean
    }
  | {
      action: 'updateCountry'
      id: string
      isoCode?: string
      name?: string
      isActive?: boolean
    }
  | { action: 'deleteCountry'; id: string }
  | {
      action: 'createRegion'
      countryId: string
      code: string
      name: string
      isActive?: boolean
    }
  | {
      action: 'updateRegion'
      id: string
      code?: string
      name?: string
      isActive?: boolean
    }
  | { action: 'deleteRegion'; id: string }
  | {
      action: 'createCity'
      regionId: string
      name: string
      slug?: string
      isActive?: boolean
    }
  | {
      action: 'updateCity'
      id: string
      name?: string
      slug?: string
      isActive?: boolean
    }
  | { action: 'deleteCity'; id: string }
  | { action: 'bulkUpdateCities'; ids: string[]; isActive: boolean }

export async function POST(req: Request) {
  const ctx = createApiContext(req)
  const rl = checkRateLimit(req, {
    bucket: 'api:admin:geo:post',
    limit: 90,
    windowMs: 60_000,
  })
  if (!rl.ok) {
    return errorJson(
      ctx,
      429,
      'Demasiadas operaciones administrativas en geo.',
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
    const body = (await req.json()) as Body

    switch (body.action) {
      case 'createCountry': {
        const iso = body.isoCode?.trim().toLowerCase()
        const name = body.name?.trim()
        if (!iso || iso.length !== 2 || !name) {
          return NextResponse.json(
            { error: 'ISO (2 letras) y nombre son obligatorios.' },
            { status: 400 }
          )
        }
        const { data, error } = await admin
          .from('geo_countries')
          .insert({
            iso_code: iso,
            name,
            is_active: body.isActive !== false,
          })
          .select('id')
          .single()
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        return NextResponse.json({ ok: true, id: data.id as string })
      }
      case 'updateCountry': {
        const row: Record<string, unknown> = {}
        if (body.isoCode !== undefined) row.iso_code = body.isoCode.trim().toLowerCase()
        if (body.name !== undefined) row.name = body.name.trim()
        if (body.isActive !== undefined) row.is_active = body.isActive
        if (Object.keys(row).length === 0) {
          return NextResponse.json({ error: 'Sin cambios.' }, { status: 400 })
        }
        const { error } = await admin.from('geo_countries').update(row).eq('id', body.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ ok: true })
      }
      case 'deleteCountry': {
        const { error } = await admin.from('geo_countries').delete().eq('id', body.id)
        if (error) {
          return NextResponse.json(
            { error: error.message.includes('foreign key') ? 'No se puede borrar: hay regiones u otros datos vinculados.' : error.message },
            { status: 409 }
          )
        }
        return NextResponse.json({ ok: true })
      }
      case 'createRegion': {
        const code = body.code?.trim().toUpperCase()
        const name = body.name?.trim()
        if (!body.countryId || !code || !name) {
          return NextResponse.json(
            { error: 'País, código y nombre son obligatorios.' },
            { status: 400 }
          )
        }
        const { data, error } = await admin
          .from('geo_regions')
          .insert({
            country_id: body.countryId,
            code,
            name,
            is_active: body.isActive !== false,
          })
          .select('id')
          .single()
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ ok: true, id: data.id as string })
      }
      case 'updateRegion': {
        const row: Record<string, unknown> = {}
        if (body.code !== undefined) row.code = body.code.trim().toUpperCase()
        if (body.name !== undefined) row.name = body.name.trim()
        if (body.isActive !== undefined) row.is_active = body.isActive
        if (Object.keys(row).length === 0) {
          return NextResponse.json({ error: 'Sin cambios.' }, { status: 400 })
        }
        const { error } = await admin.from('geo_regions').update(row).eq('id', body.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ ok: true })
      }
      case 'deleteRegion': {
        const { error } = await admin.from('geo_regions').delete().eq('id', body.id)
        if (error) {
          return NextResponse.json(
            { error: error.message.includes('foreign key') ? 'No se puede borrar: hay ciudades u otros datos vinculados.' : error.message },
            { status: 409 }
          )
        }
        return NextResponse.json({ ok: true })
      }
      case 'createCity': {
        const name = body.name?.trim()
        if (!body.regionId || !name) {
          return NextResponse.json(
            { error: 'Región y nombre de ciudad son obligatorios.' },
            { status: 400 }
          )
        }
        const slug = body.slug?.trim() ? slugify(body.slug) : slugify(name)
        if (!slug) {
          return NextResponse.json({ error: 'Slug inválido (usa letras o números).' }, { status: 400 })
        }
        const { data, error } = await admin
          .from('geo_cities')
          .insert({
            region_id: body.regionId,
            name,
            slug,
            is_active: body.isActive !== false,
          })
          .select('id')
          .single()
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ ok: true, id: data.id as string })
      }
      case 'updateCity': {
        const row: Record<string, unknown> = {}
        if (body.name !== undefined) row.name = body.name.trim()
        if (body.slug !== undefined) row.slug = slugify(body.slug)
        if (body.isActive !== undefined) row.is_active = body.isActive
        if (Object.keys(row).length === 0) {
          return NextResponse.json({ error: 'Sin cambios.' }, { status: 400 })
        }
        const { error } = await admin.from('geo_cities').update(row).eq('id', body.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ ok: true })
      }
      case 'bulkUpdateCities': {
        const ids = Array.from(new Set((body.ids ?? []).filter((x): x is string => typeof x === 'string')))
        if (ids.length === 0) {
          return NextResponse.json({ error: 'Indica al menos una ciudad.' }, { status: 400 })
        }
        if (ids.length > 2000) {
          return NextResponse.json(
            { error: 'Máximo 2000 ciudades por operación. Reduce la selección.' },
            { status: 400 }
          )
        }
        const { error } = await admin
          .from('geo_cities')
          .update({ is_active: body.isActive })
          .in('id', ids)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ ok: true, updated: ids.length })
      }
      case 'deleteCity': {
        const { error } = await admin.from('geo_cities').delete().eq('id', body.id)
        if (error) {
          return NextResponse.json(
            {
              error: error.message.includes('foreign key')
                ? 'No se puede borrar: hay perfiles, centros o partidos usando esta ciudad.'
                : error.message,
            },
            { status: 409 }
          )
        }
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    apiLog('error', 'admin_geo_write_unhandled_error', ctx, { message: msg })
    void reportServerError(e, ctx, { route: 'admin/geo', method: 'POST' })
    return errorJson(ctx, 500, msg, 'internal_error')
  }
}
