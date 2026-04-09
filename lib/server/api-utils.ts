import { NextResponse } from 'next/server'

type LogLevel = 'info' | 'warn' | 'error'

export type ApiContext = {
  requestId: string
  method: string
  path: string
  ip: string
  userAgent: string
}

type RateLimitOptions = {
  bucket: string
  limit: number
  windowMs: number
}

type RateLimitResult = {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

type BucketState = {
  count: number
  resetAt: number
}

function getRequestHeader(req: Request, key: string): string {
  return req.headers.get(key)?.trim() ?? ''
}

function getIp(req: Request): string {
  const forwarded = getRequestHeader(req, 'x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown'
  return getRequestHeader(req, 'x-real-ip') || 'unknown'
}

function getRateBuckets(): Map<string, BucketState> {
  const g = globalThis as typeof globalThis & {
    __sportmatchRateBuckets?: Map<string, BucketState>
  }
  if (!g.__sportmatchRateBuckets) {
    g.__sportmatchRateBuckets = new Map<string, BucketState>()
  }
  return g.__sportmatchRateBuckets
}

export function createApiContext(req: Request): ApiContext {
  const url = new URL(req.url)
  const requestId =
    getRequestHeader(req, 'x-request-id') ||
    getRequestHeader(req, 'x-vercel-id') ||
    crypto.randomUUID()
  return {
    requestId,
    method: req.method,
    path: url.pathname,
    ip: getIp(req),
    userAgent: getRequestHeader(req, 'user-agent') || 'unknown',
  }
}

export function apiLog(
  level: LogLevel,
  event: string,
  ctx: ApiContext,
  meta?: Record<string, unknown>
) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    requestId: ctx.requestId,
    method: ctx.method,
    path: ctx.path,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    ...meta,
  }
  const line = JSON.stringify(payload)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.info(line)
  }
}

/**
 * Integración opcional con Sentry sin acoplar el build:
 * si @sentry/nextjs no está instalado, se ignora silenciosamente.
 */
export async function reportServerError(
  error: unknown,
  ctx: ApiContext,
  meta?: Record<string, unknown>
) {
  if (!process.env.SENTRY_DSN) return
  try {
    const dynamicImport = new Function('m', 'return import(m)') as (
      moduleName: string
    ) => Promise<unknown>
    const sentry = (await dynamicImport('@sentry/nextjs')) as {
      captureException: (err: unknown, context?: Record<string, unknown>) => void
    }
    sentry.captureException(error, {
      tags: {
        route: ctx.path,
        method: ctx.method,
      },
      extra: {
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        ...(meta ?? {}),
      },
    })
  } catch {
    // Dependencia opcional no instalada o fallo no crítico.
  }
}

export function checkRateLimit(req: Request, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const ctx = createApiContext(req)
  const bucketKey = `${options.bucket}:${ctx.ip}`
  const buckets = getRateBuckets()
  const current = buckets.get(bucketKey)
  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs })
    return {
      ok: true,
      remaining: Math.max(0, options.limit - 1),
      retryAfterSec: Math.ceil(options.windowMs / 1000),
    }
  }
  if (current.count >= options.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    return { ok: false, remaining: 0, retryAfterSec }
  }
  current.count += 1
  buckets.set(bucketKey, current)
  return {
    ok: true,
    remaining: Math.max(0, options.limit - current.count),
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  }
}

export function errorJson(
  ctx: ApiContext,
  status: number,
  error: string,
  code?: string,
  details?: Record<string, unknown>,
  headers?: HeadersInit
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      code: code ?? 'api_error',
      requestId: ctx.requestId,
      ...(details ? { details } : {}),
    },
    { status, headers }
  )
}

export function successJson<T>(
  ctx: ApiContext,
  payload: T,
  status = 200,
  headers?: HeadersInit
) {
  return NextResponse.json(
    {
      ok: true,
      requestId: ctx.requestId,
      ...payload,
    },
    { status, headers }
  )
}
