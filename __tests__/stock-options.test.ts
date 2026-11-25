import { describe, it, expect } from 'vitest'
import {
  aniosCompletos, fraccionDevengada, calcularPaquete, filasPorAnio,
  proximoHito, esquemaParejo, validarEsquema,
} from '@/lib/stock-options'

// Esquema NO uniforme de 4 anios: 10/20/30/40, cliff 1
const grant = {
  fechaOtorgamiento: '2025-01-15',
  sueldoMensualUsd: 2000,
  multiplo: 12,
  valuacionIngresoUsd: 10_000_000,
  cliffAnios: 1,
  periodoAnios: 4,
  esquema: [
    { anio: 1, pct: 10 },
    { anio: 2, pct: 20 },
    { anio: 3, pct: 30 },
    { anio: 4, pct: 40 },
  ],
}

describe('aniosCompletos', () => {
  it('cuenta anios completos desde el otorgamiento', () => {
    expect(aniosCompletos('2025-01-15', new Date('2026-01-15'))).toBe(1)
    expect(aniosCompletos('2025-01-15', new Date('2026-01-14'))).toBe(0)
    expect(aniosCompletos('2025-01-15', new Date('2028-06-01'))).toBe(3)
  })
  it('fecha futura: 0', () => {
    expect(aniosCompletos('2026-01-01', new Date('2025-06-01'))).toBe(0)
  })
})

describe('fraccionDevengada (esquema personalizado)', () => {
  it('antes del cliff no devenga nada', () => {
    expect(fraccionDevengada(grant, new Date('2025-12-15'))).toBe(0)
  })
  it('al cumplir el anio 1 devenga el 10% del esquema', () => {
    expect(fraccionDevengada(grant, new Date('2026-01-15'))).toBeCloseTo(0.1)
  })
  it('entre aniversarios no suma (devengamiento anual)', () => {
    expect(fraccionDevengada(grant, new Date('2026-11-01'))).toBeCloseTo(0.1)
  })
  it('acumula lo del esquema anio a anio (no uniforme)', () => {
    expect(fraccionDevengada(grant, new Date('2027-01-15'))).toBeCloseTo(0.3) // 10+20
    expect(fraccionDevengada(grant, new Date('2028-01-15'))).toBeCloseTo(0.6) // +30
    expect(fraccionDevengada(grant, new Date('2029-01-15'))).toBe(1)
  })
  it('cliff 2: los anios 1 y 2 se cobran juntos al cumplirse el cliff', () => {
    const g = { ...grant, cliffAnios: 2 }
    expect(fraccionDevengada(g, new Date('2026-06-01'))).toBe(0) // 1 anio cumplido < cliff
    expect(fraccionDevengada(g, new Date('2027-01-15'))).toBeCloseTo(0.3) // 10+20 de golpe
  })
  it('despues del periodo queda clavado en 1', () => {
    expect(fraccionDevengada(grant, new Date('2035-01-01'))).toBe(1)
  })
})

describe('calcularPaquete (cobra la diferencia)', () => {
  it('valores con valuacion actual 1.5x', () => {
    const r = calcularPaquete(grant, 15_000_000, new Date('2027-01-15'))
    expect(r.base).toBe(24000)
    expect(r.valorActualPaquete).toBeCloseTo(36000)
    expect(r.diferenciaTotal).toBeCloseTo(12000)
    expect(r.fraccionDevengada).toBeCloseTo(0.3)
    expect(r.diferenciaDevengada).toBeCloseTo(3600)
  })
  it('valuacion que no subio: diferencia 0', () => {
    const r = calcularPaquete(grant, 9_000_000, new Date('2029-01-15'))
    expect(r.diferenciaTotal).toBe(0)
    expect(r.diferenciaDevengada).toBe(0)
  })
  it('sin valuacion actual: solo estructural', () => {
    const r = calcularPaquete(grant, null, new Date('2027-01-15'))
    expect(r.diferenciaTotal).toBeNull()
    expect(r.fraccionDevengada).toBeCloseTo(0.3)
  })
})

describe('filasPorAnio (tabla del panel)', () => {
  it('arma una fila por anio con pct, acumulado, % empresa y ganancia', () => {
    const filas = filasPorAnio(grant, 15_000_000, new Date('2027-06-01'))
    expect(filas).toHaveLength(4)
    expect(filas[0]).toMatchObject({ anio: 1, fecha: '2026-01-15', pct: 10, pctAcumulado: 10, cumplido: true, preCliff: false })
    expect(filas[0].ganaEnElAnio).toBeCloseTo(1200) // 12000 x 10%
    expect(filas[0].fraccionEmpresaAcum).toBeCloseTo(0.0024 * 0.1)
    expect(filas[3]).toMatchObject({ anio: 4, pctAcumulado: 100, cumplido: false })
    expect(filas[3].acumuladoCobrable).toBeCloseTo(12000)
  })
  it('anios pre-cliff: cobrable 0 y marcados', () => {
    const g = { ...grant, cliffAnios: 2 }
    const filas = filasPorAnio(g, 15_000_000, new Date('2025-06-01'))
    expect(filas[0].preCliff).toBe(true)
    expect(filas[0].acumuladoCobrable).toBe(0)
    expect(filas[1].preCliff).toBe(false)
    expect(filas[1].acumuladoCobrable).toBeCloseTo(12000 * 0.3)
  })
})

describe('proximoHito', () => {
  it('antes del cliff apunta al primer aniversario cobrable', () => {
    const g = { ...grant, cliffAnios: 2 }
    const h = proximoHito(g, new Date('2025-06-01'))
    expect(h).toEqual({ fecha: '2027-01-15', fraccion: 0.3 })
  })
  it('entre anios apunta al proximo aniversario', () => {
    const h = proximoHito(grant, new Date('2026-06-01'))
    expect(h).toEqual({ fecha: '2027-01-15', fraccion: 0.3 })
  })
  it('un anio con 0% no es hito: salta al siguiente con devengo', () => {
    const g = { ...grant, esquema: [
      { anio: 1, pct: 10 }, { anio: 2, pct: 0 }, { anio: 3, pct: 50 }, { anio: 4, pct: 40 },
    ] }
    const h = proximoHito(g, new Date('2026-06-01'))
    expect(h).toEqual({ fecha: '2028-01-15', fraccion: 0.6 })
  })
  it('periodo completo: sin hito', () => {
    expect(proximoHito(grant, new Date('2029-02-01'))).toBeNull()
  })
})

describe('esquemaParejo y validarEsquema', () => {
  it('parejo suma exactamente 100 (10 anios)', () => {
    const e = esquemaParejo(10)
    expect(e).toHaveLength(10)
    expect(e.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 10)
  })
  it('parejo con 3 anios ajusta el ultimo', () => {
    const e = esquemaParejo(3)
    expect(e.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 10)
  })
  it('valida suma 100 y anios completos', () => {
    expect(validarEsquema(grant.esquema, 4)).toBeNull()
    expect(validarEsquema(grant.esquema, 5)).toMatch(/5 anios/)
    expect(validarEsquema([{ anio: 1, pct: 60 }, { anio: 2, pct: 60 }], 2)).toMatch(/suman/)
    expect(validarEsquema([{ anio: 1, pct: -5 }, { anio: 2, pct: 105 }], 2)).toMatch(/invalido/)
  })
})
