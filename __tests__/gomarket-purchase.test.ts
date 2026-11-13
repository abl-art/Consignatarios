import { describe, it, expect } from 'vitest'
import { plataformaDePedido, armarLineasGomarket, armarSupplierCommerce, validarSkusCommerce, type SkuCommerce } from '@/lib/gomarket-purchase'
import { eanProvisorio, esEan13Valido } from '@/lib/ean-provisorio'

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
    expect(lines).toEqual([{ sku: 'HELAD-01', quantity: 5, unit_cost: '850000.50', ean: eanProvisorio('HELAD-01') }])
  })

  it('omite unit_cost cuando el precio no es válido', () => {
    const { lines } = armarLineasGomarket([item('SKU-1', 2, 0)])
    expect(lines).toEqual([{ sku: 'SKU-1', quantity: 2, ean: eanProvisorio('SKU-1') }])
  })

  it('consolida items repetidos del mismo SKU sumando cantidades', () => {
    const { lines, errores } = armarLineasGomarket([item('SKU-1', 2, 100), item('SKU-1', 3, 0)])
    expect(errores).toEqual([])
    expect(lines).toEqual([{ sku: 'SKU-1', quantity: 5, unit_cost: '100.00', ean: eanProvisorio('SKU-1') }])
  })

  it('sin EAN cargado genera uno provisorio 299 válido y determinístico por SKU', () => {
    const { lines } = armarLineasGomarket([item('FR901D-NS', 1, 123600)])
    expect(lines[0].ean).toBe(eanProvisorio('FR901D-NS'))
    expect(lines[0].ean!.startsWith('299')).toBe(true)
    expect(esEan13Valido(lines[0].ean!)).toBe(true)
  })

  it('con EAN real cargado lo usa en vez del provisorio', () => {
    const { lines } = armarLineasGomarket([{ ...item('FR901D-NS', 1, 123600), ean: ' 7790895000782 ' }])
    expect(lines[0].ean).toBe('7790895000782')
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

describe('armarSupplierCommerce', () => {
  // Novedad de Pedro 7/10: el contrato v1 acepta supplier opcional con name y
  // cuit — solo se manda si tenemos los dos datos.
  it('con nombre y cuit arma el supplier', () => {
    expect(armarSupplierCommerce('IATEC S.A.', '30-12345678-9')).toEqual({ name: 'IATEC S.A.', cuit: '30-12345678-9' })
  })

  it('sin cuit (o vacío) no manda supplier', () => {
    expect(armarSupplierCommerce('IATEC S.A.', null)).toBeUndefined()
    expect(armarSupplierCommerce('IATEC S.A.', '  ')).toBeUndefined()
  })

  it('sin nombre no manda supplier', () => {
    expect(armarSupplierCommerce('', '30-12345678-9')).toBeUndefined()
  })

  it('recorta espacios', () => {
    expect(armarSupplierCommerce(' IATEC ', ' 30-12345678-9 ')).toEqual({ name: 'IATEC', cuit: '30-12345678-9' })
  })
})
