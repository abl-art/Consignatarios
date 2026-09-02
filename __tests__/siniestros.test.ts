import { describe, it, expect } from 'vitest'
import { armarSiniestros, type SiniestroRaw } from '@/lib/siniestros'
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
    gocuotasOrderId: '18381863',
    gocuotasStatus: 'discarded',
    gocuotasDiscardedAt: '2026-08-28T10:00:00-03:00',
    traces,
    ...extra,
  }
}

describe('armarSiniestros', () => {
  it('detecta el evento Siniestro y el cierre posterior', () => {
    const [s] = armarSiniestros([raw('SO-HKZY64', [
      ev('EnvioEntregado', '2026-08-18T15:00:00-03:00', 'Entregado'),
      ev('Siniestro', '2026-08-28T09:00:00-03:00', 'Siniestrado / Extravío'),
      ev('CierreDeEntidad', '2026-08-31T09:00:00-03:00', 'Siniestrado / Extravío'),
    ])], AHORA)
    expect(s.siniestroAt).toBe('2026-08-28T09:00:00-03:00')
    expect(s.cerradoAt).toBe('2026-08-31T09:00:00-03:00')
    expect(s.entregadoAntes).toBe(true)
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

  it('sin cierre queda abierto', () => {
    const [s] = armarSiniestros([raw('SO-ABIERTO', [
      ev('EnvioConsolidado', '2026-08-20T09:00:00-03:00'),
      ev('Siniestro', '2026-08-29T09:00:00-03:00', 'Siniestrado / Extravío'),
    ])], AHORA)
    expect(s.cerradoAt).toBeNull()
    expect(s.entregadoAntes).toBe(false)
  })

  it('ignora envíos sin siniestro y ordena del más reciente al más viejo', () => {
    const siniestros = armarSiniestros([
      raw('SO-OK', [ev('EnvioEntregado', '2026-08-18T09:00:00-03:00', 'Entregado')]),
      raw('SO-VIEJO', [ev('Siniestro', '2026-08-10T09:00:00-03:00', 'Siniestrado / Extravío')]),
      raw('SO-NUEVO', [ev('Siniestro', '2026-08-28T09:00:00-03:00', 'Siniestrado / Extravío')]),
    ], AHORA)
    expect(siniestros.map(s => s.orderNumber)).toEqual(['SO-NUEVO', 'SO-VIEJO'])
  })

  it('una Visita con descripción de siniestro también cuenta', () => {
    const [s] = armarSiniestros([raw('SO-VISITA', [
      ev('Visita', '2026-08-25T09:00:00-03:00', 'Siniestrado / Robo'),
    ])], AHORA)
    expect(s.siniestroAt).toBe('2026-08-25T09:00:00-03:00')
  })
})
