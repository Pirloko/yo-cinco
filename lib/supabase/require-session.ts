import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { createClient as createServerClient } from '@/lib/supabase/server'

export type RequireSessionResult =
  | { ok: true; userId: string; accessToken: string }
  | { ok: false; error: string }

/**
 * Sesión válida (cookies SSR o Bearer). Sin exigir rol admin.
 */
export async function requireSession(req: Request): Promise<RequireSessionResult> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = authHeader.slice(7).trim()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      return { ok: false, error: 'Servidor sin configuración Supabase' }
    }
    const supabase = createSupabaseClient(url, key)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(jwt)
    if (error || !user) return { ok: false, error: 'No autenticado' }
    return { ok: true, userId: user.id, accessToken: jwt }
  }

  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token || !session.user) {
    return { ok: false, error: 'No autenticado' }
  }
  return { ok: true, userId: session.user.id, accessToken: session.access_token }
}

export function createSupabaseWithUserJwt(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase URL o anon key no configurados')
  }
  return createSupabaseClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}
