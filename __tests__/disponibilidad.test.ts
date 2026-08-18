import { describe, it, expect } from 'vitest'
import { completarDisponibilidad } from '@/lib/disponibilidad'
import type { StockWarehouseRow } from '@/lib/gocelular'

function fila(over: Partial<StockWarehouseRow> = {}): StockWarehouseRow {
  return {
    sku: 'XT2536 (g06)',
    nombre: 'Moto G06 4/128GB',
    whAndreani: 100,
    whGocuotas: 10,
    enTransito: 340,
    enTransitoDesde: null,
    total: 110,
    tipo: 'celular',
    ...over,
  }
}

describe('completarDisponibilidad', () => {
  it('aplica la fórmula: WH A + WH GO − pend GO − pend Andreani = disponible real; + tránsito = próxima', () => {
    const [r] = completarDisponibilidad([fila()], {
      gocuotas: { 'XT2536 (g06)': 5 },
      andreani: { 'XT2536 (g06)': 20 },
    })
    expect(r.pendGocuotas).toBe(5)
    expect(r.pendAndreani).toBe(20)
    expect(r.disponibleReal).toBe(85) // 100 + 10 - 5 - 20
    expect(r.proximaDisponibilidad).toBe(425) // 85 + 340
  })

  it('sin pendientes para el SKU quedan en cero y disponible = stock físico', () => {
    const [r] = completarDisponibilidad([fila()], { gocuotas: {}, andreani: {} })
    expect(r.pendGocuotas).toBe(0)
    expect(r.pendAndreani).toBe(0)
    expect(r.disponibleReal).toBe(110)
    expect(r.proximaDisponibilidad).toBe(450)
  })

  it('la sobreventa da disponible real negativo (no se recorta)', () => {
    const [r] = completarDisponibilidad([fila({ whAndreani: 1, whGocuotas: 0, enTransito: 10 })], {
      gocuotas: { 'XT2536 (g06)': 5 },
      andreani: {},
    })
    expect(r.disponibleReal).toBe(-4)
    expect(r.proximaDisponibilidad).toBe(6)
  })
})
