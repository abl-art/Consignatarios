import { describe, expect, it } from 'vitest'
import { resolverAccion, accionDesdeEstadoPedro, rutearPreview } from '@/lib/acciones-arrepentimiento'

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

  it('no_es_wh (stock local, nada en Andreani) → manual', () => {
    expect(accionDesdeEstadoPedro('no_es_wh')).toBe('manual')
  })
})

// Ruteo del RESULTADO del preview (mode: preview = "qué haría apply") al
// estado del botón inteligente. Contrato completo de Pedro 29/10.
describe('rutearPreview', () => {
  it('cancelación viable (preview proyecta cancelacion_pedida/cancelado) → go cancelar_pedido', () => {
    expect(rutearPreview('cancelacion_pedida')).toEqual({ tipo: 'go', accion: 'cancelar_pedido', label: 'Cancelar pedido' })
    expect(rutearPreview('cancelacion_pedida_por_mail')).toEqual({ tipo: 'go', accion: 'cancelar_pedido', label: 'Cancelar pedido' })
    expect(rutearPreview('cancelado')).toEqual({ tipo: 'go', accion: 'cancelar_pedido', label: 'Cancelar pedido' })
  })

  it('expedido sin rescate pedido → go rescate (el apply de cancelar_pedido lo pide, rescate automático)', () => {
    expect(rutearPreview('no_cancelable_expedido')).toEqual({ tipo: 'go', accion: 'rescate', label: 'Pedir rescate' })
  })

  it('entregado → go solicitar_devolucion', () => {
    expect(rutearPreview('no_cancelable_entregado')).toEqual({ tipo: 'go', accion: 'solicitar_devolucion', label: 'Pedir devolución' })
  })

  it('rescate ya en curso → ninguna (contrato: no reintentar el apply, se sigue en Rescates)', () => {
    expect(rutearPreview('rescate_pedido').tipo).toBe('ninguna')
    expect(rutearPreview('rescate_confirmado').tipo).toBe('ninguna')
    expect(rutearPreview('rescate_recibido').tipo).toBe('ninguna')
  })

  it('rescate_rechazado → manual (lo resuelve un operador; si llegó al cliente, devolución)', () => {
    const r = rutearPreview('rescate_rechazado')
    expect(r.tipo).toBe('manual')
  })

  it('devolución ya en curso → ninguna; retiro_fallido → manual', () => {
    expect(rutearPreview('devolucion_pedida').tipo).toBe('ninguna')
    expect(rutearPreview('retiro_confirmado').tipo).toBe('ninguna')
    expect(rutearPreview('devolucion_recibida').tipo).toBe('ninguna')
    expect(rutearPreview('retiro_fallido').tipo).toBe('manual')
  })

  it('vivo y sin_pedido_wh → reintentar (backoff del contrato)', () => {
    expect(rutearPreview('vivo').tipo).toBe('reintentar')
    expect(rutearPreview('sin_pedido_wh').tipo).toBe('reintentar')
  })

  it('no_es_wh y requiere_atencion → manual', () => {
    const local = rutearPreview('no_es_wh')
    expect(local.tipo).toBe('manual')
    if (local.tipo === 'manual') expect(local.motivo).toMatch(/local/i)
    expect(rutearPreview('requiere_atencion').tipo).toBe('manual')
  })

  it('null o estado desconocido → manual, sin romper', () => {
    expect(rutearPreview(null).tipo).toBe('manual')
    expect(rutearPreview('algo_nuevo_de_pedro').tipo).toBe('manual')
  })
})
