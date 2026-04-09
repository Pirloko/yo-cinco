'use client'

import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'

/**
 * Condición estándar para `enabled` en queries que requieren usuario autenticado
 * y cliente Supabase listo (Fase 2 — evita fetches duplicados / fantasma al montar).
 */
export function sessionQueryEnabled(userId: string | null | undefined): boolean {
  return Boolean(userId && isSupabaseConfigured() && getBrowserSupabase())
}
