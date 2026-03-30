import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Admin en rutas API: cookies (SSR) o Authorization: Bearer (cliente SPA con sesión en localStorage).
 */
export async function requireAdmin(req: Request): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
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
    // Sin este header, PostgREST usa rol `anon` y RLS no devuelve `profiles` (solo `authenticated`).
    const supabaseAsUser = createSupabaseClient(url, key, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: profile } = await supabaseAsUser
      .from('profiles')
      .select('account_type')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile || profile.account_type !== 'admin') {
      return { ok: false, error: 'No autorizado' }
    }
    return { ok: true, userId: user.id }
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.account_type !== 'admin') {
    return { ok: false, error: 'No autorizado' }
  }
  return { ok: true, userId: user.id }
}
