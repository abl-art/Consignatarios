import { describe, it, expect } from 'vitest'
import { derivarIncobrabilidad, derivarMoraDias, type CohorteVintage } from '@/lib/simulador-canal'

const cohorte = (over: Partial<CohorteVintage>): CohorteVintage => ({
  origination_month: '2026-01', amt_total: 0, amt_incobrable_120_plus: 0,
  amt_cobrada_en_termino: 0, amt_recupero_1_29: 0, amt_recupero_30_59: 0,
  amt_recupero_60_89: 0, amt_recupero_90_119: 0, amt_recupero_120_plus: 0, ...over,
})
const hoy = new Date('2026-09-10T12:00:00Z')

describe('derivarIncobrabilidad', () => {
  it('pondera cohortes maduras (≥6 meses) y excluye las verdes', () => {
    const rows = [
      cohorte({ origination_month: '2026-01', amt_total: 1000, amt_incobrable_120_plus: 40 }),
      cohorte({ origination_month: '2025-12', amt_total: 500, amt_incobrable_120_plus: 50 }),
      cohorte({ origination_month: '2026-08', amt_total: 9000, amt_incobrable_120_plus: 0 }), // verde: fuera
    ]
    expect(derivarIncobrabilidad(rows, hoy)).toBeCloseTo(6, 5) // (40+50)/1500 = 6%
  })
  it('sin cohortes maduras → null', () => {
    expect(derivarIncobrabilidad([cohorte({ origination_month: '2026-08', amt_total: 100 })], hoy)).toBeNull()
  })
})

describe('derivarMoraDias', () => {
  it('promedio ponderado por punto medio de bucket sobre lo cobrado', () => {
    const rows = [cohorte({ amt_cobrada_en_termino: 800, amt_recupero_1_29: 100, amt_recupero_30_59: 100 })]
    expect(derivarMoraDias(rows)).toBeCloseTo(6, 5) // (800×0+100×15+100×45)/1000
  })
  it('sin cobros → null', () => {
    expect(derivarMoraDias([cohorte({})])).toBeNull()
  })
})
