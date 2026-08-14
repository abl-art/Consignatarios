import { describe, it, expect } from 'vitest'
import { evaluarIngreso } from '@/lib/ingreso-stock'

describe('evaluarIngreso', () => {
  it('pedido solo celulares con todos los IMEIs ingresados queda completo', () => {
    const r = evaluarIngreso({ imeisTotales: 360, imeisIngresados: 360, addonsTotales: 0, addonsIngresados: 0 })
    expect(r).toEqual({ completo: true, unidadesIngresadas: 360, unidadesTotales: 360 })
  })

  it('ingreso parcial de celulares reporta progreso sin completar', () => {
    const r = evaluarIngreso({ imeisTotales: 360, imeisIngresados: 120, addonsTotales: 0, addonsIngresados: 0 })
    expect(r).toEqual({ completo: false, unidadesIngresadas: 120, unidadesTotales: 360 })
  })

  it('pedido solo accesorios se completa por cantidades recibidas', () => {
    const r = evaluarIngreso({ imeisTotales: 0, imeisIngresados: 0, addonsTotales: 628, addonsIngresados: 628 })
    expect(r).toEqual({ completo: true, unidadesIngresadas: 628, unidadesTotales: 628 })
  })

  it('pedido mixto requiere ambas partes completas', () => {
    const parcial = evaluarIngreso({ imeisTotales: 360, imeisIngresados: 360, addonsTotales: 628, addonsIngresados: 100 })
    expect(parcial.completo).toBe(false)
    expect(parcial.unidadesIngresadas).toBe(460)
    expect(parcial.unidadesTotales).toBe(988)
    const completo = evaluarIngreso({ imeisTotales: 360, imeisIngresados: 360, addonsTotales: 628, addonsIngresados: 628 })
    expect(completo.completo).toBe(true)
  })

  it('sin datos del intake en GOcelular nunca marca completo', () => {
    const r = evaluarIngreso({ imeisTotales: 0, imeisIngresados: 0, addonsTotales: 0, addonsIngresados: 0 })
    expect(r.completo).toBe(false)
  })

  it('capea sobre-recepciones al total pedido', () => {
    const r = evaluarIngreso({ imeisTotales: 10, imeisIngresados: 12, addonsTotales: 5, addonsIngresados: 9 })
    expect(r).toEqual({ completo: true, unidadesIngresadas: 15, unidadesTotales: 15 })
  })
})
