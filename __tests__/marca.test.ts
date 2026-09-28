import { describe, it, expect } from 'vitest'
import { normalizarMarca, marcaDeModelo } from '@/lib/marca'

describe('normalizarMarca', () => {
  it('pasa a capitalizado las marcas en mayúsculas largas', () => {
    expect(normalizarMarca('XIAOMI')).toBe('Xiaomi')
  })

  it('respeta siglas cortas y marcas ya bien escritas', () => {
    expect(normalizarMarca('JBL')).toBe('JBL')
    expect(normalizarMarca('Motorola')).toBe('Motorola')
  })

  it('null queda null', () => {
    expect(normalizarMarca(null)).toBe(null)
  })
})

describe('marcaDeModelo', () => {
  it('toma la primera palabra del modelo', () => {
    expect(marcaDeModelo('Motorola Moto G06 4/128GB')).toBe('Motorola')
    expect(marcaDeModelo('JBL Flip 7')).toBe('JBL')
  })

  it('saltea el prefijo de categoría de los addons', () => {
    expect(marcaDeModelo('Auriculares Redmi Buds 6 Play')).toBe('Redmi')
    expect(marcaDeModelo('Parlante JBL GO 4')).toBe('JBL')
    expect(marcaDeModelo('Celular Samsung A17')).toBe('Samsung')
  })

  it('normaliza el casing de la marca', () => {
    expect(marcaDeModelo('XIAOMI Redmi 14C')).toBe('Xiaomi')
  })

  it('sin palabras útiles devuelve Otros', () => {
    expect(marcaDeModelo('Auriculares')).toBe('Otros')
    expect(marcaDeModelo('')).toBe('Otros')
  })
})
