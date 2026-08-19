import { describe, it, expect } from 'vitest'
import {
  velocidadVenta,
  diasCobertura,
  rotacionMensual,
  mesesDeStock,
  stockSinMovimiento,
  normalizarModelo,
  coberturaPorModelos,
  ventasPorCobertura,
  modelosAComprar,
  type VentaDia,
} from '@/lib/inventario-indicadores'

const HOY = '2026-08-19'

function venta(fecha: string, cantidad: number, monto = 0): VentaDia {
  return { fecha, cantidad, monto }
}

describe('velocidadVenta', () => {
  it('promedia unidades por día sobre 7 y 30 días cerrados (sin hoy)', () => {
    const ventas = [
      venta('2026-08-19', 99), // hoy: se excluye
      venta('2026-08-18', 7),
      venta('2026-08-12', 7), // justo dentro de los 7 días cerrados
      venta('2026-08-11', 30), // fuera de 7d, dentro de 30d
      venta('2026-07-20', 30), // justo dentro de los 30 días cerrados
      venta('2026-07-19', 99), // fuera de 30d
    ]
    const v = velocidadVenta(ventas, HOY)
    expect(v.diaria7).toBe(2) // (7+7)/7
    expect(v.diaria30).toBe((7 + 7 + 30 + 30) / 30)
  })

  it('sin ventas devuelve cero', () => {
    const v = velocidadVenta([], HOY)
    expect(v.diaria7).toBe(0)
    expect(v.diaria30).toBe(0)
  })
})

describe('diasCobertura', () => {
  it('stock dividido velocidad diaria', () => {
    expect(diasCobertura(120, 4)).toBe(30)
  })

  it('sin velocidad de venta no hay cobertura calculable', () => {
    expect(diasCobertura(120, 0)).toBeNull()
  })

  it('sin stock la cobertura es cero aunque haya ventas', () => {
    expect(diasCobertura(0, 4)).toBe(0)
  })
})

describe('rotacionMensual', () => {
  it('ventas 30d sobre stock promedio entre cierre anterior y stock actual', () => {
    // vendió 60, stock pasó de 100 a 40 → promedio 70
    expect(rotacionMensual(60, 40, 100)).toBeCloseTo(60 / 70)
  })

  it('sin cierre anterior usa el stock actual como promedio', () => {
    expect(rotacionMensual(50, 100, null)).toBe(0.5)
  })

  it('sin stock promedio devuelve null', () => {
    expect(rotacionMensual(10, 0, 0)).toBeNull()
    expect(rotacionMensual(0, 0, null)).toBeNull()
  })
})

describe('mesesDeStock', () => {
  it('valoriza todo el stock contra la venta mensual valorizada (ponderación implícita)', () => {
    const productos = [
      { valorVenta: 900, montoVentas30d: 300 },
      { valorVenta: 100, montoVentas30d: 100 },
    ]
    // 1000 de stock / 400 vendidos por mes = 2.5 meses
    expect(mesesDeStock(productos)).toBe(2.5)
  })

  it('un producto sin ventas (ej. kits gratis) suma stock pero no venta', () => {
    const productos = [
      { valorVenta: 800, montoVentas30d: 400 },
      { valorVenta: 200, montoVentas30d: 0 },
    ]
    expect(mesesDeStock(productos)).toBe(2.5)
  })

  it('sin ventas en ningún producto devuelve null', () => {
    expect(mesesDeStock([{ valorVenta: 100, montoVentas30d: 0 }])).toBeNull()
    expect(mesesDeStock([])).toBeNull()
  })
})

describe('normalizarModelo', () => {
  it('unifica las variantes reales de escritura de un mismo modelo', () => {
    // catálogo vs ventas: prefijo Celular, RAM "4/", espacio antes de GB
    expect(normalizarModelo('Celular Samsung Galaxy A07 4/128 GB')).toBe(normalizarModelo('Samsung Galaxy A07 128GB'))
    // orden de tokens distinto (5G al medio vs al final)
    expect(normalizarModelo('Motorola Moto G77 8/256GB 5G')).toBe(normalizarModelo('Motorola Moto G77 5G 256GB'))
    // sufijo de bundle
    expect(normalizarModelo('Motorola Moto G06 64GB + KIT de Seguridad GRATIS!')).toBe(normalizarModelo('Moto G06 Motorola 64gb'))
  })

  it('no confunde modelos distintos', () => {
    expect(normalizarModelo('Moto G06 64GB')).not.toBe(normalizarModelo('Moto G06 128GB'))
    expect(normalizarModelo('Samsung Galaxy A07 128GB')).not.toBe(normalizarModelo('Samsung Galaxy A17 128GB'))
  })
})

describe('coberturaPorModelos', () => {
  const stock = [
    { modelo: 'Samsung Galaxy A07 4/128 GB', qty: 300 },
    { modelo: 'Motorola Moto G06 64GB', qty: 30 },
    { modelo: 'Moto G86 5G - 256GB/8GB', qty: 19 },
  ]
  const ventas30 = [
    { modelo: 'Samsung Galaxy A07 128GB', ventas: 150 }, // variante de escritura
    { modelo: 'Celular Motorola Moto G06 64GB + KIT de Seguridad GRATIS!', ventas: 60 },
    { modelo: 'Xiaomi Redmi 14C 128GB', ventas: 30 }, // vende pero sin stock
  ]

  it('cruza stock y ventas por modelo normalizado y calcula cobertura', () => {
    const res = coberturaPorModelos(stock, ventas30)
    const a07 = res.find(r => r.modelo === 'Samsung Galaxy A07 4/128 GB')!
    expect(a07.ventaDiaria30).toBe(5) // 150/30
    expect(a07.cobertura).toBe(60) // 300/5
    const g06 = res.find(r => r.modelo === 'Motorola Moto G06 64GB')!
    expect(g06.cobertura).toBe(15) // 30/2
  })

  it('modelo que vende sin stock aparece con cobertura 0 (urgente)', () => {
    const res = coberturaPorModelos(stock, ventas30)
    const redmi = res.find(r => r.modelo === 'Xiaomi Redmi 14C 128GB')!
    expect(redmi.stock).toBe(0)
    expect(redmi.cobertura).toBe(0)
  })

  it('calcula el % de las ventas 30d que representa cada modelo', () => {
    // total ventas = 150 + 60 + 30 = 240
    const res = coberturaPorModelos(stock, ventas30)
    expect(res.find(r => r.modelo === 'Samsung Galaxy A07 4/128 GB')!.pctVentas30).toBeCloseTo(62.5)
    expect(res.find(r => r.modelo === 'Motorola Moto G06 64GB')!.pctVentas30).toBeCloseTo(25)
    expect(res.find(r => r.modelo === 'Xiaomi Redmi 14C 128GB')!.pctVentas30).toBeCloseTo(12.5)
    expect(res.find(r => r.modelo === 'Moto G86 5G - 256GB/8GB')!.pctVentas30).toBe(0)
  })

  it('sin ventas totales el % es null', () => {
    const res = coberturaPorModelos(stock, [])
    expect(res[0].pctVentas30).toBeNull()
  })

  it('ordena por cobertura ascendente (lo urgente primero), sin ventas al final', () => {
    const res = coberturaPorModelos(stock, ventas30)
    expect(res[0].modelo).toBe('Xiaomi Redmi 14C 128GB') // cobertura 0
    expect(res[1].modelo).toBe('Motorola Moto G06 64GB') // 15
    expect(res[2].modelo).toBe('Samsung Galaxy A07 4/128 GB') // 60
    expect(res[3].modelo).toBe('Moto G86 5G - 256GB/8GB') // sin ventas → null, último
    expect(res[3].cobertura).toBeNull()
  })
})

describe('ventasPorCobertura', () => {
  it('separa la venta respaldada (+20d) de la venta en riesgo (<5d)', () => {
    const modelos = [
      { ventaDiaria30: 6, cobertura: 60 },   // saludable
      { ventaDiaria30: 3, cobertura: 2 },    // riesgo
      { ventaDiaria30: 1, cobertura: 0 },    // riesgo (stock 0)
      { ventaDiaria30: 2, cobertura: 12 },   // ni una ni otra
      { ventaDiaria30: 0, cobertura: null }, // sin ventas: no aporta
    ]
    const r = ventasPorCobertura(modelos)
    expect(r.pctSaludable).toBeCloseTo(50) // 6/12
    expect(r.pctRiesgo).toBeCloseTo((4 / 12) * 100)
  })

  it('el borde exacto no cuenta: 20d no es saludable, 5d no es riesgo', () => {
    const r = ventasPorCobertura([
      { ventaDiaria30: 1, cobertura: 20 },
      { ventaDiaria30: 1, cobertura: 5 },
    ])
    expect(r.pctSaludable).toBe(0)
    expect(r.pctRiesgo).toBe(0)
  })

  it('sin ventas devuelve null', () => {
    expect(ventasPorCobertura([{ ventaDiaria30: 0, cobertura: 10 }])).toEqual({ pctSaludable: null, pctRiesgo: null })
    expect(ventasPorCobertura([])).toEqual({ pctSaludable: null, pctRiesgo: null })
  })
})

describe('modelosAComprar', () => {
  const modelos = [
    { modelo: 'A', stock: 0, ventaDiaria30: 30, cobertura: 0 },      // riesgo, 30%
    { modelo: 'B', stock: 10, ventaDiaria30: 5, cobertura: 2 },      // riesgo, 5%
    { modelo: 'C', stock: 2, ventaDiaria30: 3, cobertura: 0.7 },     // riesgo pero 3% → afuera
    { modelo: 'D', stock: 500, ventaDiaria30: 60, cobertura: 8.3 },  // 60% pero sin riesgo
    { modelo: 'E', stock: 50, ventaDiaria30: 2, cobertura: 25 },     // sano
  ]

  it('lista solo los modelos en riesgo (<5d) con peso mayor al umbral, ordenados por peso', () => {
    const res = modelosAComprar(modelos)
    expect(res.map(m => m.modelo)).toEqual(['A', 'B'])
    expect(res[0].pctVentasTotal).toBeCloseTo(30)
    expect(res[1].pctVentasTotal).toBeCloseTo(5)
  })

  it('sin ventas totales devuelve vacío', () => {
    expect(modelosAComprar([{ modelo: 'X', stock: 5, ventaDiaria30: 0, cobertura: null }])).toEqual([])
  })
})

describe('stockSinMovimiento', () => {
  const stock = [
    { modelo: 'Motorola Moto G06 4/128GB', qty: 10, valorUnit: 100 },
    { modelo: 'Samsung Galaxy A17 4/128GB', qty: 5, valorUnit: 300 },
    { modelo: 'Nubia V70 6/256GB', qty: 0, valorUnit: 300 },
  ]

  it('lista modelos con stock y cero ventas en el período, con capital inmovilizado', () => {
    const ventas = [{ modelo: 'Celular Motorola Moto G06 4/128GB + Funda y Vidrio', ventas: 3 }]
    const res = stockSinMovimiento(stock, ventas)
    expect(res).toEqual([{ modelo: 'Samsung Galaxy A17 4/128GB', qty: 5, capital: 1500 }])
  })

  it('modelos sin stock no aparecen aunque no vendan', () => {
    const res = stockSinMovimiento(stock, [])
    expect(res.map(r => r.modelo)).not.toContain('Nubia V70 6/256GB')
    expect(res).toHaveLength(2)
  })

  it('ordena por capital inmovilizado descendente', () => {
    const res = stockSinMovimiento(stock, [])
    expect(res[0].modelo).toBe('Samsung Galaxy A17 4/128GB') // 5×300=1500 > 10×100=1000
    expect(res.reduce((s, r) => s + r.capital, 0)).toBe(2500)
  })
})
