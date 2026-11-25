import { describe, it, expect } from 'vitest'
import { mesesCompletos, fraccionDevengada, calcularPaquete, proximoHito } from '@/lib/stock-options'

const grant = {
  sueldoMensualUsd: 2000,
  multiplo: 12,
  valuacionIngresoUsd: 10_000_000,
  cliffMeses: 12,
  periodoMeses: 48,
  devengamiento: 'mensual' as const,
  fechaOtorgamiento: '2025-01-15',
}

describe('mesesCompletos', () => {
  it('cuenta meses completos desde el otorgamiento', () => {
    expect(mesesCompletos('2025-01-15', new Date('2025-07-15'))).toBe(6)
    expect(mesesCompletos('2025-01-15', new Date('2025-07-14'))).toBe(5)
    expect(mesesCompletos('2025-01-15', new Date('2025-01-20'))).toBe(0)
  })
  it('fecha futura: 0 meses', () => {
    expect(mesesCompletos('2026-01-01', new Date('2025-06-01'))).toBe(0)
  })
})

describe('fraccionDevengada', () => {
  it('antes del cliff no devenga nada', () => {
    expect(fraccionDevengada(grant, new Date('2025-12-15'))).toBe(0)
  })
  it('en el cliff devenga cliff/periodo de una vez', () => {
    expect(fraccionDevengada(grant, new Date('2026-01-15'))).toBeCloseTo(12 / 48)
  })
  it('despues del cliff suma mensual', () => {
    expect(fraccionDevengada(grant, new Date('2026-04-20'))).toBeCloseTo(15 / 48)
  })
  it('trimestral: solo suma al cumplir cada trimestre desde el cliff', () => {
    const g = { ...grant, devengamiento: 'trimestral' as const }
    expect(fraccionDevengada(g, new Date('2026-03-15'))).toBeCloseTo(12 / 48) // 14 meses: aun no cumplio el 1er trimestre post-cliff
    expect(fraccionDevengada(g, new Date('2026-04-15'))).toBeCloseTo(15 / 48)
  })
  it('anual: salta de a 12 meses', () => {
    const g = { ...grant, devengamiento: 'anual' as const }
    expect(fraccionDevengada(g, new Date('2026-12-15'))).toBeCloseTo(12 / 48) // 23 meses
    expect(fraccionDevengada(g, new Date('2027-01-15'))).toBeCloseTo(24 / 48) // 24 meses
  })
  it('al fin del periodo queda 100% y no pasa de 1', () => {
    expect(fraccionDevengada(grant, new Date('2029-01-15'))).toBe(1)
    expect(fraccionDevengada(grant, new Date('2035-01-01'))).toBe(1)
  })
  it('cliff 0 devenga desde el primer paso', () => {
    const g = { ...grant, cliffMeses: 0 }
    expect(fraccionDevengada(g, new Date('2025-02-15'))).toBeCloseTo(1 / 48)
  })
})

describe('calcularPaquete (opcion clasica: cobra la diferencia)', () => {
  it('paquete base, % de empresa y valor actual', () => {
    const r = calcularPaquete(grant, 15_000_000, new Date('2026-01-15'))
    expect(r.base).toBe(24000) // 2000 x 12
    expect(r.fraccionEmpresa).toBeCloseTo(24000 / 10_000_000)
    expect(r.valorActualPaquete).toBeCloseTo(36000) // 24000 x 1.5
    expect(r.diferenciaTotal).toBeCloseTo(12000)
    expect(r.fraccionDevengada).toBeCloseTo(0.25)
    expect(r.diferenciaDevengada).toBeCloseTo(3000)
  })
  it('si la valuacion no subio, la diferencia es 0 (nunca negativa)', () => {
    const r = calcularPaquete(grant, 8_000_000, new Date('2027-01-15'))
    expect(r.diferenciaTotal).toBe(0)
    expect(r.diferenciaDevengada).toBe(0)
  })
  it('sin valuacion actual devuelve solo lo estructural', () => {
    const r = calcularPaquete(grant, null, new Date('2026-01-15'))
    expect(r.base).toBe(24000)
    expect(r.valorActualPaquete).toBeNull()
    expect(r.diferenciaTotal).toBeNull()
    expect(r.diferenciaDevengada).toBeNull()
  })
})

describe('proximoHito', () => {
  it('antes del cliff, el hito es el cliff con su fraccion', () => {
    const h = proximoHito(grant, new Date('2025-06-01'))
    expect(h?.fecha).toBe('2026-01-15')
    expect(h?.fraccion).toBeCloseTo(12 / 48)
  })
  it('despues del cliff, el hito es el proximo paso', () => {
    const h = proximoHito(grant, new Date('2026-04-20'))
    expect(h?.fecha).toBe('2026-05-15')
    expect(h?.fraccion).toBeCloseTo(16 / 48)
  })
  it('vencido el periodo no hay hito', () => {
    expect(proximoHito(grant, new Date('2029-02-01'))).toBeNull()
  })
})
