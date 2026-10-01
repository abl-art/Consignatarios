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
    trustonicUpdatedAt: '2026-09-30T10:00:00Z',
    confirmadaAt: '2026-09-18T10:00:00Z',
    envioCreadoAt: '2026-09-20T09:00:00Z',
    // tracking creado el 20/9 → 11 días hasta AHORA; picking 18/9→20/9 = 2 días
    traces: [{ evento: 'Distribucion', fecha: '2026-09-20T10:00:00Z' }],
    ...sobre,
  }
}

describe('armarDemoras', () => {
  it('umbral único de 14 días desde la creación del tracking', () => {
    const filas = [
      raw({ orderNumber: 'DOM-11D' }), // tracking hace 11 días → NO (≤14)
      raw({ orderNumber: 'DOM-16D', traces: [{ evento: 'Distribucion', fecha: '2026-09-15T10:00:00Z' }] }), // 16 días → entra
      raw({ orderNumber: 'SUC-16D', metodo: 'sucursal', confirmadaAt: '2026-09-10T10:00:00Z', traces: [{ evento: 'Distribucion', fecha: '2026-09-14T10:00:00Z' }] }), // 17 días → entra
      // confirmada hace 25 días pero tracking hace 5: la demora fue de picking, no de entrega
      raw({ orderNumber: 'PICKING-TARDE', confirmadaAt: '2026-09-06T10:00:00Z', traces: [{ evento: 'Distribucion', fecha: '2026-09-26T10:00:00Z' }] }),
    ]
    const nums = armarDemoras(filas, AHORA).map(d => d.orderNumber)
    expect(nums).toEqual(['SUC-16D', 'DOM-16D']) // orden: más días primero
  })

  it('excluye entregados, rescates (traces o manuales) y órdenes anuladas', () => {
    const filas = [
      raw({ orderNumber: 'ENTREGADO', traces: [{ evento: 'EnvioEntregado', fecha: '2026-09-22T10:00:00Z' }] }),
      raw({ orderNumber: 'RESCATE', traces: [{ evento: 'SolicitudDeRescate', fecha: '2026-09-22T10:00:00Z' }] }),
      raw({ orderNumber: 'MANUAL', tracking: 'TRK-MANUAL', traces: [{ evento: 'Distribucion', fecha: '2026-09-14T10:00:00Z' }] }),
      raw({ orderNumber: 'ANULADA-DISCARDED', gocuotasDiscardedAt: '2026-09-21T10:00:00Z', traces: [{ evento: 'Distribucion', fecha: '2026-09-14T10:00:00Z' }] }),
      raw({ orderNumber: 'ANULADA-STATUS', gocuotasStatus: 'discarded', traces: [{ evento: 'Distribucion', fecha: '2026-09-14T10:00:00Z' }] }),
      raw({ orderNumber: 'QUEDA', traces: [{ evento: 'Distribucion', fecha: '2026-09-14T10:00:00Z' }] }),
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
      raw({ orderNumber: 'NO-ENTREGADO', traces: [{ evento: 'Visita', fecha: '2026-09-14T10:00:00Z', descripcion: 'No entregado / Ausente' }] }),
    ]
    const demoras = armarDemoras(filas, AHORA)
    expect(demoras.map(d => d.orderNumber)).toEqual(['NO-ENTREGADO'])
  })

  it('calcula demora de entrega, picking, último evento y normaliza cliente', () => {
    const [d] = armarDemoras([raw({ traces: [{ evento: 'Distribucion', fecha: '2026-09-15T10:00:00Z' }] })], AHORA)
    expect(d.diasDemora).toBe(16) // desde el tracking (15/9)
    expect(d.diasPicking).toBe(0) // confirmación (18/9) posterior al tracking (15/9) → clamp en 0
    expect(d.trackingCreadoAt).toBe('2026-09-15T10:00:00Z')
    expect(d.cliente).toBe('Juan Pérez')
    expect(d.ultimoEvento).toBe('Distribucion')
    expect(d.diasSinMovimiento).toBe(16)
    expect(d.ordenActiva).toBe(true)
    expect(d.trustonicStatus).toBe('locked')
    expect(d.gocuotasOrderId).toBe('123')
    expect(d.destino).toBe('Córdoba, Córdoba')
  })

  it('sin traces usa la creación del envío como fallback del tracking', () => {
    const [d] = armarDemoras([raw({ orderNumber: 'SIN-TRACES', traces: [], envioCreadoAt: '2026-09-14T09:00:00Z' })], AHORA)
    expect(d.orderNumber).toBe('SIN-TRACES')
    expect(d.trackingCreadoAt).toBe('2026-09-14T09:00:00Z')
    expect(d.diasDemora).toBe(17)
    expect(d.ultimoEvento).toBe('Sin eventos de Andreani')
    expect(d.diasSinMovimiento).toBeNull()
  })

  it('resumen cuenta por método y críticos de más de 21 días', () => {
    const filas = [
      raw({ orderNumber: 'A', traces: [{ evento: 'Distribucion', fecha: '2026-09-15T10:00:00Z' }] }),
      raw({ orderNumber: 'B', metodo: 'sucursal', traces: [{ evento: 'Distribucion', fecha: '2026-09-01T10:00:00Z' }] }), // 30 días
      raw({ orderNumber: 'C', traces: [{ evento: 'Distribucion', fecha: '2026-09-05T10:00:00Z' }] }), // 26 días
    ]
    const r = resumenDemoras(armarDemoras(filas, AHORA))
    expect(r).toEqual({ total: 3, domicilio: 2, sucursal: 1, criticos: 2 })
  })
})
