import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  TEAM_PICK_MAX_FIELD_PER_SIDE,
  TEAM_PICK_MAX_GK_PER_SIDE,
  canEditTeamPickLineupBeforeDeadline,
  normalizeTeamPickHexColor,
  teamPickContrastForeground,
  teamPickJerseyPresetLabel,
  teamPickSideIsFull,
  teamPickSlotsFromParticipants,
  teamPickSlotsFromParticipantsExcluding,
  teamPickLineupSummary,
} from '@/lib/team-pick-ui'

describe('teamPickJerseyPresetLabel', () => {
  it('resuelve presets', () => {
    expect(teamPickJerseyPresetLabel('#dc2626')).toBe('Rojo')
    expect(teamPickJerseyPresetLabel('#FFFFFF')).toBe('Blanco')
  })
  it('devuelve hex si no es preset', () => {
    expect(teamPickJerseyPresetLabel('#16a34a')).toBe('#16A34A')
  })
})

describe('teamPickContrastForeground', () => {
  it('usa texto oscuro sobre blanco', () => {
    expect(teamPickContrastForeground('#ffffff')).toBe('#0f172a')
  })
  it('usa texto claro sobre negro', () => {
    expect(teamPickContrastForeground('#000000')).toBe('#f8fafc')
  })
})

describe('normalizeTeamPickHexColor', () => {
  it('acepta #RRGGBB minúsculas', () => {
    expect(normalizeTeamPickHexColor('#16a34a')).toBe('#16a34a')
  })
  it('rechaza formato inválido', () => {
    expect(normalizeTeamPickHexColor('#fff')).toBeNull()
    expect(normalizeTeamPickHexColor('')).toBeNull()
  })
})

describe('teamPickSlotsFromParticipants', () => {
  it('cuenta 1 GK y campo por bando', () => {
    const s = teamPickSlotsFromParticipants([
      { status: 'confirmed', pickTeam: 'A', encounterLineupRole: 'gk' },
      { status: 'confirmed', pickTeam: 'A', encounterLineupRole: 'delantero' },
      { status: 'confirmed', pickTeam: 'B', encounterLineupRole: 'gk' },
      {
        status: 'confirmed',
        pickTeam: 'B',
        encounterLineupRole: 'defensa',
      },
    ])
    expect(s.A.gk).toBe(1)
    expect(s.A.field).toBe(1)
    expect(s.B.gk).toBe(1)
    expect(s.B.field).toBe(1)
  })

  it('ignora cancelados y sin pick_team', () => {
    const s = teamPickSlotsFromParticipants([
      {
        status: 'cancelled',
        pickTeam: 'A',
        encounterLineupRole: 'gk',
      },
      { status: 'confirmed', pickTeam: null, encounterLineupRole: 'gk' },
    ])
    expect(s.A.gk).toBe(0)
    expect(s.B.gk).toBe(0)
  })
})

describe('teamPickSideIsFull', () => {
  it('requiere 1 GK y 5 campo', () => {
    expect(
      teamPickSideIsFull({
        gk: TEAM_PICK_MAX_GK_PER_SIDE,
        field: TEAM_PICK_MAX_FIELD_PER_SIDE,
      })
    ).toBe(true)
    expect(teamPickSideIsFull({ gk: 1, field: 4 })).toBe(false)
    expect(teamPickSideIsFull({ gk: 0, field: 5 })).toBe(false)
  })
})

describe('teamPickSlotsFromParticipantsExcluding', () => {
  it('excluye userId del conteo', () => {
    const rows = [
      {
        id: 'u1',
        status: 'confirmed',
        pickTeam: 'A' as const,
        encounterLineupRole: 'gk' as const,
      },
      {
        id: 'u2',
        status: 'confirmed',
        pickTeam: 'A' as const,
        encounterLineupRole: 'delantero' as const,
      },
    ]
    const withBoth = teamPickSlotsFromParticipantsExcluding(rows, null)
    const withoutU1 = teamPickSlotsFromParticipantsExcluding(rows, 'u1')
    expect(withBoth.A.gk).toBe(1)
    expect(withoutU1.A.gk).toBe(0)
    expect(withoutU1.A.field).toBe(1)
  })
})

describe('canEditTeamPickLineupBeforeDeadline', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('permite editar si faltan más de 2 h', () => {
    vi.setSystemTime(new Date('2026-06-01T10:00:00.000Z'))
    const matchAt = new Date('2026-06-01T14:00:00.000Z')
    expect(canEditTeamPickLineupBeforeDeadline(matchAt)).toBe(true)
  })

  it('no permite si ya pasó el umbral −2 h', () => {
    vi.setSystemTime(new Date('2026-06-01T13:00:00.000Z'))
    const matchAt = new Date('2026-06-01T14:00:00.000Z')
    expect(canEditTeamPickLineupBeforeDeadline(matchAt)).toBe(false)
  })
})

describe('teamPickLineupSummary', () => {
  it('arma texto equipo + rol', () => {
    expect(teamPickLineupSummary('A', 'gk')).toContain('Equipo A')
    expect(teamPickLineupSummary('B', 'delantero')).toContain('Equipo B')
  })
})
