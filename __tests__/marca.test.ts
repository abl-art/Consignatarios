import { describe, it, expect } from 'vitest'
import { normalizarMarca } from '@/lib/marca'

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
