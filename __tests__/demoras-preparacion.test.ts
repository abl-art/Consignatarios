import { describe, it, expect } from 'vitest'
import { horasHabilesEntre, armarDemorasPreparacion, HORAS_DEMORA_PREPARACION } from '@/lib/demoras-preparacion'

// Fechas en ART (UTC-3). Un viernes a las 18:00 ART = 21:00Z.
describe('horasHabilesEntre (solo lunes a viernes, hora ART)', () => {
  it('dentro del mismo día hábil cuenta las horas corridas', () => {
    expect(horasHabilesEntre('2026-10-21T10:00:00-03:00', '2026-10-21T15:00:00-03:00')).toBe(5)
  })

  it('el fin de semana no suma: viernes 18:00 → lunes 18:00 son 24h hábiles', () => {
    expect(horasHabilesEntre('2026-10-16T18:00:00-03:00', '2026-10-19T18:00:00-03:00')).toBe(24)
  })

  it('un tramo enteramente en sábado/domingo vale 0', () => {
    expect(horasHabilesEntre('2026-10-17T08:00:00-03:00', '2026-10-18T22:00:00-03:00')).toBe(0)
  })

  it('jueves 12:00 → lunes 12:00 son exactamente 48h hábiles', () => {
    expect(horasHabilesEntre('2026-10-15T12:00:00-03:00', '2026-10-19T12:00:00-03:00')).toBe(48)
  })
})

describe('armarDemorasPreparacion', () => {
  const AHORA = '2026-10-21T12:00:00-03:00' // miércoles
  const base = {
    orderNumber: 'SO-X',
    cliente: 'Cliente',
    dni: '123',
    producto: 'Moto G',
    confirmadaAt: '2026-10-16T10:00:00-03:00', // viernes 10:00 → ~50h hábiles al miércoles 12:00
    tracking: null as string | null,
    whPedido: null as { estado: string | null; error: string | null } | null,
    stockDisponible: 5 as number | null,
    arrepPendiente: false,
  }

  it('excluye las que ya tienen tracking, las de menos de 48h hábiles, arrepentimientos pendientes y pedidos cancelados', () => {
    const filas = armarDemorasPreparacion(
      [
        { ...base, orderNumber: 'CON-TRACKING', tracking: '360001' },
        { ...base, orderNumber: 'RECIENTE', confirmadaAt: '2026-10-21T08:00:00-03:00' },
        { ...base, orderNumber: 'ARREP', arrepPendiente: true },
        { ...base, orderNumber: 'CANCELADO', whPedido: { estado: 'cancelled', error: null } },
        { ...base, orderNumber: 'CANCELACION-PEDIDA', whPedido: { estado: 'cancel_requested', error: 'Arrepentimiento' } },
        { ...base, orderNumber: 'DEMORADA' },
      ],
      AHORA,
    )
    expect(filas.map(f => f.orderNumber)).toEqual(['DEMORADA'])
    expect(filas[0].horasHabiles).toBeGreaterThanOrEqual(HORAS_DEMORA_PREPARACION)
  })

  it('razones: rechazo Andreani > sin stock > nunca envió > SIN MOTIVO', () => {
    const filas = armarDemorasPreparacion(
      [
        { ...base, orderNumber: 'A', whPedido: { estado: 'requires_attention', error: 'inventory_out_of_circulation: equipo fuera de circulación' } },
        { ...base, orderNumber: 'B', stockDisponible: 0 },
        { ...base, orderNumber: 'C', whPedido: null },
        { ...base, orderNumber: 'D', whPedido: { estado: 'sent', error: null } },
      ],
      AHORA,
    )
    const porOrden = Object.fromEntries(filas.map(f => [f.orderNumber, f.razon]))
    expect(porOrden['A']).toBe('Rechazado por Andreani')
    expect(porOrden['B']).toBe('Sin stock')
    expect(porOrden['C']).toBe('GOcelular nunca envió')
    expect(porOrden['D']).toBe('SIN MOTIVO')
  })

  it('ordena de mayor a menor demora hábil', () => {
    const filas = armarDemorasPreparacion(
      [
        { ...base, orderNumber: 'MENOS', confirmadaAt: '2026-10-16T10:00:00-03:00' },
        { ...base, orderNumber: 'MAS', confirmadaAt: '2026-10-13T10:00:00-03:00' },
      ],
      AHORA,
    )
    expect(filas.map(f => f.orderNumber)).toEqual(['MAS', 'MENOS'])
  })
})

describe('passthrough de campos extra', () => {
  it('conserva campos adicionales de la orden (GOcuotas, Trustonic) en la salida', () => {
    const filas = armarDemorasPreparacion(
      [{
        orderNumber: 'SO-1', cliente: 'C', dni: '1', producto: 'P',
        confirmadaAt: '2026-10-13T10:00:00-03:00', tracking: null,
        whPedido: null, stockDisponible: 1, arrepPendiente: false,
        gocuotasOrderId: '19108832', gocuotasStatus: 'approved', trustonicStatus: 'ready_for_use',
      }],
      '2026-10-21T12:00:00-03:00',
    )
    expect(filas[0].gocuotasOrderId).toBe('19108832')
    expect(filas[0].trustonicStatus).toBe('ready_for_use')
  })
})

describe('exclusiones de órdenes ya gestionadas (caso real 20466792)', () => {
  const base = {
    orderNumber: 'SO-SNMKH7', cliente: 'Natacha', dni: '1', producto: 'Samsung A07',
    confirmadaAt: '2026-10-11T18:34:00-03:00', tracking: null as string | null,
    whPedido: null as { estado: string | null; error: string | null } | null,
    stockDisponible: 5 as number | null, arrepPendiente: false,
  }
  const AHORA = '2026-10-21T12:00:00-03:00'

  it('un pedido WH que llegó a expedido no es demora de preparación aunque el envío se haya cancelado después', () => {
    const filas = armarDemorasPreparacion(
      [{ ...base, whPedido: { estado: 'expedido', error: null } }],
      AHORA,
    )
    expect(filas).toHaveLength(0)
  })
})
