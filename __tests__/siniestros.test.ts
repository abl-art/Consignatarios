import { describe, it, expect } from 'vitest'
import {
  armarSiniestros,
  armarSiniestrosManuales,
  ordenarSiniestros,
  type SeguimientoSiniestro,
  type SiniestroRaw,
} from '@/lib/siniestros'
import type { TraceEvento } from '@/lib/rescates'

const AHORA = new Date('2026-09-02T12:00:00-03:00')

function ev(evento: string, fecha: string, descripcion?: string): TraceEvento {
  return { evento, fecha, ...(descripcion ? { descripcion } : {}) }
}

function raw(orderNumber: string, traces: TraceEvento[], extra: Partial<SiniestroRaw> = {}): SiniestroRaw {
  return {
    orderNumber,
    clienteNombre: 'Ana  Gómez',
    clienteDni: '30111222',
    clienteTelefono: '3510000000',
    producto: 'Samsung Galaxy A17 5G',
    ciudad: 'Rosario',
    provincia: 'Santa Fe',
    tracking: '360003067196850',
    imei: '358377640746996',
    trustonicStatus: 'locked',
    gocuotasOrderId: '18381863',
    gocuotasStatus: 'discarded',
    gocuotasDiscardedAt: '2026-08-28T10:00:00-03:00',
    envioAt: '2026-08-12T09:00:00-03:00',
    traces,
    ...extra,
  }
}

function seg(tracking: string, extra: Partial<SeguimientoSiniestro> = {}): SeguimientoSiniestro {
  return { tracking, notaCredito: false, createdAt: '2026-09-01T10:00:00-03:00', ...extra }
}

describe('armarSiniestros', () => {
  it('detecta el evento Siniestro, el cierre posterior y el estado Trustonic', () => {
    const [s] = armarSiniestros([raw('SO-HKZY64', [
      ev('EnvioEntregado', '2026-08-18T15:00:00-03:00', 'Entregado'),
      ev('Siniestro', '2026-08-28T09:00:00-03:00', 'Siniestrado / Extravío'),
      ev('CierreDeEntidad', '2026-08-31T09:00:00-03:00', 'Siniestrado / Extravío'),
    ])], AHORA)
    expect(s.siniestroAt).toBe('2026-08-28T09:00:00-03:00')
    expect(s.cerradoAt).toBe('2026-08-31T09:00:00-03:00')
    expect(s.entregadoAntes).toBe(true)
    expect(s.informadoAndreani).toBe(true)
    expect(s.trustonicStatus).toBe('locked')
    expect(s.dias).toBe(5)
    expect(s.ordenActiva).toBe(false)
    expect(s.cliente).toBe('Ana Gómez')
  })

  it('detecta por descripción aunque el evento no se llame Siniestro', () => {
    const [s] = armarSiniestros([raw('SO-DESC', [
      ev('CierreDeEntidad', '2026-08-30T09:00:00-03:00', 'Siniestrado / Extravío'),
    ])], AHORA)
    expect(s.siniestroAt).toBe('2026-08-30T09:00:00-03:00')
    // el mismo evento que declara el siniestro puede ser el cierre
    expect(s.cerradoAt).toBe('2026-08-30T09:00:00-03:00')
    expect(s.entregadoAntes).toBe(false)
  })

  it('sin cierre queda abierto y sin nota de crédito por default', () => {
    const [s] = armarSiniestros([raw('SO-ABIERTO', [
      ev('Siniestro', '2026-08-29T09:00:00-03:00', 'Siniestrado / Extravío'),
    ])], AHORA)
    expect(s.cerradoAt).toBeNull()
    expect(s.notaCredito).toBe(false)
  })

  it('aplica el tilde de nota de crédito del seguimiento por tracking', () => {
    const [s] = armarSiniestros(
      [raw('SO-NC', [ev('Siniestro', '2026-08-28T09:00:00-03:00', 'Siniestrado / Extravío')])],
      AHORA,
      [seg('360003067196850', { notaCredito: true })],
    )
    expect(s.notaCredito).toBe(true)
  })

  it('ignora envíos sin siniestro y ordena del más reciente al más viejo', () => {
    const siniestros = armarSiniestros([
      raw('SO-OK', [ev('EnvioEntregado', '2026-08-18T09:00:00-03:00', 'Entregado')]),
      raw('SO-VIEJO', [ev('Siniestro', '2026-08-10T09:00:00-03:00', 'Siniestrado / Extravío')]),
      raw('SO-NUEVO', [ev('Siniestro', '2026-08-28T09:00:00-03:00', 'Siniestrado / Extravío')]),
    ], AHORA)
    expect(siniestros.map(s => s.orderNumber)).toEqual(['SO-NUEVO', 'SO-VIEJO'])
  })
})

describe('armarSiniestrosManuales', () => {
  const trackingManual = '360009999999990'

  it('arma el siniestro cargado a mano sin evento de Andreani', () => {
    const [s] = armarSiniestrosManuales(
      [raw('SO-MANUAL', [ev('EnvioConsolidado', '2026-08-20T09:00:00-03:00')], { tracking: trackingManual })],
      AHORA,
      [seg(trackingManual)],
    )
    expect(s.informadoAndreani).toBe(false)
    expect(s.siniestroAt).toBeNull()
    expect(s.cerradoAt).toBeNull()
    // días desde la carga manual (1/9)
    expect(s.dias).toBe(1)
    expect(s.cargadoAt).toBe('2026-09-01T10:00:00-03:00')
  })

  it('excluye trackings ya listados como automáticos', () => {
    const manuales = armarSiniestrosManuales(
      [raw('SO-DUP', [], { tracking: trackingManual })],
      AHORA,
      [seg(trackingManual)],
      new Set([trackingManual]),
    )
    expect(manuales).toHaveLength(0)
  })

  it('si Andreani ya lo informó en los traces, el tilde de informado aparece igual', () => {
    const [s] = armarSiniestrosManuales(
      [raw('SO-YAINF', [ev('Siniestro', '2026-08-30T09:00:00-03:00', 'Siniestrado / Extravío')], { tracking: trackingManual })],
      AHORA,
      [seg(trackingManual)],
    )
    expect(s.informadoAndreani).toBe(true)
    expect(s.siniestroAt).toBe('2026-08-30T09:00:00-03:00')
  })
})

describe('ordenarSiniestros', () => {
  it('ordena por fecha del siniestro, o del envío para los manuales', () => {
    const autos = armarSiniestros([
      raw('SO-AUTO', [ev('Siniestro', '2026-08-28T09:00:00-03:00', 'Siniestrado / Extravío')]),
    ], AHORA)
    const manuales = armarSiniestrosManuales(
      [
        raw('SO-MAN-VIEJO', [], { tracking: 'T2', envioAt: '2026-04-10T09:00:00-03:00' }),
        raw('SO-MAN-NUEVO', [], { tracking: 'T3', envioAt: '2026-08-30T09:00:00-03:00' }),
      ],
      AHORA,
      [seg('T2'), seg('T3')],
    )
    const orden = ordenarSiniestros([...autos, ...manuales]).map(s => s.orderNumber)
    expect(orden).toEqual(['SO-MAN-NUEVO', 'SO-AUTO', 'SO-MAN-VIEJO'])
  })

  it('las cargas masivas con la misma fecha de envío desempatan por tracking descendente', () => {
    const manuales = armarSiniestrosManuales(
      [
        raw('SO-A', [], { tracking: '360002000000001', envioAt: '2026-08-01T09:00:00-03:00' }),
        raw('SO-B', [], { tracking: '360003000000001', envioAt: '2026-08-01T09:00:00-03:00' }),
      ],
      AHORA,
      [seg('360002000000001'), seg('360003000000001')],
    )
    expect(ordenarSiniestros(manuales).map(s => s.orderNumber)).toEqual(['SO-B', 'SO-A'])
  })
})
