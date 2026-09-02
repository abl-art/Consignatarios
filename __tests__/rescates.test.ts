import { describe, it, expect } from 'vitest'
import {
  armarRescates,
  filtrarRescatesPorFecha,
  contarPorEstado,
  pipelineRescates,
  type RescateRaw,
  type TraceEvento,
} from '@/lib/rescates'

const AHORA = new Date('2026-09-02T12:00:00-03:00')

function ev(evento: string, fecha: string, extra: Partial<TraceEvento> = {}): TraceEvento {
  return { evento, fecha, ...extra }
}

function raw(orderNumber: string, traces: TraceEvento[], extra: Partial<RescateRaw> = {}): RescateRaw {
  return {
    orderNumber,
    clienteNombre: 'Juan  Pérez ',
    clienteDni: '12345678',
    clienteTelefono: '3511234567',
    producto: 'Moto G06',
    ciudad: 'Córdoba',
    provincia: 'Córdoba',
    tracking: '360003081525590',
    traces,
    ...extra,
  }
}

describe('armarRescates', () => {
  it('clasifica rendido cuando hay EnvioRendido después de la solicitud', () => {
    const [r] = armarRescates([raw('SO-QQH8Z4', [
      ev('OrdenDeEnvioCreada', '2026-08-01T10:00:00-03:00'),
      ev('SolicitudDeRescate', '2026-08-14T09:00:00-03:00'),
      ev('Rescate', '2026-08-20T09:00:00-03:00', { ciclo: 'Drop' }),
      ev('EnvioRendido', '2026-08-27T09:00:00-03:00', { ciclo: 'Drop' }),
    ])], AHORA)
    expect(r.estado).toBe('rendido')
    // terminal: días de solicitud a resolución, no hasta hoy
    expect(r.dias).toBe(13)
    expect(r.ultimoEvento).toBe('EnvioRendido')
  })

  it('clasifica entregado cuando el envío se entregó igual después de pedir el rescate', () => {
    const [r] = armarRescates([raw('SO-FGDU2R', [
      ev('SolicitudDeRescate', '2026-08-20T09:00:00-03:00'),
      ev('Visita', '2026-08-20T14:00:00-03:00', { descripcion: 'Entregado' }),
      ev('EnvioEntregado', '2026-08-20T15:00:00-03:00', { descripcion: 'Entregado' }),
    ])], AHORA)
    expect(r.estado).toBe('entregado')
    expect(r.ultimoEvento).toBe('EnvioEntregado — Entregado')
  })

  it('clasifica en_viaje cuando hay movimiento posterior al Rescate', () => {
    const [r] = armarRescates([raw('SO-ZUTBD5', [
      ev('SolicitudDeRescate', '2026-08-27T09:00:00-03:00'),
      ev('Rescate', '2026-08-28T09:00:00-03:00', { ciclo: 'Drop' }),
      ev('ExpedicionHojaDeRutaDeViaje', '2026-09-02T09:00:00-03:00', { ciclo: 'Drop' }),
    ])], AHORA)
    expect(r.estado).toBe('en_viaje')
    // activo: días desde la solicitud hasta hoy
    expect(r.dias).toBe(6)
  })

  it('clasifica rescatado cuando el Rescate es el último movimiento', () => {
    const [r] = armarRescates([raw('SO-D7AGTQ', [
      ev('SolicitudDeRescate', '2026-08-17T09:00:00-03:00'),
      ev('Rescate', '2026-08-27T09:00:00-03:00', { ciclo: 'Drop' }),
    ])], AHORA)
    expect(r.estado).toBe('rescatado')
  })

  it('clasifica solicitado cuando Andreani aún no ejecutó el rescate', () => {
    const [r] = armarRescates([raw('SO-NUEVO1', [
      ev('EnvioConsolidado', '2026-08-25T09:00:00-03:00'),
      ev('SolicitudDeRescate', '2026-09-01T09:00:00-03:00'),
    ])], AHORA)
    expect(r.estado).toBe('solicitado')
    expect(r.dias).toBe(1)
  })

  it('el movimiento previo a la solicitud no cuenta como viaje de vuelta', () => {
    const [r] = armarRescates([raw('SO-PREVIO', [
      ev('EnvioConsolidado', '2026-08-10T09:00:00-03:00'),
      ev('ExpedicionHojaDeRutaDeViaje', '2026-08-11T09:00:00-03:00'),
      ev('SolicitudDeRescate', '2026-09-01T09:00:00-03:00'),
    ])], AHORA)
    expect(r.estado).toBe('solicitado')
  })

  it('ignora shipments sin SolicitudDeRescate y normaliza cliente/destino', () => {
    const rescates = armarRescates([
      raw('SO-SIN', [ev('EnvioEntregado', '2026-08-01T09:00:00-03:00')]),
      raw('SO-CON', [ev('SolicitudDeRescate', '2026-08-30T09:00:00-03:00')]),
    ], AHORA)
    expect(rescates.map(r => r.orderNumber)).toEqual(['SO-CON'])
    expect(rescates[0].cliente).toBe('Juan Pérez')
    expect(rescates[0].destino).toBe('Córdoba, Córdoba')
  })

  it('ordena activos primero y por días descendente dentro del estado', () => {
    const rescates = armarRescates([
      raw('SO-REND', [
        ev('SolicitudDeRescate', '2026-08-14T09:00:00-03:00'),
        ev('EnvioRendido', '2026-08-27T09:00:00-03:00'),
      ]),
      raw('SO-SOL-VIEJO', [ev('SolicitudDeRescate', '2026-08-20T09:00:00-03:00')]),
      raw('SO-SOL-NUEVO', [ev('SolicitudDeRescate', '2026-09-01T09:00:00-03:00')]),
    ], AHORA)
    expect(rescates.map(r => r.orderNumber)).toEqual(['SO-SOL-VIEJO', 'SO-SOL-NUEVO', 'SO-REND'])
  })
})

describe('filtrarRescatesPorFecha', () => {
  const rescates = armarRescates([
    raw('SO-A', [ev('SolicitudDeRescate', '2026-08-14T09:00:00-03:00')]),
    raw('SO-B', [ev('SolicitudDeRescate', '2026-08-20T09:00:00-03:00')]),
    raw('SO-C', [ev('SolicitudDeRescate', '2026-08-27T09:00:00-03:00')]),
  ], AHORA)

  it('filtra por rango inclusive sobre la fecha de solicitud', () => {
    expect(filtrarRescatesPorFecha(rescates, '2026-08-20', '2026-08-27').map(r => r.orderNumber).sort())
      .toEqual(['SO-B', 'SO-C'])
  })

  it('desde o hasta vacíos no limitan', () => {
    expect(filtrarRescatesPorFecha(rescates, '', '2026-08-14')).toHaveLength(1)
    expect(filtrarRescatesPorFecha(rescates, '2026-08-27', '')).toHaveLength(1)
    expect(filtrarRescatesPorFecha(rescates, '', '')).toHaveLength(3)
  })
})

describe('pipelineRescates', () => {
  it('promedia cada tramo solo con los rescates que pasaron por ambos hitos', () => {
    const rescates = armarRescates([
      // flujo completo: 2d a rescate, 1d a viaje, 3d a rendido (total 6)
      raw('SO-FULL', [
        ev('SolicitudDeRescate', '2026-08-10T09:00:00-03:00'),
        ev('Rescate', '2026-08-12T09:00:00-03:00', { ciclo: 'Drop' }),
        ev('EnvioConsolidado', '2026-08-13T09:00:00-03:00', { ciclo: 'Drop' }),
        ev('EnvioRendido', '2026-08-16T09:00:00-03:00', { ciclo: 'Drop' }),
      ]),
      // flujo completo: 4d a rescate, 2d a viaje, 1d a rendido (total 7)
      raw('SO-FULL2', [
        ev('SolicitudDeRescate', '2026-08-10T09:00:00-03:00'),
        ev('Rescate', '2026-08-14T09:00:00-03:00', { ciclo: 'Drop' }),
        ev('ExpedicionHojaDeRutaDeViaje', '2026-08-16T09:00:00-03:00', { ciclo: 'Drop' }),
        ev('EnvioRendido', '2026-08-17T09:00:00-03:00', { ciclo: 'Drop' }),
      ]),
      // rescatado sin despacho: solo aporta al tramo solicitado→rescatado (6d)
      raw('SO-STUCK', [
        ev('SolicitudDeRescate', '2026-08-20T09:00:00-03:00'),
        ev('Rescate', '2026-08-26T09:00:00-03:00', { ciclo: 'Drop' }),
      ]),
      // entregado igual: no aporta a ningún tramo de vuelta
      raw('SO-ENTREGADO', [
        ev('SolicitudDeRescate', '2026-08-20T09:00:00-03:00'),
        ev('EnvioEntregado', '2026-08-21T09:00:00-03:00', { descripcion: 'Entregado' }),
      ]),
    ], AHORA)

    const p = pipelineRescates(rescates)
    expect(p.tramos).toEqual([
      { de: 'solicitado', a: 'rescatado', promedioDias: 4, muestras: 3 },
      { de: 'rescatado', a: 'en_viaje', promedioDias: 1.5, muestras: 2 },
      { de: 'en_viaje', a: 'rendido', promedioDias: 2, muestras: 2 },
    ])
    expect(p.total).toEqual({ promedioDias: 6.5, muestras: 2 })
  })

  it('redondea a un decimal', () => {
    const rescates = armarRescates([
      raw('SO-X', [
        ev('SolicitudDeRescate', '2026-08-10T09:00:00-03:00'),
        ev('Rescate', '2026-08-11T17:00:00-03:00', { ciclo: 'Drop' }),
      ]),
    ], AHORA)
    // 32 horas = 1.333… días → 1.3
    expect(pipelineRescates(rescates).tramos[0].promedioDias).toBe(1.3)
  })

  it('sin muestras devuelve null', () => {
    const p = pipelineRescates([])
    expect(p.tramos.every(t => t.promedioDias === null && t.muestras === 0)).toBe(true)
    expect(p.total).toEqual({ promedioDias: null, muestras: 0 })
  })
})

describe('contarPorEstado', () => {
  it('devuelve cantidad y porcentaje redondeado por estado', () => {
    const rescates = armarRescates([
      raw('SO-1', [ev('SolicitudDeRescate', '2026-08-14T09:00:00-03:00'), ev('EnvioRendido', '2026-08-20T09:00:00-03:00')]),
      raw('SO-2', [ev('SolicitudDeRescate', '2026-08-14T09:00:00-03:00'), ev('EnvioRendido', '2026-08-21T09:00:00-03:00')]),
      raw('SO-3', [ev('SolicitudDeRescate', '2026-08-30T09:00:00-03:00')]),
    ], AHORA)
    const resumen = contarPorEstado(rescates)
    expect(resumen.find(r => r.estado === 'rendido')).toEqual({ estado: 'rendido', cantidad: 2, pct: 67 })
    expect(resumen.find(r => r.estado === 'solicitado')).toEqual({ estado: 'solicitado', cantidad: 1, pct: 33 })
    expect(resumen.find(r => r.estado === 'entregado')).toEqual({ estado: 'entregado', cantidad: 0, pct: 0 })
  })

  it('con lista vacía todos los porcentajes son 0', () => {
    expect(contarPorEstado([]).every(r => r.cantidad === 0 && r.pct === 0)).toBe(true)
  })
})
