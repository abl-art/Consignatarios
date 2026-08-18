import { describe, it, expect } from 'vitest'
import { calcularStockAccesorio } from '@/lib/stock-accesorios'

describe('calcularStockAccesorio', () => {
  it('ASN aceptado pero no recibido: no cuenta en ningún depósito ni en el total', () => {
    // KS-MOTO-G56: 28 informadas el 12/8, Andreani no recibió nada
    const r = calcularStockAccesorio({ stock: 28, informadas: 28, pendientesAceptadas: 28, despachadas: 0, enTransito: 28 })
    expect(r).toEqual({ whAndreani: 0, whGocuotas: 0, total: 0 })
  })

  it('ASN recibido completo cuenta en WH Andreani', () => {
    const r = calcularStockAccesorio({ stock: 950, informadas: 950, pendientesAceptadas: 0, despachadas: 0, enTransito: 0 })
    expect(r).toEqual({ whAndreani: 950, whGocuotas: 0, total: 950 })
  })

  it('resta despachos y tránsito parcial', () => {
    // 1300 informadas (500 manuales recibidas + 800 con intake), 150 aún en tránsito, 500 despachadas
    const r = calcularStockAccesorio({ stock: 800, informadas: 1300, pendientesAceptadas: 150, despachadas: 500, enTransito: 150 })
    expect(r).toEqual({ whAndreani: 650, whGocuotas: 0, total: 650 })
  })

  it('sin ASN todo queda en WH GOcuotas', () => {
    const r = calcularStockAccesorio({ stock: 144, informadas: 0, pendientesAceptadas: 0, despachadas: 0, enTransito: 0 })
    expect(r).toEqual({ whAndreani: 0, whGocuotas: 144, total: 144 })
  })

  it('WH Andreani nunca supera el stock total (datos inconsistentes)', () => {
    const r = calcularStockAccesorio({ stock: 212, informadas: 240, pendientesAceptadas: 0, despachadas: 0, enTransito: 0 })
    expect(r).toEqual({ whAndreani: 212, whGocuotas: 0, total: 212 })
  })

  it('WH Andreani tampoco supera stock menos tránsito (lo en viaje no está en el depósito)', () => {
    // pocos despachos registrados: lo informado neto supera lo físicamente posible
    const r = calcularStockAccesorio({ stock: 800, informadas: 1300, pendientesAceptadas: 150, despachadas: 350, enTransito: 150 })
    expect(r).toEqual({ whAndreani: 650, whGocuotas: 0, total: 650 })
  })

  it('nunca devuelve negativos', () => {
    const r = calcularStockAccesorio({ stock: 0, informadas: 10, pendientesAceptadas: 20, despachadas: 5, enTransito: 30 })
    expect(r).toEqual({ whAndreani: 0, whGocuotas: 0, total: 0 })
  })
})
