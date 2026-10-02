import { describe, expect, it } from 'vitest'
import {
  agruparMarcas,
  armarEscenarios,
  armarRankingConPlan,
  calcularShare,
  modeloComercialSamsung,
  normalizarMarca,
  shareSamsung,
} from '@/lib/partner-samsung'

describe('marcas para el share por venta', () => {
  it('normaliza variantes de Samsung y respeta el resto', () => {
    expect(normalizarMarca('Samsung')).toBe('Samsung')
    expect(normalizarMarca('Samsung Korea')).toBe('Samsung')
    expect(normalizarMarca('samsung')).toBe('Samsung')
    expect(normalizarMarca(' Motorola ')).toBe('Motorola')
    expect(normalizarMarca(null)).toBeNull()
    expect(normalizarMarca('  ')).toBeNull()
  })

  it('agrupa variantes, descarta sin marca y ordena por ventas', () => {
    const out = agruparMarcas([
      { marca: 'Motorola', ventas: 10 },
      { marca: 'Samsung', ventas: 4 },
      { marca: 'Samsung Korea', ventas: 3 },
      { marca: null, ventas: 99 },
    ])
    expect(out).toEqual([
      { marca: 'Motorola', ventas: 10 },
      { marca: 'Samsung', ventas: 7 },
    ])
  })

  it('share de Samsung sobre el total de marcas', () => {
    expect(shareSamsung([
      { marca: 'Motorola', ventas: 80 },
      { marca: 'Samsung', ventas: 20 },
    ])).toBeCloseTo(0.2)
    expect(shareSamsung([])).toBe(0)
  })
})

describe('modeloComercialSamsung', () => {
  it('unifica las variantes libres de devices.model', () => {
    expect(modeloComercialSamsung('Galaxy A16')).toBe('Galaxy A16')
    expect(modeloComercialSamsung('Samsung Galaxy A16 4/128GB')).toBe('Galaxy A16')
    expect(modeloComercialSamsung('Celular Samsung Galaxy A07 4/64 GB')).toBe('Galaxy A07')
    expect(modeloComercialSamsung('Samsung Galaxy A17 5G 8/256GB')).toBe('Galaxy A17 5G')
    expect(modeloComercialSamsung('Galaxy A17')).toBe('Galaxy A17')
    expect(modeloComercialSamsung('Galaxy A37 5G')).toBe('Galaxy A37 5G')
    expect(modeloComercialSamsung(null)).toBe('Otro')
  })
})

describe('escenarios y ranking', () => {
  const meses = [
    { mes: '2026-10', hibrido: 1000, gocuotas: 800 },
    { mes: '2026-11', hibrido: 1200, gocuotas: 900 },
  ]

  it('aplica cada share a ambos métodos', () => {
    const esc = armarEscenarios(meses, 0.2, 0.3)
    expect(esc[0]).toEqual({ mes: '2026-10', fijoHibrido: 200, fijoGocuotas: 160, actualHibrido: 300, actualGocuotas: 240 })
    expect(esc[1].actualHibrido).toBe(360)
  })

  it('share con división protegida', () => {
    expect(calcularShare(19, 100)).toBeCloseTo(0.19)
    expect(calcularShare(5, 0)).toBe(0)
  })

  it('ranking ordena por unidades y reparte el plan mensual por mix', () => {
    const esc = armarEscenarios(meses, 0.2, 0.3) // actual: 300+360 hib, 240+270 goc → prom 330 / 255
    const ranking = armarRankingConPlan(
      [
        { modelo: 'Galaxy A07', unidades: 250 },
        { modelo: 'Galaxy A16', unidades: 750 },
      ],
      esc
    )
    expect(ranking[0].modelo).toBe('Galaxy A16')
    expect(ranking[0].mix).toBeCloseTo(0.75)
    expect(ranking[0].planMensualHibrido).toBe(Math.round(330 * 0.75))
    expect(ranking[1].planMensualGocuotas).toBe(Math.round(255 * 0.25))
  })
})
