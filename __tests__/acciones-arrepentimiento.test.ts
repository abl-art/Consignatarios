import { describe, expect, it } from 'vitest'
import { resolverAccion, accionDesdeEstadoPedro } from '@/lib/acciones-arrepentimiento'

describe('resolverAccion', () => {
  it('fulfillments cancelables del warehouse → cancelar_pedido', () => {
    expect(resolverAccion('en cola')).toEqual({ accion: 'cancelar_pedido', label: 'Cancelar pedido' })
    expect(resolverAccion('enviado a Andreani')).toEqual({ accion: 'cancelar_pedido', label: 'Cancelar pedido' })
    expect(resolverAccion('pickeado')).toEqual({ accion: 'cancelar_pedido', label: 'Cancelar pedido' })
  })

  it('expedido → rescate', () => {
    expect(resolverAccion('expedido')).toEqual({ accion: 'rescate', label: 'Rescatar' })
  })

  it('null (sin pedido en el warehouse) → manual, posible depósito local', () => {
    const r = resolverAccion(null)
    expect(r.accion).toBe('manual')
    if (r.accion === 'manual') expect(r.motivo).toMatch(/depósito local/i)
  })

  it('cancelado → ninguna', () => {
    expect(resolverAccion('cancelado').accion).toBe('ninguna')
  })

  it('cancelación pedida y cancelación no realizada → ninguna', () => {
    expect(resolverAccion('cancelación pedida').accion).toBe('ninguna')
    expect(resolverAccion('cancelación no realizada').accion).toBe('ninguna')
  })

  it('cualquier otro string desconocido → ninguna', () => {
    expect(resolverAccion('algo-raro').accion).toBe('ninguna')
  })
})

describe('accionDesdeEstadoPedro', () => {
  it('mapea los estados explícitos del contrato de Pedro', () => {
    expect(accionDesdeEstadoPedro('no_cancelable_expedido')).toBe('rescate')
    expect(accionDesdeEstadoPedro('no_cancelable_entregado')).toBe('solicitar_devolucion')
    expect(accionDesdeEstadoPedro('sin_pedido_wh')).toBe('manual')
  })

  it('prefijo rescate* → rescate', () => {
    expect(accionDesdeEstadoPedro('rescate_pedido')).toBe('rescate')
    expect(accionDesdeEstadoPedro('rescate_confirmado')).toBe('rescate')
  })

  it('prefijo devolucion*/retiro* → solicitar_devolucion', () => {
    expect(accionDesdeEstadoPedro('devolucion_recibida')).toBe('solicitar_devolucion')
    expect(accionDesdeEstadoPedro('retiro_solicitado')).toBe('solicitar_devolucion')
    expect(accionDesdeEstadoPedro('retiro_realizado')).toBe('solicitar_devolucion')
  })

  it('cualquier otro estado → manual', () => {
    expect(accionDesdeEstadoPedro('algo-desconocido')).toBe('manual')
  })
})
