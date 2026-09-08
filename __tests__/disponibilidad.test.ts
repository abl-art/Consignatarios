import { describe, it, expect } from 'vitest'
import { descontarPendientes } from '@/lib/disponibilidad'

describe('descontarPendientes', () => {
  it('resta pendientes GO y Andreani por model_code y agrupa por nombre', () => {
    const res = descontarPendientes(
      [
        { model_code: 'MC-A', model_name: 'Moto G06', qty: 20 },
        { model_code: 'MC-B', model_name: 'Galaxy A17', qty: 10 },
      ],
      { gocuotas: { 'MC-A': 3 }, andreani: { 'MC-A': 2, 'MC-B': 1 } },
    )
    expect(res).toEqual([
      { model_name: 'Moto G06', qty: 15 },
      { model_name: 'Galaxy A17', qty: 9 },
    ])
  })

  it('no baja de cero aunque los pendientes superen el stock', () => {
    const res = descontarPendientes(
      [{ model_code: 'MC-A', model_name: 'Moto G06', qty: 2 }],
      { gocuotas: { 'MC-A': 5 }, andreani: {} },
    )
    expect(res).toEqual([{ model_name: 'Moto G06', qty: 0 }])
  })

  it('sin pendientes el stock queda igual', () => {
    const res = descontarPendientes(
      [{ model_code: 'MC-A', model_name: 'Moto G06', qty: 7 }],
      { gocuotas: {}, andreani: {} },
    )
    expect(res).toEqual([{ model_name: 'Moto G06', qty: 7 }])
  })

  it('dos model_codes con el mismo nombre suman su neto en una sola fila', () => {
    const res = descontarPendientes(
      [
        { model_code: 'MC-A1', model_name: 'Moto G06', qty: 10 },
        { model_code: 'MC-A2', model_name: 'Moto G06', qty: 5 },
      ],
      { gocuotas: { 'MC-A1': 4 }, andreani: { 'MC-A2': 1 } },
    )
    expect(res).toEqual([{ model_name: 'Moto G06', qty: 10 }])
  })
})
