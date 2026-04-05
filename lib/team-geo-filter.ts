import type { Team } from '@/lib/types'

type GeoUser = {
  regionId?: string
  cityId: string
}

/**
 * ¿El equipo debe listarse para este jugador? Misma región o misma ciudad.
 * Si el jugador no tiene región pero sí ciudad: solo equipos de esa ciudad.
 * Sin geo en perfil: no se filtra (compatibilidad).
 */
export function teamIsInPlayerGeo(team: Team, user: GeoUser): boolean {
  const uid = user.cityId?.trim() ?? ''
  if (user.regionId) {
    if (team.cityRegionId === user.regionId) return true
    if (!team.cityRegionId && uid && team.cityId === user.cityId) {
      return true
    }
    return false
  }
  if (uid) {
    return team.cityId === user.cityId
  }
  return true
}
