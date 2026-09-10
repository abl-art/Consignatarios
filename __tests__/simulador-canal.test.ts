import { describe, it, expect } from 'vitest'
import { incobrabilidadResuelta, derivarMoraDias, type CohorteVintage } from '@/lib/simulador-canal'

const cohorte = (over: Partial<CohorteVintage>): CohorteVintage => ({
  origination_month: '2026-01', amt_total: 0, amt_incobrable_120_plus: 0,
  amt_cobrada_en_termino: 0, amt_recupero_1_29: 0, amt_recupero_30_59: 0,
  amt_recupero_60_89: 0, amt_recupero_90_119: 0, amt_recupero_120_plus: 0, ...over,
})

describe('incobrabilidadResuelta', () => {
  it('CB castiga la orden completa; transición solo lo no cobrado; base = resueltas + castigadas', () => {
    // num = 8 + 100 + 60 = 168; den = 800 + 100 + 100 = 1000 → 16,8%
    expect(incobrabilidadResuelta({
      resueltas: 800, mora120: 8, cbTotal: 100, transTotal: 100, transNoCobrado: 60,
    })).toBeCloseTo(16.8, 5)
  })
  it('sin contracargos ni transición queda la mora 120+ pura sobre resueltas', () => {
    expect(incobrabilidadResuelta({
      resueltas: 500, mora120: 5, cbTotal: 0, transTotal: 0, transNoCobrado: 0,
    })).toBeCloseTo(1, 5)
  })
  it('sin nada resuelto → null', () => {
    expect(incobrabilidadResuelta({
      resueltas: 0, mora120: 0, cbTotal: 0, transTotal: 0, transNoCobrado: 0,
    })).toBeNull()
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
