import { describe, it, expect } from 'vitest'
import { listaFacturas, agregarFactura, quitarFactura, MAX_FACTURAS_PEDIDO, type FacturaPedido } from '@/lib/facturas-pedido'

const f = (path: string): FacturaPedido => ({ path, nombre: path + '.pdf', subidaAt: '2026-11-20T00:00:00Z' })

describe('listaFacturas', () => {
  it('pedido viejo con factura única la devuelve como lista', () => {
    expect(listaFacturas({ factura: f('a') })).toEqual([f('a')])
  })

  it('el array nuevo tiene prioridad sobre el campo legacy', () => {
    expect(listaFacturas({ factura: f('vieja'), facturas: [f('a'), f('b')] })).toEqual([f('a'), f('b')])
  })

  it('sin facturas devuelve lista vacía', () => {
    expect(listaFacturas({})).toEqual([])
  })
})

describe('agregarFactura', () => {
  it('agrega al final de la lista', () => {
    const r = agregarFactura([f('a')], f('b'))
    expect(r).toEqual({ ok: [f('a'), f('b')] })
  })

  it('permite llegar a 4 facturas', () => {
    const r = agregarFactura([f('a'), f('b'), f('c')], f('d'))
    expect('ok' in r && r.ok.length).toBe(4)
  })

  it('rechaza pasar el máximo', () => {
    const llenas = Array.from({ length: MAX_FACTURAS_PEDIDO }, (_, i) => f(`x${i}`))
    const r = agregarFactura(llenas, f('otra'))
    expect('error' in r).toBe(true)
  })
})

describe('quitarFactura', () => {
  it('saca la factura por path y deja el resto', () => {
    expect(quitarFactura([f('a'), f('b'), f('c')], 'b')).toEqual([f('a'), f('c')])
  })

  it('path inexistente deja la lista igual', () => {
    expect(quitarFactura([f('a')], 'zzz')).toEqual([f('a')])
  })
})
