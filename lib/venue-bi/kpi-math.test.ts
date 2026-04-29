import { describe, expect, it } from 'vitest'
import { calcAvgTicket, calcRevenueDeltaPct, calcRevPath } from '@/lib/venue-bi/kpi-math'

describe('calcRevPath', () => {
  it('calcula ingreso por hora disponible', () => {
    expect(calcRevPath(300000, 20)).toBe(15000)
  })

  it('retorna 0 cuando openHours es 0 o inválido', () => {
    expect(calcRevPath(100000, 0)).toBe(0)
    expect(calcRevPath(100000, -1)).toBe(0)
  })
})

describe('calcAvgTicket', () => {
  it('calcula ticket promedio (ingreso ÷ reservas con cobro registrado)', () => {
    expect(calcAvgTicket(220000, 11)).toBe(20000)
  })

  it('retorna 0 cuando no hay reservas que aporten al ingreso', () => {
    expect(calcAvgTicket(220000, 0)).toBe(0)
  })
})

describe('calcRevenueDeltaPct', () => {
  it('calcula variación porcentual contra periodo anterior', () => {
    expect(calcRevenueDeltaPct(1200000, 1000000)).toBe(20)
    expect(calcRevenueDeltaPct(800000, 1000000)).toBe(-20)
  })

  it('maneja periodo anterior en 0', () => {
    expect(calcRevenueDeltaPct(100000, 0)).toBe(100)
    expect(calcRevenueDeltaPct(0, 0)).toBe(0)
  })
})

