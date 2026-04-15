import { describe, it, expect } from 'vitest'
import { validarIMEI, formatearMoneda, calcularPrecioVenta, primerDiaHabil } from '@/lib/utils'

describe('validarIMEI', () => {
  it('acepta IMEI de 15 dígitos numéricos', () => {
    expect(validarIMEI('123456789012345')).toBe(true)
  })

  it('rechaza IMEI con letras', () => {
    expect(validarIMEI('12345678901234A')).toBe(false)
  })

  it('rechaza IMEI con menos de 15 dígitos', () => {
    expect(validarIMEI('12345678901234')).toBe(false)
  })

  it('rechaza IMEI con más de 15 dígitos', () => {
    expect(validarIMEI('1234567890123456')).toBe(false)
  })

  it('rechaza string vacío', () => {
    expect(validarIMEI('')).toBe(false)
  })
})

describe('formatearMoneda', () => {
  it('formatea número como pesos argentinos', () => {
    expect(formatearMoneda(1234.5)).toMatch(/1\.234/)
  })

  it('formatea cero', () => {
    expect(formatearMoneda(0)).toMatch(/0/)
  })
})

describe('calcularPrecioVenta', () => {
  it('multiplica precio_costo por multiplicador', () => {
    expect(calcularPrecioVenta(100, 1.8)).toBe(180)
  })

  it('maneja multiplicador 1', () => {
    expect(calcularPrecioVenta(200, 1)).toBe(200)
  })
})

describe('primerDiaHabil', () => {
  it('retorna el 2 si el 1 es domingo', () => {
    // 2023-01-01 era domingo
    const result = primerDiaHabil(2023, 0) // enero 2023
    expect(result.getDate()).toBe(2)
  })

  it('retorna el 3 si el 1 es sábado', () => {
    // 2022-01-01 era sábado
    const result = primerDiaHabil(2022, 0) // enero 2022
    expect(result.getDate()).toBe(3)
  })

  it('retorna el 1 si el 1 es lunes', () => {
    // 2024-01-01 era lunes
    const result = primerDiaHabil(2024, 0) // enero 2024
    expect(result.getDate()).toBe(1)
  })
})
