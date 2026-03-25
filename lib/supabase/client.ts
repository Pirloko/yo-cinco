import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.length &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length
  )
}

/**
 * Cliente de navegador: sin `cookieOptions` personalizados para que @supabase/ssr
 * use `document.cookie` con los mismos defaults que el middleware (evita desajustes
 * al refrescar). La librería ya aplica singleton en el browser.
 */
export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local'
    )
  }
  return createBrowserClient(url, key)
}
