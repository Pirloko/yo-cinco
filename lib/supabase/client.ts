import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.length &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length
  )
}

/**
 * Cliente de navegador para SPA:
 * - Persistimos sesión en localStorage para que sobreviva a F5 incluso si en
 *   deploy el middleware/cookies tiene algún desajuste.
 * - Mantenemos auto-refresh del token y detección estándar de callback auth.
 */
export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local'
    )
  }
  return createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'pichanga-auth',
    },
  })
}
