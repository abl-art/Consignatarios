import { describe, expect, it } from 'vitest'
import { armarDemoras, resumenDemoras, type DemoraRaw } from '@/lib/demoras'

const AHORA = new Date('2026-10-01T12:00:00Z')

function raw(sobre: Partial<DemoraRaw>): DemoraRaw {
  return {
    orderNumber: 'SO-TEST',
    clienteNombre: 'Juan  Pérez',
    clienteDni: '30111222',
    clienteTelefono: '351555',
    producto: 'Moto G06',
    ciudad: 'Córdoba',
    provincia: 'Córdoba',
    tracking: 'TRK1',
    gocuotasOrderId: '123',
    gocuotasStatus: 'delivered',
    gocuotasDiscardedAt: null,
    metodo: 'domicilio',
    trustonicStatus: 'locked',
    confirmadaAt: '2026-09-20T10:00:00Z', // 11 días antes de AHORA
    traces: [{ evento: 'Distribucion', fecha: '2026-09-25T10:00:00Z' }],
    ...sobre,
  }
}

describe('armarDemoras', () => {
  it('domicilio entra con más de 7 días, sucursal recién con más de 14', () => {
    const filas = [
      raw({ orderNumber: 'DOM-11D' }), // domicilio, 11 días → entra
      raw({ orderNumber: 'SUC-11D', metodo: 'sucursal' }), // sucursal, 11 días → NO
      raw({ orderNumber: 'SUC-16D', metodo: 'sucursal', confirmadaAt: '2026-09-15T10:00:00Z' }), // 16 días → entra
      raw({ orderNumber: 'DOM-6D', confirmadaAt: '2026-09-25T10:00:00Z' }), // 6 días → NO
    ]
    const nums = armarDemoras(filas, AHORA).map(d => d.orderNumber)
    expect(nums).toEqual(['SUC-16D', 'DOM-11D']) // orden: más días primero
  })

  it('excluye entregados, rescates en traces y rescates cargados a mano', () => {
    const filas = [
      raw({ orderNumber: 'ENTREGADO', traces: [{ evento: 'EnvioEntregado', fecha: '2026-09-22T10:00:00Z' }] }),
      raw({ orderNumber: 'RESCATE', traces: [{ evento: 'SolicitudDeRescate', fecha: '2026-09-22T10:00:00Z' }] }),
      raw({ orderNumber: 'MANUAL', tracking: 'TRK-MANUAL' }),
      raw({ orderNumber: 'QUEDA' }),
    ]
    const demoras = armarDemoras(filas, AHORA, new Set(['TRK-MANUAL']))
    expect(demoras.map(d => d.orderNumber)).toEqual(['QUEDA'])
  })

  it('excluye entregas registradas solo en la descripción y envíos en rendición', () => {
    const filas = [
      raw({ orderNumber: 'VISITA-ENTREGADO', traces: [{ evento: 'Visita', fecha: '2026-09-22T10:00:00Z', descripcion: 'Entregado / Entregado por Mostrador' }] }),
      raw({ orderNumber: 'RECTIF-ENTREGADO', traces: [{ evento: 'RectificacionDeMotivo', fecha: '2026-09-22T10:00:00Z', descripcion: 'Entregado' }] }),
      raw({ orderNumber: 'RENDIDO', traces: [{ evento: 'EnvioRendido', fecha: '2026-09-22T10:00:00Z' }] }),
      raw({ orderNumber: 'EN-RENDICION', traces: [{ evento: 'InicioCicloDeRendicion', fecha: '2026-09-22T10:00:00Z' }] }),
      // "No entregado" NO es una entrega: tiene que quedar en la lista
      raw({ orderNumber: 'NO-ENTREGADO', traces: [{ evento: 'Visita', fecha: '2026-09-22T10:00:00Z', descripcion: 'No entregado / Ausente' }] }),
    ]
    const demoras = armarDemoras(filas, AHORA)
    expect(demoras.map(d => d.orderNumber)).toEqual(['NO-ENTREGADO'])
  })

  it('calcula días, último evento, movimiento y normaliza cliente', () => {
    const [d] = armarDemoras([raw({})], AHORA)
    expect(d.diasDemora).toBe(11)
    expect(d.cliente).toBe('Juan Pérez')
    expect(d.ultimoEvento).toBe('Distribucion')
    expect(d.diasSinMovimiento).toBe(6)
    expect(d.ordenActiva).toBe(true)
    expect(d.trustonicStatus).toBe('locked')
    expect(d.gocuotasOrderId).toBe('123')
    expect(d.destino).toBe('Córdoba, Córdoba')
  })

  it('sin paid_at o sin método conocido no entra; sin traces muestra aviso', () => {
    const filas = [
      raw({ orderNumber: 'SIN-PAID', confirmadaAt: null }),
      raw({ orderNumber: 'SIN-METODO', metodo: null }),
      raw({ orderNumber: 'SIN-TRACES', traces: [] }),
    ]
    const demoras = armarDemoras(filas, AHORA)
    expect(demoras.map(d => d.orderNumber)).toEqual(['SIN-TRACES'])
    expect(demoras[0].ultimoEvento).toBe('Sin eventos de Andreani')
    expect(demoras[0].diasSinMovimiento).toBeNull()
  })

  it('resumen cuenta por método y críticos de más de 21 días', () => {
    const filas = [
      raw({ orderNumber: 'A' }),
      raw({ orderNumber: 'B', metodo: 'sucursal', confirmadaAt: '2026-09-01T10:00:00Z' }), // 30 días
      raw({ orderNumber: 'C', confirmadaAt: '2026-09-05T10:00:00Z' }), // 26 días
    ]
    const r = resumenDemoras(armarDemoras(filas, AHORA))
    expect(r).toEqual({ total: 3, domicilio: 2, sucursal: 1, criticos: 2 })
  })
})
