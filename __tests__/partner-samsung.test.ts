import { describe, expect, it } from 'vitest'
import {
  agruparMarcas,
  armarEscenarios,
  calcularShare,
  filtrarStockSamsung,
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

describe('filtrarStockSamsung — stock del link partner', () => {
  const fila = (over: Partial<import('@/lib/disponibilidad').StockDisponibilidadRow>) => ({
    sku: 'SKU1', nombre: 'Samsung A06 4/64', whAndreani: 0, whGocuotas: 0,
    enTransito: 0, enTransitoDesde: null, total: 0, tipo: 'celular' as const,
    marca: 'Samsung', pendGocuotas: 0, pendAndreani: 0, disponibleReal: 0,
    pedido: 0, proximaDisponibilidad: 0, ...over,
  })

  it('deja solo celulares Samsung (variantes de marca incluidas) y descarta el resto', () => {
    const out = filtrarStockSamsung([
      fila({ sku: 'A', marca: 'Samsung', disponibleReal: 5 }),
      fila({ sku: 'B', marca: 'Samsung Korea', disponibleReal: 3 }),
      fila({ sku: 'C', marca: 'Motorola', disponibleReal: 9 }),
      fila({ sku: 'D', marca: 'Samsung', tipo: 'accesorio', disponibleReal: 9 }),
      fila({ sku: 'E', marca: null, disponibleReal: 9 }),
    ])
    expect(out.map((r: { sku: string }) => r.sku)).toEqual(['A', 'B'])
  })

  it('mapea disponibleReal a disponible y conserva transito, pedido y proxima', () => {
    const out = filtrarStockSamsung([
      fila({ sku: 'A', nombre: 'Samsung S24', disponibleReal: 7, enTransito: 2, pedido: 10, proximaDisponibilidad: 19 }),
    ])
    expect(out).toEqual([
      { sku: 'A', nombre: 'Samsung S24', disponible: 7, enTransito: 2, pedido: 10, proximaDisponibilidad: 19 },
    ])
  })

  it('ordena por disponible descendente y desempata por nombre', () => {
    const out = filtrarStockSamsung([
      fila({ sku: 'A', nombre: 'Samsung Z Flip', disponibleReal: 1 }),
      fila({ sku: 'B', nombre: 'Samsung A16', disponibleReal: 8 }),
      fila({ sku: 'C', nombre: 'Samsung A06', disponibleReal: 1 }),
    ])
    expect(out.map((r: { sku: string }) => r.sku)).toEqual(['B', 'C', 'A'])
  })
})
