import { describe, expect, it } from 'vitest'
import { buscarEnvios, type FuentesBusqueda } from '@/lib/buscador-envios'

function fuentes(sobre: Partial<FuentesBusqueda> = {}): FuentesBusqueda {
  return {
    alertas: [],
    demoras: [],
    arrepentimientos: [],
    rescates: [],
    siniestros: [],
    siniestrosWh: [],
    ...sobre,
  }
}

const DEMORA = {
  orderNumber: 'SO-DEM001',
  cliente: 'Juan Pérez',
  dni: '28456123',
  tracking: '360001234567',
  producto: 'Moto G06',
  metodo: 'domicilio' as const,
  diasDemora: 9,
}

describe('buscarEnvios', () => {
  it('con menos de 4 caracteres útiles no busca', () => {
    expect(buscarEnvios('284', fuentes({ demoras: [DEMORA] }))).toEqual([])
    expect(buscarEnvios('  2 .8-4  ', fuentes({ demoras: [DEMORA] }))).toEqual([])
  })

  it('encuentra por DNI en demoras', () => {
    const r = buscarEnvios('28456123', fuentes({ demoras: [DEMORA] }))
    expect(r).toHaveLength(1)
    expect(r[0].tab).toBe('demoras')
    expect(r[0].titulo).toBe('Juan Pérez')
    expect(r[0].orden).toBe('SO-DEM001')
  })

  it('normaliza puntos, espacios y guiones del query', () => {
    const r = buscarEnvios('28.456.123', fuentes({ demoras: [DEMORA] }))
    expect(r).toHaveLength(1)
  })

  it('matchea tracking por fragmento (contains)', () => {
    const r = buscarEnvios('001234', fuentes({ demoras: [DEMORA] }))
    expect(r).toHaveLength(1)
  })

  it('matchea orderNumber sin distinguir mayúsculas ni guiones', () => {
    const alerta = { orderNumber: 'SO-ABC999', cliente: 'Ana López', dni: null, tracking: null, producto: null, razon: 'sin pedido warehouse', diasPendiente: 3 }
    const r = buscarEnvios('so-abc999', fuentes({ alertas: [alerta] }))
    expect(r).toHaveLength(1)
    expect(r[0].tab).toBe('alertas')
  })

  it('encuentra por IMEI en siniestros warehouse', () => {
    const wh = { id: 'uuid-1', producto: 'Moto G77', imei: '350123456789012', tipo: 'extraviado' as const, estado: 'abierto' as const, notaCredito: false }
    const r = buscarEnvios('350123456789012', fuentes({ siniestrosWh: [wh] }))
    expect(r).toHaveLength(1)
    expect(r[0].tab).toBe('siniestros-warehouse')
  })

  it('agrupa resultados de varias pestañas en el orden de las tabs', () => {
    const rescate = { orderNumber: 'SO-DEM001', cliente: 'Juan Pérez', dni: '28456123', tracking: '360009999999', producto: 'Moto G06', estado: 'en_viaje' as const, motivo: 'No Entregado' }
    const arrep = { id: 'a1', nombre: 'Juan Pérez', dni: '28456123', orderNumber: 'SO-OTRA', tracking: null, producto: null, estado: 'pendiente' as const, fulfillment: null }
    const r = buscarEnvios('28456123', fuentes({ rescates: [rescate], demoras: [DEMORA], arrepentimientos: [arrep] }))
    expect(r.map(x => x.tab)).toEqual(['demoras', 'arrepentimientos', 'rescates'])
  })

  it('arrepentimiento pendiente lleva acción con id y tracking; resuelto no', () => {
    const pend = { id: 'a1', nombre: 'Juan', dni: '30111222', orderNumber: null, tracking: '360', producto: null, estado: 'pendiente' as const, fulfillment: 'expedido' }
    const hecha = { ...pend, id: 'a2', estado: 'confirmada' as const }
    const r = buscarEnvios('30111222', fuentes({ arrepentimientos: [pend, hecha] }))
    expect(r).toHaveLength(2)
    expect(r[0].accion).toEqual({ tipo: 'arrepentimiento', id: 'a1', tracking: '360' })
    expect(r[1].accion).toBeNull()
  })

  it('demora lleva acción con su tracking', () => {
    const r = buscarEnvios('28456123', fuentes({ demoras: [DEMORA] }))
    expect(r[0].accion).toEqual({ tipo: 'demora', tracking: '360001234567' })
  })

  it('siniestro de distribución lleva acción de nota de crédito con el estado actual', () => {
    const sin = { orderNumber: 'SO-SIN01', cliente: 'Caro Gómez', dni: '27999888', tracking: '360111', producto: 'Note 14', notaCredito: false, dias: 12 }
    const r = buscarEnvios('27999888', fuentes({ siniestros: [sin] }))
    expect(r[0].accion).toEqual({ tipo: 'siniestro-nc', tracking: '360111', notaCredito: false })
  })

  it('siniestro warehouse abierto lleva acción resolver; resuelto no lleva acción', () => {
    const abierto = { id: 'w1', producto: 'Buds 6', imei: '350123456789012', tipo: 'roto' as const, estado: 'abierto' as const, notaCredito: false }
    const resuelto = { ...abierto, id: 'w2', estado: 'resuelto' as const }
    const r = buscarEnvios('350123456789012', fuentes({ siniestrosWh: [abierto, resuelto] }))
    expect(r[0].accion).toEqual({ tipo: 'siniestro-wh', id: 'w1' })
    expect(r[1].accion).toBeNull()
  })

  it('rescate no lleva acción y muestra estado legible', () => {
    const rescate = { orderNumber: 'SO-R1', cliente: 'Luis', dni: '31000111', tracking: '360222', producto: null, estado: 'en_viaje' as const, motivo: null }
    const r = buscarEnvios('31000111', fuentes({ rescates: [rescate] }))
    expect(r[0].accion).toBeNull()
    expect(r[0].estado).toContain('En viaje')
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(buscarEnvios('99999999', fuentes({ demoras: [DEMORA] }))).toEqual([])
  })
})
