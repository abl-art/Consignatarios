import { describe, it, expect } from 'vitest'
import { agruparCatalogo, type ModeloCatalogo } from '@/lib/catalogo-buscador'

function modelo(over: Partial<ModeloCatalogo> = {}): ModeloCatalogo {
  return {
    modelCode: 'SM-A175F',
    nombre: 'Celular Samsung Galaxy A17 4/128 GB',
    marca: 'Samsung',
    activo: true,
    lockSolution: 'knox_guard',
    dispositivos: 250,
    alias: [],
    ...over,
  }
}

describe('agruparCatalogo', () => {
  it('agrupa variantes de memoria en una sola entrada', () => {
    const r = agruparCatalogo([
      modelo({ modelCode: 'XT2535 (g06)', nombre: 'Motorola Moto G06 64gb', marca: 'Motorola' }),
      modelo({ modelCode: 'XT2536 (g06)', nombre: 'Motorola Moto G06 4/128GB', marca: 'Motorola' }),
    ])
    expect(r.modelos).toHaveLength(1)
    expect(r.modelos[0].nombre).toBe('Motorola Moto G06')
  })

  it('saca el prefijo "Celular" y la memoria del nombre', () => {
    const r = agruparCatalogo([modelo({ nombre: 'Celular Samsung Galaxy A07 4/64 GB' })])
    expect(r.modelos[0].nombre).toBe('Samsung Galaxy A07')
  })

  it('une el mismo modelo con y sin marca en el nombre', () => {
    const r = agruparCatalogo([
      modelo({ modelCode: 'MOTO_G15', nombre: 'Moto G15', marca: 'Motorola' }),
      modelo({ modelCode: 'XT2521 (g15)', nombre: 'Motorola Moto G15 128GB/4GB', marca: 'Motorola' }),
    ])
    expect(r.modelos).toHaveLength(1)
    expect(r.modelos[0].nombre).toBe('Motorola Moto G15')
  })

  it('mantiene separados 4G y 5G (solo la memoria no distingue)', () => {
    const r = agruparCatalogo([
      modelo({ modelCode: 'SM-A175F', nombre: 'Celular Samsung Galaxy A17 4/128 GB' }),
      modelo({ modelCode: 'SMA175G', nombre: 'Samsung Galaxy A17 5G 8/256GB' }),
    ])
    expect(r.modelos.map(m => m.nombre)).toEqual(['Samsung Galaxy A17', 'Samsung Galaxy A17 5G'])
  })

  it('limpia guiones sueltos que quedan al sacar la memoria', () => {
    const r = agruparCatalogo([modelo({ nombre: 'Motorola Moto G86 5G -  256GB/8GB', marca: 'Motorola' })])
    expect(r.modelos[0].nombre).toBe('Motorola Moto G86 5G')
  })

  it('excluye los inactivos del catálogo', () => {
    const r = agruparCatalogo([modelo(), modelo({ modelCode: 'SM-A26', nombre: 'Samsung Galaxy A26 5G 256GB', activo: false })])
    expect(r.modelos).toHaveLength(1)
  })

  it('incluye inactivos de las marcas indicadas (Motorola: en la lista = se vende)', () => {
    const r = agruparCatalogo([
      modelo({ modelCode: 'XT2527 (g86)', nombre: 'Motorola Moto G86 5G -  256GB/8GB', marca: 'Motorola', activo: false }),
      modelo({ modelCode: 'SM-A26', nombre: 'Samsung Galaxy A26 5G 256GB', activo: false }),
    ], ['Motorola'])
    expect(r.modelos.map(m => m.nombre)).toEqual(['Motorola Moto G86 5G'])
  })

  it('lista las marcas ordenadas y sin repetir', () => {
    const r = agruparCatalogo([
      modelo({ modelCode: 'xi002', nombre: 'Xiaomi Redmi 14C 256/4 GB', marca: 'Xiaomi' }),
      modelo({ modelCode: 'XT2535 (g06)', nombre: 'Motorola Moto G06 64gb', marca: 'Motorola' }),
      modelo(),
    ])
    expect(r.marcas).toEqual(['Motorola', 'Samsung', 'Xiaomi'])
  })

  it('ordena los modelos por marca y nombre', () => {
    const r = agruparCatalogo([
      modelo({ modelCode: 'xi002', nombre: 'Xiaomi Redmi 14C 256/4 GB', marca: 'Xiaomi' }),
      modelo({ modelCode: 'XT2535 (g06)', nombre: 'Motorola Moto G06 64gb', marca: 'Motorola' }),
    ])
    expect(r.modelos.map(m => m.marca)).toEqual(['Motorola', 'Xiaomi'])
  })
})
