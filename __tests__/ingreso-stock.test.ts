import { describe, it, expect } from 'vitest'
import { evaluarIngreso, necesitaSyncIngreso, ingresoSinRespaldo } from '@/lib/ingreso-stock'

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

describe('necesitaSyncIngreso', () => {
  it('sigue el pedido informado que todavia no ingreso', () => {
    expect(necesitaSyncIngreso({ gocelular: { estado: 'informado' } })).toBe(true)
  })

  it('sigue el pedido marcado a mano como ingresado mientras el deposito no lo confirme', () => {
    // Caso SOLNIK 12/8: alguien tildo "ingreso stock" y el corte viejo (!ingresoStockAt)
    // lo dejaba fuera del sync para siempre, sin entregadoAt y contado como en transito
    expect(necesitaSyncIngreso({
      ingresoStockAt: '2026-08-14T13:33:52.764Z',
      gocelular: { estado: 'informado' },
    })).toBe(true)
  })

  it('deja de seguir el pedido cuando el sync confirmo el ingreso real', () => {
    expect(necesitaSyncIngreso({
      entregadoAt: '2026-08-14T20:18:35.807Z',
      ingresoStockAt: '2026-08-14T20:18:35.807Z',
      gocelular: { estado: 'informado', ingresoDetectadoAt: '2026-08-14T20:18:35.807Z' },
    })).toBe(false)
  })

  it('ignora los pedidos que no se informaron a GOcelular', () => {
    expect(necesitaSyncIngreso({ gocelular: { estado: 'no_enviado' } })).toBe(false)
    expect(necesitaSyncIngreso({})).toBe(false)
  })
})

describe('ingresoSinRespaldo', () => {
  it('marca la discrepancia cuando el deposito no recibio nada', () => {
    expect(ingresoSinRespaldo({
      ingresoStockAt: '2026-08-14T13:33:52.764Z',
      gocelular: { estado: 'informado', unidadesIngresadas: 0, unidadesTotales: 50 },
    })).toBe(true)
  })

  it('marca la discrepancia con ingreso parcial', () => {
    expect(ingresoSinRespaldo({
      ingresoStockAt: '2026-08-14T13:33:52.764Z',
      gocelular: { estado: 'informado', unidadesIngresadas: 30, unidadesTotales: 50 },
    })).toBe(true)
  })

  it('no marca nada si el pedido no fue marcado como ingresado', () => {
    expect(ingresoSinRespaldo({
      gocelular: { estado: 'informado', unidadesIngresadas: 0, unidadesTotales: 50 },
    })).toBe(false)
  })

  it('no marca nada sin datos del intake en GOcelular', () => {
    expect(ingresoSinRespaldo({
      ingresoStockAt: '2026-08-14T13:33:52.764Z',
      gocelular: { estado: 'informado' },
    })).toBe(false)
  })

  it('no marca nada cuando el sync ya confirmo el ingreso', () => {
    expect(ingresoSinRespaldo({
      ingresoStockAt: '2026-08-14T20:18:35.807Z',
      gocelular: { estado: 'informado', ingresoDetectadoAt: '2026-08-14T20:18:35.807Z', unidadesIngresadas: 360, unidadesTotales: 360 },
    })).toBe(false)
  })
})
