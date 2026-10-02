import { describe, expect, it } from 'vitest'
import {
  agruparMarcas,
  armarEscenarios,
  calcularShare,
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

describe('escenarios', () => {
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
})
