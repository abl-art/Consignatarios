import { describe, it, expect } from 'vitest'
import { descontarPendientes, disponibleRealFila } from '@/lib/disponibilidad'
import type { StockWarehouseRow } from '@/lib/gocelular'

const fila = (over: Partial<StockWarehouseRow>): StockWarehouseRow => ({
  sku: 'SKU-1',
  nombre: 'Producto',
  whAndreani: 0,
  whGocuotas: 0,
  enTransito: 0,
  enTransitoDesde: null,
  total: 0,
  tipo: 'accesorio',
  marca: null,
  ...over,
})

describe('disponibleRealFila', () => {
  it('suma depósitos y resta pendientes GO y Andreani por sku', () => {
    const r = fila({ sku: 'KS-G06', whAndreani: 100, whGocuotas: 20 })
    expect(
      disponibleRealFila(r, { gocuotas: { 'KS-G06': 5 }, andreani: { 'KS-G06': 15 } }),
    ).toBe(100)
  })

  it('sin pendientes devuelve el stock en depósitos', () => {
    const r = fila({ whAndreani: 30, whGocuotas: 12 })
    expect(disponibleRealFila(r, { gocuotas: {}, andreani: {} })).toBe(42)
  })

  it('no baja de cero aunque los pendientes superen el stock', () => {
    const r = fila({ whAndreani: 3 })
    expect(disponibleRealFila(r, { gocuotas: { 'SKU-1': 10 }, andreani: {} })).toBe(0)
  })

  it('ignora pendientes de otros skus y lo en tránsito', () => {
    const r = fila({ whAndreani: 8, enTransito: 50 })
    expect(disponibleRealFila(r, { gocuotas: { OTRO: 4 }, andreani: {} })).toBe(8)
  })
})

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
