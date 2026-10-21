import { describe, it, expect } from 'vitest'
import {
  armarNegocioMap,
  negocioDe,
  filtrarStockPorNegocio,
  filtrarIndicadoresPorNegocio,
} from '@/lib/negocio'

// Casos reales (oct 2026): compras_productos con plataforma 'gomarket'
// (parlantes JBL, Parlante Xiaomi) vs catálogo GOcelular donde el SKU addon
// coincide con el codigo de compras y el display_name difiere del nombre.
const COMPRAS = [
  { codigo: 'JBLGO5BLKAM', nombre: 'JBL Go 5', plataforma: 'gomarket' },
  { codigo: null, nombre: 'Parlante Xiaomi 2 Bluetooth', plataforma: 'gomarket' },
  { codigo: 'XIA-A5-128', nombre: 'Xiaomi Redmi A5 4+128GB ', plataforma: 'gocelular' },
]

describe('armarNegocioMap + negocioDe', () => {
  const mapa = armarNegocioMap(COMPRAS)

  it('matchea gomarket por SKU exacto (case-insensitive)', () => {
    expect(negocioDe('jblgo5blkam', 'JBLGO5', mapa)).toBe('gomarket')
  })

  it('matchea gomarket por nombre normalizado cuando no hay SKU', () => {
    expect(negocioDe(null, 'Parlantes Parlante Xiaomi 2 Bluetooth', mapa)).toBe('gomarket')
  })

  it('default gocelular: sin flag o sin match', () => {
    expect(negocioDe('MZB0NI5AR', 'Xiaomi Redmi A5', mapa)).toBe('gocelular')
    expect(negocioDe('SKU-DESCONOCIDO', 'Algo Nuevo', mapa)).toBe('gocelular')
  })
})

describe('filtrarStockPorNegocio', () => {
  const mapa = armarNegocioMap(COMPRAS)
  const rows = [
    { sku: 'JBLGO5BLKAM', nombre: 'JBLGO5' },
    { sku: 'MZB0NI5AR', nombre: 'Xiaomi Redmi A5' },
  ]

  it("'todos' devuelve todo", () => {
    expect(filtrarStockPorNegocio(rows, 'todos', mapa)).toHaveLength(2)
  })

  it("'gomarket' deja solo lo flaggeado y 'gocelular' el resto", () => {
    expect(filtrarStockPorNegocio(rows, 'gomarket', mapa).map(r => r.sku)).toEqual(['JBLGO5BLKAM'])
    expect(filtrarStockPorNegocio(rows, 'gocelular', mapa).map(r => r.sku)).toEqual(['MZB0NI5AR'])
  })
})

describe('filtrarIndicadoresPorNegocio', () => {
  const mapa = armarNegocioMap(COMPRAS)
  const filas = [
    {
      key: 'parlantes',
      label: 'Parlantes',
      vel7: 2,
      vel30: 1.5,
      cobertura: 20,
      rotacion: 1.1,
      modelos: [
        { modelo: 'JBL Go 5', stock: 50, ventaDiaria30: 1, cobertura: 50, pctVentas30: null },
        { modelo: 'JBL Go Essential', stock: 23, ventaDiaria30: 0.5, cobertura: 46, pctVentas30: null },
      ],
    },
    {
      key: 'celulares',
      label: 'Celulares',
      vel7: 10,
      vel30: 9,
      cobertura: 12,
      rotacion: 2,
      modelos: [{ modelo: 'Xiaomi Redmi A5', stock: 18, ventaDiaria30: 2, cobertura: 9, pctVentas30: null }],
    },
  ]

  it("'todos' devuelve las filas intactas", () => {
    expect(filtrarIndicadoresPorNegocio(filas, 'todos', mapa)).toEqual(filas)
  })

  it("'gomarket' filtra modelos, recalcula stock/vel30/cobertura y tira filas vacías", () => {
    const res = filtrarIndicadoresPorNegocio(filas, 'gomarket', mapa)
    expect(res).toHaveLength(1)
    expect(res[0].key).toBe('parlantes')
    // solo JBL Go 5 es gomarket (Essential nunca pasó por compras con flag)
    expect(res[0].modelos.map(m => m.modelo)).toEqual(['JBL Go 5'])
    expect(res[0].vel30).toBe(1)
    expect(res[0].cobertura).toBe(50)
    // vel7 y rotación no existen por modelo: quedan null y la UI muestra —
    expect(res[0].vel7).toBeNull()
    expect(res[0].rotacion).toBeNull()
  })

  it("'gocelular' conserva el resto con el mismo recálculo", () => {
    const res = filtrarIndicadoresPorNegocio(filas, 'gocelular', mapa)
    expect(res.map(f => f.key)).toEqual(['parlantes', 'celulares'])
    expect(res[0].modelos.map(m => m.modelo)).toEqual(['JBL Go Essential'])
  })
})
