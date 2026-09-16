import { describe, it, expect } from 'vitest'
import { netoPorModelo } from '@/lib/control-stock'

const fila = (nombre: string, and: number, go: number, env = 0, medido = true) => ({
  nombre,
  and_disponible: and,
  go_andreani: go,
  go_enviados: env,
  medido,
})

describe('netoPorModelo', () => {
  it('compensa color-SKUs del mismo modelo: stock cruzado de color no es faltante', () => {
    // Caso real G06: un color con −55 y otro con +50 → neto −5
    const r = netoPorModelo(
      [fila('Moto G06', 74, 129), fila('Moto G06', 50, 0)],
      [],
    )
    expect(r).toEqual([
      { nombre: 'Moto G06', skus: 2, andDisponible: 124, goComparable: 129, dif: -5, enCola: 0, disponibleReal: 124 },
    ])
  })

  it('descuenta los enviados sin pickear del lado GO (Andreani ya los restó)', () => {
    const r = netoPorModelo([fila('Moto G17', 32, 44, 12)], [])
    expect(r[0]).toMatchObject({ goComparable: 32, dif: 0 })
  })

  it('el vendido en cola define el disponible real sin tocar la diferencia', () => {
    const r = netoPorModelo([fila('Moto G17', 40, 40)], [{ nombre: 'Moto G17', unidades: 7 }])
    expect(r[0]).toMatchObject({ dif: 0, enCola: 7, disponibleReal: 33 })
  })

  it('ignora filas sin medir y ordena por diferencia absoluta', () => {
    const r = netoPorModelo(
      [fila('A', 10, 10), fila('B', 5, 15), fila('C', 0, 99, 0, false)],
      [],
    )
    expect(r.map(m => m.nombre)).toEqual(['B', 'A'])
  })
})
