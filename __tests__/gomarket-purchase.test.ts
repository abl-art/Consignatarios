import { describe, it, expect } from 'vitest'
import { plataformaDePedido, armarLineasGomarket, validarSkusCommerce, type SkuCommerce } from '@/lib/gomarket-purchase'

const item = (codigo: string, cantidad: number, precio: number, nombre = codigo) => ({
  productoCodigo: codigo,
  productoNombre: nombre,
  cantidad,
  precio,
})

describe('plataformaDePedido', () => {
  const plataformas = new Map([
    ['p1', 'gocelular'],
    ['p2', 'gomarket'],
  ])

  it('todos gomarket → gomarket', () => {
    expect(plataformaDePedido(['p2'], plataformas)).toBe('gomarket')
  })

  it('todos gocelular → gocelular, incluyendo productos sin dato (default)', () => {
    expect(plataformaDePedido(['p1', 'desconocido'], plataformas)).toBe('gocelular')
  })

  it('mezcla → mixto', () => {
    expect(plataformaDePedido(['p1', 'p2'], plataformas)).toBe('mixto')
  })

  it('sin items → gocelular (default histórico)', () => {
    expect(plataformaDePedido([], plataformas)).toBe('gocelular')
  })
})

describe('armarLineasGomarket', () => {
  it('arma una línea por SKU con unit_cost en pesos como string', () => {
    const { lines, errores } = armarLineasGomarket([item('HELAD-01', 5, 850000.5)])
    expect(errores).toEqual([])
    expect(lines).toEqual([{ sku: 'HELAD-01', quantity: 5, unit_cost: '850000.50' }])
  })

  it('omite unit_cost cuando el precio no es válido', () => {
    const { lines } = armarLineasGomarket([item('SKU-1', 2, 0)])
    expect(lines).toEqual([{ sku: 'SKU-1', quantity: 2 }])
  })

  it('consolida items repetidos del mismo SKU sumando cantidades', () => {
    const { lines, errores } = armarLineasGomarket([item('SKU-1', 2, 100), item('SKU-1', 3, 0)])
    expect(errores).toEqual([])
    expect(lines).toEqual([{ sku: 'SKU-1', quantity: 5, unit_cost: '100.00' }])
  })

  it('sin código de producto o cantidad inválida → error con el nombre del producto', () => {
    const { lines, errores } = armarLineasGomarket([
      item('', 5, 100, 'Heladera Gafa'),
      item('SKU-2', 0, 100, 'Lavarropas'),
      item('SKU-3', 1.5, 100, 'Microondas'),
    ])
    expect(lines).toEqual([])
    expect(errores).toHaveLength(3)
    expect(errores[0]).toContain('Heladera Gafa')
    expect(errores[1]).toContain('Lavarropas')
    expect(errores[2]).toContain('Microondas')
  })
})

describe('validarSkusCommerce', () => {
  const catalogo = new Map<string, SkuCommerce>([
    ['OK', { sku: 'OK', activo: true, serialPolicy: null }],
    ['INACTIVO', { sku: 'INACTIVO', activo: false, serialPolicy: null }],
    ['SERIAL', { sku: 'SERIAL', activo: true, serialPolicy: 'required' }],
  ])

  it('SKU desconocido o inactivo → error; serial required → warning', () => {
    const { errores, warnings } = validarSkusCommerce(
      [
        { sku: 'OK', quantity: 1 },
        { sku: 'NOEXISTE', quantity: 1 },
        { sku: 'INACTIVO', quantity: 1 },
        { sku: 'SERIAL', quantity: 1 },
      ],
      catalogo,
    )
    expect(errores).toHaveLength(2)
    expect(errores[0]).toContain('NOEXISTE')
    expect(errores[1]).toContain('INACTIVO')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('SERIAL')
  })

  it('todo en regla → sin errores ni warnings', () => {
    const { errores, warnings } = validarSkusCommerce([{ sku: 'OK', quantity: 3 }], catalogo)
    expect(errores).toEqual([])
    expect(warnings).toEqual([])
  })
})
