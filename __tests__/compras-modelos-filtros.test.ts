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
  const motorola = { nombre: 'Motorola Moto G06 64GB', categoria: 'Celulares' }
  const samsung = { nombre: 'Samsung Galaxy A16', categoria: 'Celulares' }
  const xiaomi = { nombre: 'Xiaomi Redmi 14C 256/4 GB', categoria: 'Celulares' }
  const parlante = { nombre: 'JBL Flip 7', categoria: 'Parlantes' }
  const prov = (tipos: string[], marcas: string[]) => ({ direccion: JSON.stringify(tipos), notas: JSON.stringify({ marcas }) })

  it('celulares: filtra por categoría Y marca', () => {
    const p = prov(['Celulares', 'Parlantes'], ['Samsung', 'Motorola'])
    expect(proveedorVendeProducto(p, samsung)).toBe(true)
    expect(proveedorVendeProducto(p, motorola)).toBe(true)
    expect(proveedorVendeProducto(p, xiaomi)).toBe(false) // vende Celulares pero no Xiaomi
  })

  it('NO muestra un proveedor que no vende la categoría, aunque tenga marcas vacías', () => {
    // El caso reportado: Avenida Hogar / ELECTRONICCOMMERCE / Mil200 / OHPIC
    expect(proveedorVendeProducto(prov(['TV, Sonido y Electronicos', 'Linea Blanca'], []), motorola)).toBe(false)
    expect(proveedorVendeProducto(prov(['Parlantes'], []), motorola)).toBe(false)
    expect(proveedorVendeProducto(prov(['Kits de Seguridad'], []), motorola)).toBe(false)
    expect(proveedorVendeProducto(prov(['Auriculares', 'Smartwatches'], []), motorola)).toBe(false)
  })

  it('vende la categoría con marcas vacías → aparece (no filtra por marca)', () => {
    expect(proveedorVendeProducto(prov(['Celulares'], []), motorola)).toBe(true)
  })

  it('tolera el nombre de categoría ampliado (Tablets ↔ Tablets y Computadoras)', () => {
    const tablet = { nombre: 'Samsung Galaxy Tab A11', categoria: 'Tablets' }
    expect(proveedorVendeProducto(prov(['Tablets y Computadoras'], []), tablet)).toBe(true)
  })

  it('proveedor sin tipos cargados vende cualquier categoría', () => {
    expect(proveedorVendeProducto({ direccion: '', notas: '' }, motorola)).toBe(true)
  })

  it('producto no-celular: solo filtra por categoría, no por marca', () => {
    expect(proveedorVendeProducto(prov(['Parlantes'], ['Samsung']), parlante)).toBe(true)
    expect(proveedorVendeProducto(prov(['Celulares'], ['Samsung']), parlante)).toBe(false)
  })
})
