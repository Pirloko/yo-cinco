import { toast } from 'sonner'
import type { User } from '@/lib/types'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import { TEAM_USER_MAX_MEMBERSHIPS } from '@/lib/team-roster'
import { computeAgeFromBirthDate } from '@/lib/age-birthday'

export function isTeamLimitReached(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: unknown }
  return typeof e.message === 'string' && e.message.includes('team_limit_reached')
}

export function toastTeamLimitReached() {
  toast.error(
    `Llegaste al máximo de ${TEAM_USER_MAX_MEMBERSHIPS} equipos en los que puedes participar.`
  )
}

export function getAuthUserEmail(u: SupabaseAuthUser): string | undefined {
  if (u.email) return u.email
  const meta = u.user_metadata
  if (meta && typeof meta.email === 'string') return meta.email
  return undefined
}

export function isUserReadOnly(u: User | null): { readonly: boolean; reason: string } {
  if (!u) return { readonly: false, reason: '' }
  if (u.modBannedAt) return { readonly: true, reason: 'Cuenta baneada.' }
  if (u.modSuspendedUntil && u.modSuspendedUntil.getTime() > Date.now()) {
    return { readonly: true, reason: 'Cuenta suspendida temporalmente.' }
  }
  return { readonly: false, reason: '' }
}

export function toastReadOnly(reason?: string) {
  toast.error(
    reason?.trim() || 'Tu cuenta esta restringida y solo puedes visualizar contenido.'
  )
}

export function effectivePlayerAge(u: User): number {
  if (u.birthDate) return computeAgeFromBirthDate(u.birthDate)
  return u.age
}

export function needsOnboardingProfile(u: User): boolean {
  if (u.accountType !== 'player') return false
  const age = effectivePlayerAge(u)
  const demoIncomplete = u.name.trim().length < 2 || age < 17
  const essentialsMissing = !u.playerEssentialsCompletedAt
  return demoIncomplete || essentialsMissing
}
