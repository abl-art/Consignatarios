import { describe, it, expect } from 'vitest'
import {
  claseRescate,
  claseDevolucion,
  etiquetaRescate,
  etiquetaDevolucion,
} from '@/lib/estados-andreani'

describe('claseRescate', () => {
  it('rescate_recibido → ok', () => {
    expect(claseRescate('rescate_recibido')).toBe('ok')
  })

  it('rescate_rechazado → mal', () => {
    expect(claseRescate('rescate_rechazado')).toBe('mal')
  })

  it('rescate_pedido → pendiente', () => {
    expect(claseRescate('rescate_pedido')).toBe('pendiente')
  })

  it('rescate_confirmado → pendiente', () => {
    expect(claseRescate('rescate_confirmado')).toBe('pendiente')
  })

  it('null → pendiente', () => {
    expect(claseRescate(null)).toBe('pendiente')
  })

  it('unknown state → pendiente (Review Focus)', () => {
    expect(claseRescate('algo_nuevo')).toBe('pendiente')
  })
})

describe('claseDevolucion', () => {
  it('devolucion_recibida → ok', () => {
    expect(claseDevolucion('devolucion_recibida')).toBe('ok')
  })

  it('retiro_fallido → mal', () => {
    expect(claseDevolucion('retiro_fallido')).toBe('mal')
  })

  it('retiro_solicitado → pendiente', () => {
    expect(claseDevolucion('retiro_solicitado')).toBe('pendiente')
  })

  it('devolucion_pedida → pendiente', () => {
    expect(claseDevolucion('devolucion_pedida')).toBe('pendiente')
  })

  it('retiro_confirmado → pendiente', () => {
    expect(claseDevolucion('retiro_confirmado')).toBe('pendiente')
  })

  it('retiro_realizado → pendiente', () => {
    expect(claseDevolucion('retiro_realizado')).toBe('pendiente')
  })

  it('null → pendiente', () => {
    expect(claseDevolucion(null)).toBe('pendiente')
  })

  it('unknown state → pendiente (Review Focus)', () => {
    expect(claseDevolucion('algo_nuevo')).toBe('pendiente')
  })
})

describe('etiquetaRescate', () => {
  it('rescate_pedido → "rescate pedido"', () => {
    expect(etiquetaRescate('rescate_pedido')).toBe('rescate pedido')
  })

  it('rescate_confirmado → "rescate confirmado"', () => {
    expect(etiquetaRescate('rescate_confirmado')).toBe('rescate confirmado')
  })

  it('rescate_recibido → "rescate recibido"', () => {
    expect(etiquetaRescate('rescate_recibido')).toBe('rescate recibido')
  })

  it('rescate_rechazado → "rescate rechazado"', () => {
    expect(etiquetaRescate('rescate_rechazado')).toBe('rescate rechazado')
  })

  it('null → null', () => {
    expect(etiquetaRescate(null)).toBeNull()
  })

  it('unknown state → raw string unchanged (Review Focus)', () => {
    expect(etiquetaRescate('algo_nuevo')).toBe('algo_nuevo')
  })
})

describe('etiquetaDevolucion', () => {
  it('devolucion_pedida → "devolución pedida"', () => {
    expect(etiquetaDevolucion('devolucion_pedida')).toBe('devolución pedida')
  })

  it('retiro_solicitado → "retiro solicitado"', () => {
    expect(etiquetaDevolucion('retiro_solicitado')).toBe('retiro solicitado')
  })

  it('retiro_confirmado → "retiro confirmado"', () => {
    expect(etiquetaDevolucion('retiro_confirmado')).toBe('retiro confirmado')
  })

  it('retiro_realizado → "retiro realizado"', () => {
    expect(etiquetaDevolucion('retiro_realizado')).toBe('retiro realizado')
  })

  it('retiro_fallido → "retiro fallido"', () => {
    expect(etiquetaDevolucion('retiro_fallido')).toBe('retiro fallido')
  })

  it('devolucion_recibida → "devolución recibida"', () => {
    expect(etiquetaDevolucion('devolucion_recibida')).toBe('devolución recibida')
  })

  it('null → null', () => {
    expect(etiquetaDevolucion(null)).toBeNull()
  })

  it('unknown state → raw string unchanged (Review Focus)', () => {
    expect(etiquetaDevolucion('algo_nuevo')).toBe('algo_nuevo')
  })
})
