import { describe, it, expect } from 'vitest'
import { filtrosInicialesModelos } from '@/lib/compras-modelos-filtros'

const productos = [
  { id: 'tv1', categoria: 'TV, Sonido y Electronicos', plataforma: 'gomarket' },
  { id: 'cel1', categoria: 'Celulares', plataforma: 'gocelular' },
  { id: 'kit1', categoria: null, plataforma: undefined },
]

describe('filtrosInicialesModelos', () => {
  it('con ?producto= de un gomarket preselecciona su categoría y la tienda gomarket', () => {
    expect(filtrosInicialesModelos('tv1', productos)).toEqual({
      categoria: 'TV, Sonido y Electronicos',
      tienda: 'gomarket',
    })
  })

  it('producto gocelular (o sin plataforma) → tienda gocelular', () => {
    expect(filtrosInicialesModelos('cel1', productos)).toEqual({ categoria: 'Celulares', tienda: 'gocelular' })
    expect(filtrosInicialesModelos('kit1', productos)).toEqual({ categoria: '', tienda: 'gocelular' })
  })

  it('sin param o producto inexistente → null (no toca los filtros)', () => {
    expect(filtrosInicialesModelos(null, productos)).toBeNull()
    expect(filtrosInicialesModelos('nope', productos)).toBeNull()
  })
})

import { marcaDeProducto, proveedorVendeProducto } from '@/lib/compras-modelos-filtros'

describe('marcaDeProducto', () => {
  it('deduce la marca del nombre para Celulares', () => {
    expect(marcaDeProducto({ nombre: 'Samsung Galaxy A16 4/128GB', categoria: 'Celulares' })).toBe('Samsung')
    expect(marcaDeProducto({ nombre: 'Xiaomi Redmi 14C 256/4 GB', categoria: 'Celulares' })).toBe('Xiaomi')
  })
  it('no infiere marca fuera de Celulares', () => {
    expect(marcaDeProducto({ nombre: 'JBL Flip 7', categoria: 'Parlantes' })).toBeNull()
  })
  it('celular de marca no listada → null', () => {
    expect(marcaDeProducto({ nombre: 'Apple iPhone 15', categoria: 'Celulares' })).toBeNull()
  })
})

describe('proveedorVendeProducto', () => {
  const samsung = { nombre: 'Samsung Galaxy A16', categoria: 'Celulares' }
  const xiaomi = { nombre: 'Xiaomi Redmi 14C 256/4 GB', categoria: 'Celulares' }
  const parlante = { nombre: 'JBL Flip 7', categoria: 'Parlantes' }

  it('proveedor con marcas vende solo las suyas', () => {
    const notas = JSON.stringify({ marcas: ['Samsung', 'Motorola'] })
    expect(proveedorVendeProducto(notas, samsung)).toBe(true)
    expect(proveedorVendeProducto(notas, xiaomi)).toBe(false)
  })
  it('proveedor sin marcas configuradas vende todo', () => {
    expect(proveedorVendeProducto(JSON.stringify({ marcas: [] }), xiaomi)).toBe(true)
    expect(proveedorVendeProducto('', xiaomi)).toBe(true)
    expect(proveedorVendeProducto('texto no-json', xiaomi)).toBe(true)
  })
  it('producto sin marca inferible (no-celular) se muestra aunque el proveedor tenga marcas', () => {
    expect(proveedorVendeProducto(JSON.stringify({ marcas: ['Samsung'] }), parlante)).toBe(true)
  })
})
