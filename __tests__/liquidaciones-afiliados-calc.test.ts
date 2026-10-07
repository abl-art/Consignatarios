import { describe, it, expect } from 'vitest'
import { calcularLiquidacion, saldoArrastre, detectarAjustes } from '@/lib/liquidaciones-afiliados-calc'

describe('calcularLiquidacion', () => {
  it('sin anulaciones ni saldo anterior: paga las comisiones del mes', () => {
    expect(calcularLiquidacion({ totalComisiones: 1000, comisionesAnuladas: [], saldoAnterior: 0 })).toEqual({
      totalComisiones: 1000,
      ajustes: 0,
      saldoAnterior: 0,
      montoAPagar: 1000,
      estado: 'pendiente',
    })
  })

  it('descuenta las comisiones de órdenes anuladas como ajuste negativo', () => {
    const r = calcularLiquidacion({ totalComisiones: 1000, comisionesAnuladas: [200, 150], saldoAnterior: 0 })
    expect(r.ajustes).toBe(-350)
    expect(r.montoAPagar).toBe(650)
    expect(r.estado).toBe('pendiente')
  })

  it('suma el saldo negativo arrastrado del mes anterior', () => {
    const r = calcularLiquidacion({ totalComisiones: 1000, comisionesAnuladas: [100], saldoAnterior: -300 })
    expect(r.montoAPagar).toBe(600)
    expect(r.saldoAnterior).toBe(-300)
  })

  it('ajustes mayores a las comisiones: monto negativo y estado compensada', () => {
    const r = calcularLiquidacion({ totalComisiones: 100, comisionesAnuladas: [300], saldoAnterior: 0 })
    expect(r.montoAPagar).toBe(-200)
    expect(r.estado).toBe('compensada')
  })

  it('partner sin ventas en el mes pero con anulaciones: liquidación en negativo', () => {
    const r = calcularLiquidacion({ totalComisiones: 0, comisionesAnuladas: [250], saldoAnterior: 0 })
    expect(r.montoAPagar).toBe(-250)
    expect(r.estado).toBe('compensada')
  })

  it('monto exactamente cero queda compensada (no hay nada que pagar)', () => {
    const r = calcularLiquidacion({ totalComisiones: 200, comisionesAnuladas: [200], saldoAnterior: 0 })
    expect(r.montoAPagar).toBe(0)
    expect(r.estado).toBe('compensada')
  })

  it('redondea a 2 decimales para evitar basura de punto flotante', () => {
    const r = calcularLiquidacion({ totalComisiones: 0.1, comisionesAnuladas: [0.2], saldoAnterior: 0 })
    expect(r.montoAPagar).toBe(-0.1)
    expect(r.ajustes).toBe(-0.2)
  })
})

describe('saldoArrastre', () => {
  it('una liquidación con monto negativo arrastra todo su saldo', () => {
    expect(saldoArrastre(-200)).toBe(-200)
  })

  it('una liquidación positiva o en cero no arrastra nada', () => {
    expect(saldoArrastre(650)).toBe(0)
    expect(saldoArrastre(0)).toBe(0)
  })
})

describe('detectarAjustes (liquidaciones post-corte, query nueva)', () => {
  const liq = { partnerSlug: 'acme', mes: '2026-11', createdAt: '2026-12-01T09:00:00Z' }
  const orden = {
    orderId: '101',
    orderNumber: 'GO-101',
    partnerSlug: 'acme',
    producto: 'Galaxy A26',
    comision: 500,
    mes: '2026-11',
    paidAt: '2026-11-20T10:00:00Z',
    cancelledAt: '2026-12-15T10:00:00Z',
  }

  it('incluye la orden pagada antes de la liquidación y anulada después', () => {
    expect(detectarAjustes([orden], [liq], new Set())).toEqual([orden])
  })

  it('excluye si no existe liquidación de ese partner y mes (nunca se pagó esa comisión)', () => {
    expect(detectarAjustes([orden], [{ ...liq, mes: '2026-10' }], new Set())).toEqual([])
    expect(detectarAjustes([orden], [{ ...liq, partnerSlug: 'otro' }], new Set())).toEqual([])
  })

  it('excluye la orden anulada antes de generarse la liquidación (ya quedó afuera)', () => {
    const o = { ...orden, cancelledAt: '2026-11-28T10:00:00Z' }
    expect(detectarAjustes([o], [liq], new Set())).toEqual([])
  })

  it('excluye la orden pagada después de generada la liquidación (nunca entró)', () => {
    const o = { ...orden, paidAt: '2026-12-02T10:00:00Z' }
    expect(detectarAjustes([o], [liq], new Set())).toEqual([])
  })

  it('excluye órdenes ya descontadas en una liquidación anterior', () => {
    expect(detectarAjustes([orden], [liq], new Set(['101']))).toEqual([])
  })
})

describe('detectarAjustes — liquidaciones legacy (query vieja sin filtro de anuladas)', () => {
  // Antes del fix (CORTE_FILTRO_ANULADAS) la generación incluía toda orden
  // con status 'paid' aunque ya estuviera anulada: esas comisiones se
  // pagaron igual y hay que recuperarlas.
  const liqLegacy = { partnerSlug: 'acme', mes: '2026-08', createdAt: '2026-09-01T09:00:00Z' }
  const base = {
    orderId: '201',
    orderNumber: 'GO-201',
    partnerSlug: 'acme',
    producto: 'Moto G06',
    comision: 300,
    mes: '2026-08',
    paidAt: '2026-08-10T10:00:00Z',
    cancelledAt: '2026-08-10T12:00:00Z', // anulada ANTES de la generación
  }

  it('incluye órdenes anuladas antes de generarse una liquidación legacy', () => {
    expect(detectarAjustes([base], [liqLegacy], new Set())).toEqual([base])
  })

  it('una liquidación posterior al corte mantiene la regla nueva (anulada antes = nunca entró)', () => {
    const liqNueva = { ...liqLegacy, mes: '2026-11', createdAt: '2026-12-01T09:00:00Z' }
    const o = { ...base, mes: '2026-11', paidAt: '2026-11-10T10:00:00Z', cancelledAt: '2026-11-10T12:00:00Z' }
    expect(detectarAjustes([o], [liqNueva], new Set())).toEqual([])
  })
})
