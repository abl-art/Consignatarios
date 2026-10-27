import { describe, it, expect } from 'vitest'
import { puedeCancelarPedido, validarMotivo, esReintentable, esCancelacionConfirmada, interpretarPreview, veredictoCancelacion, etiquetaDesdeGetCancelacion, MOTIVO_ARREPENTIMIENTO } from '@/lib/cancelaciones'

describe('puedeCancelarPedido', () => {
  const base = { estado: 'pendiente', orderNumber: 'SO-9BRH9A', fulfillment: 'enviado a Andreani' as string | null }

  it('pendiente con pedido en el circuito: se puede', () => {
    expect(puedeCancelarPedido(base).ok).toBe(true)
    expect(puedeCancelarPedido({ ...base, fulfillment: 'en cola' }).ok).toBe(true)
    expect(puedeCancelarPedido({ ...base, fulfillment: 'pickeado' }).ok).toBe(true)
  })

  it('expedido va a rescate, cancelado ya está, sin fulfillment no hay pedido', () => {
    const exp = puedeCancelarPedido({ ...base, fulfillment: 'expedido' })
    expect(exp.ok).toBe(false)
    if (!exp.ok) expect(exp.error).toMatch(/rescate/i)
    expect(puedeCancelarPedido({ ...base, fulfillment: 'cancelado' }).ok).toBe(false)
    expect(puedeCancelarPedido({ ...base, fulfillment: null }).ok).toBe(false)
  })

  it('resueltas y sin orden no', () => {
    expect(puedeCancelarPedido({ ...base, estado: 'descartada' }).ok).toBe(false)
    expect(puedeCancelarPedido({ ...base, orderNumber: null }).ok).toBe(false)
  })
})

describe('validarMotivo', () => {
  it('entre 10 y 500 caracteres', () => {
    expect(validarMotivo(MOTIVO_ARREPENTIMIENTO)).toBe(true)
    expect(validarMotivo('corto')).toBe(false)
    expect(validarMotivo('x'.repeat(501))).toBe(false)
    expect(validarMotivo('   diez ch  ')).toBe(false) // el trim lo deja en menos de 10
  })
})

describe('esReintentable (reglas del contrato de Pedro)', () => {
  it('vivo y sin_pedido_wh se reintentan en unos minutos', () => {
    expect(esReintentable(200, { resultado: 'vivo' })).toBe(true)
    expect(esReintentable(200, { resultado: 'sin_pedido_wh' })).toBe(true)
    expect(esReintentable(200, { resultado: 'cancelado' })).toBe(false)
  })

  it('409 no se reintenta salvo retryable true', () => {
    expect(esReintentable(409, { resultado: 'conflicto' })).toBe(false)
    expect(esReintentable(409, { resultado: 'conflicto', retryable: true })).toBe(true)
  })

  it('5xx (incl. 503 refund_disabled) se puede reintentar', () => {
    expect(esReintentable(503, { resultado: 'refund_disabled' })).toBe(true)
    expect(esReintentable(500, null)).toBe(true)
  })
})

describe('esCancelacionConfirmada', () => {
  it('solo cancelado cierra el ciclo', () => {
    expect(esCancelacionConfirmada('cancelado')).toBe(true)
    expect(esCancelacionConfirmada('vivo')).toBe(false)
    expect(esCancelacionConfirmada(null)).toBe(false)
  })
})

describe('interpretarPreview', () => {
  it('no_cancelable_* bloquea el apply (caso real: expedido entre cron y cron)', () => {
    const r = interpretarPreview({ resultado: 'no_cancelable_expedido' })
    expect(r.cancelable).toBe(false)
    expect(r.motivo).toContain('no_cancelable_expedido')
  })

  it('sin_pedido_wh pide reintentar, cancelable sigue', () => {
    expect(interpretarPreview({ resultado: 'sin_pedido_wh' }).cancelable).toBe(false)
    expect(interpretarPreview({ resultado: 'cancelable' }).cancelable).toBe(true)
    expect(interpretarPreview(null).cancelable).toBe(true)
  })
})

describe('veredictoCancelacion (contrato Pedro 27/10)', () => {
  it('cancelado confirma; requiere_atencion y no_cancelable_expedido rechazan; el resto sigue pendiente', () => {
    expect(veredictoCancelacion('cancelado')).toBe('confirmada')
    expect(veredictoCancelacion('requiere_atencion')).toBe('rechazada')
    expect(veredictoCancelacion('no_cancelable_expedido')).toBe('rechazada')
    expect(veredictoCancelacion('cancelacion_pedida')).toBe('pendiente')
    expect(veredictoCancelacion('vivo')).toBe('pendiente')
    expect(veredictoCancelacion(null)).toBe('pendiente')
  })
})

describe('puedeCancelarPedido con cancelación ya pedida', () => {
  it('no deja pedirla dos veces y explica que está pendiente de Andreani', () => {
    const r = puedeCancelarPedido({ estado: 'pendiente', orderNumber: 'SO-X', fulfillment: 'cancelación pedida' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/pendiente de confirmación/i)
  })
})

describe('etiquetaDesdeGetCancelacion (regla de Emiliano 27/10)', () => {
  it('canal mail = Andreani rechazó el intento por API → cancelación no realizada', () => {
    expect(etiquetaDesdeGetCancelacion({ estado: 'cancelacion_pedida', canal: 'mail' })).toBe('cancelación no realizada')
    expect(etiquetaDesdeGetCancelacion({ estado: 'cancelacion_pedida', canal: 'api' })).toBe('cancelación pedida')
  })

  it('terminales: cancelado queda, expedido manda la fila a rescate, requiere_atencion a no realizada', () => {
    expect(etiquetaDesdeGetCancelacion({ estado: 'cancelado' })).toBe('cancelado')
    expect(etiquetaDesdeGetCancelacion({ estado: 'no_cancelable_expedido' })).toBe('expedido')
    expect(etiquetaDesdeGetCancelacion({ estado: 'requiere_atencion' })).toBe('cancelación no realizada')
  })

  it('sin datos o estado desconocido: no tocar', () => {
    expect(etiquetaDesdeGetCancelacion(null)).toBeNull()
    expect(etiquetaDesdeGetCancelacion({ estado: 'algo_nuevo' })).toBeNull()
  })
})
