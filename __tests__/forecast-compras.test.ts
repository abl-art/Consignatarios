import { describe, it, expect } from 'vitest'
import { forecastCompras, prorratearMesActual, type ItemVentaForecast } from '@/lib/forecast-compras'

const item = (modelo: string, ventaDiaria30: number, stock = 0): ItemVentaForecast => ({ modelo, ventaDiaria30, stock })

describe('prorratearMesActual', () => {
  it('devuelve la porción del mes que falta transcurrir', () => {
    // 26/9: quedan 4 de 30 días
    expect(prorratearMesActual(3000, '2026-09-26')).toBeCloseTo(400)
  })

  it('el día 1 devuelve el mes completo menos el día en curso', () => {
    expect(prorratearMesActual(3100, '2026-10-01')).toBeCloseTo(3000)
  })
})

describe('forecastCompras', () => {
  // Baseline: A vende 2/día (60/mes), B 1/día (30/mes) → 90 celulares/mes
  const celulares = [item('Moto A', 2, 100), item('Moto B', 1, 10)]
  const proyeccion = [
    { mes: '2026-10', unidades: 90 },
    { mes: '2026-11', unidades: 180 },
  ]

  it('la demanda por modelo escala el mix 30d con la proyección', () => {
    const f = forecastCompras(celulares, [], [], proyeccion)
    const a = f.celulares.find((x) => x.modelo === 'Moto A')!
    expect(a.demanda.map((d) => Math.round(d.unidades))).toEqual([60, 120])
    expect(a.sharePct).toBeCloseTo(66.7, 1)
    expect(f.baselineMensual).toBeCloseTo(90)
  })

  it('a comprar netea el pipeline acumulado con piso cero', () => {
    const f = forecastCompras(celulares, [], [], proyeccion)
    const a = f.celulares.find((x) => x.modelo === 'Moto A')!
    // pipeline 100 cubre oct (60) y deja 40 para nov (120) → faltan 80
    expect(a.aComprar.map((d) => Math.round(d.unidades))).toEqual([0, 80])
    expect(Math.round(a.totalAComprar)).toBe(80)
  })

  it('el pipeline suma tránsito y pedido matcheando por modelo normalizado', () => {
    const f = forecastCompras(celulares, [], [{ modelo: 'Celular Moto B', enTransito: 5, pedido: 5 }], proyeccion)
    const b = f.celulares.find((x) => x.modelo === 'Moto B')!
    expect(b.pipeline).toBe(20) // 10 stock + 5 + 5
    // demanda 30 y 60; acumulada 30, 90 → faltan 10 en oct y 60 más en nov
    expect(b.aComprar.map((d) => Math.round(d.unidades))).toEqual([10, 60])
  })

  it('los addons escalan con el baseline de celulares (attach constante)', () => {
    const addons = [item('Auriculares Buds 6', 1, 0)]
    const f = forecastCompras(celulares, addons, [], proyeccion)
    const buds = f.addons[0]
    // 30/mes con baseline 90 → nov proyecta 180 celulares = factor 2 → 60 buds
    expect(buds.demanda.map((d) => Math.round(d.unidades))).toEqual([30, 60])
  })

  it('excluye items sin ventas y ordena por share descendente', () => {
    const f = forecastCompras([...celulares, item('Viejo sin ventas', 0, 50)], [], [], proyeccion)
    expect(f.celulares.map((x) => x.modelo)).toEqual(['Moto A', 'Moto B'])
  })

  it('sin baseline de celulares devuelve grupos vacíos', () => {
    const f = forecastCompras([item('Moto A', 0, 5)], [item('Addon', 1)], [], proyeccion)
    expect(f.celulares).toEqual([])
    expect(f.addons).toEqual([])
    expect(f.baselineMensual).toBe(0)
  })
})
