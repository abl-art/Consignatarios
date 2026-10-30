import { describe, it, expect } from 'vitest'
import { armarLiberaciones } from '@/lib/lineas-proveedor'

describe('armarLiberaciones', () => {
  it('agrupa cheques por fecha y acumula el disponible', () => {
    const res = armarLiberaciones(1000, [
      { importe: 200, fecha_pago: '2026-11-05' },
      { importe: 300, fecha_pago: '2026-11-05' },
      { importe: 100, fecha_pago: '2026-11-10' },
    ])
    expect(res).toEqual([
      { fecha: '2026-11-05', liberado: 500, acumulado: 1500 },
      { fecha: '2026-11-10', liberado: 100, acumulado: 1600 },
    ])
  })

  it('ordena por fecha aunque los cheques vengan desordenados', () => {
    const res = armarLiberaciones(0, [
      { importe: 50, fecha_pago: '2026-12-01' },
      { importe: 30, fecha_pago: '2026-11-20' },
    ])
    expect(res.map(r => r.fecha)).toEqual(['2026-11-20', '2026-12-01'])
    expect(res[1].acumulado).toBe(80)
  })

  it('arranca del disponible aunque sea negativo (línea sobregirada)', () => {
    const res = armarLiberaciones(-200, [{ importe: 150, fecha_pago: '2026-11-03' }])
    expect(res[0].acumulado).toBe(-50)
  })

  it('sin cheques devuelve lista vacía', () => {
    expect(armarLiberaciones(500, [])).toEqual([])
  })
})
