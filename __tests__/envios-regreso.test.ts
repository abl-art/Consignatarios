import { describe, it, expect } from 'vitest'
import { clasificarRegreso, elegirConsultas, type ConsultaPrevia } from '@/lib/envios-regreso'

const timeline = (estadoActual: string | null, ultimoEvento?: string) => ({
  estadoActual,
  eventos: ultimoEvento ? [{ estado: 'Ingresado', orden: 1, fecha: '2026-11-01 10:00', texto: '', sucursal: null }, { estado: ultimoEvento, orden: 5, fecha: '2026-11-10 10:00', texto: '', sucursal: null }] : [],
})

describe('clasificarRegreso', () => {
  it('Entregado y Retirado (retiro en sucursal) → entregado', () => {
    expect(clasificarRegreso(timeline('Entregado'))).toBe('entregado')
    expect(clasificarRegreso(timeline('Retirado'))).toBe('entregado')
  })

  it('No entregado / En devolución / Devuelto / Rehusado → pendiente_regreso', () => {
    expect(clasificarRegreso(timeline('No entregado'))).toBe('pendiente_regreso')
    expect(clasificarRegreso(timeline('En devolución'))).toBe('pendiente_regreso')
    expect(clasificarRegreso(timeline('Devuelto'))).toBe('pendiente_regreso')
    expect(clasificarRegreso(timeline('Rehusado Se Niega A Firmar'))).toBe('pendiente_regreso')
  })

  it('"No entregado" NO cuenta como entregado (el contains no alcanza al exacto)', () => {
    expect(clasificarRegreso(timeline('No entregado'))).not.toBe('entregado')
  })

  it('estados de viaje normal → en_viaje', () => {
    expect(clasificarRegreso(timeline('En distribución'))).toBe('en_viaje')
    expect(clasificarRegreso(timeline('En sucursal'))).toBe('en_viaje')
    expect(clasificarRegreso(timeline('Pendiente de ingreso'))).toBe('en_viaje')
  })

  it('sin estadoActual decide por el último evento del timeline', () => {
    expect(clasificarRegreso(timeline(null, 'En devolución'))).toBe('pendiente_regreso')
    expect(clasificarRegreso(timeline(null, 'Entregado'))).toBe('entregado')
    expect(clasificarRegreso({ estadoActual: null, eventos: [] })).toBe('en_viaje')
  })
})

describe('elegirConsultas', () => {
  const ahora = new Date('2026-11-17T12:00:00Z')
  const previa = (tracking: string, estado: ConsultaPrevia['estado'], consultadoAt: string, recibidoAt: string | null = null): ConsultaPrevia =>
    ({ tracking, estado, consultadoAt, recibidoAt })

  it('prioriza los nunca consultados y respeta el tope', () => {
    const elegidos = elegirConsultas(['a', 'b', 'c'], [previa('b', 'en_viaje', '2026-11-01T00:00:00Z')], 2, ahora)
    expect(elegidos).toEqual(['a', 'c'])
  })

  it('los terminales no se vuelven a consultar', () => {
    const elegidos = elegirConsultas(
      ['ent', 'pend', 'viaje'],
      [
        previa('ent', 'entregado', '2026-10-01T00:00:00Z'),
        previa('pend', 'pendiente_regreso', '2026-10-01T00:00:00Z'),
        previa('viaje', 'en_viaje', '2026-10-01T00:00:00Z'),
      ],
      10,
      ahora,
    )
    expect(elegidos).toEqual(['viaje'])
  })

  it('en_viaje consultado hace menos de 7 días no se re-chequea', () => {
    const elegidos = elegirConsultas(['x'], [previa('x', 'en_viaje', '2026-11-14T00:00:00Z')], 10, ahora)
    expect(elegidos).toEqual([])
  })

  it('los re-chequeos van del más viejo al más nuevo, después de los nuevos', () => {
    const elegidos = elegirConsultas(
      ['nuevo', 'v2', 'v1'],
      [previa('v1', 'en_viaje', '2026-11-01T00:00:00Z'), previa('v2', 'en_viaje', '2026-11-05T00:00:00Z')],
      10,
      ahora,
    )
    expect(elegidos).toEqual(['nuevo', 'v1', 'v2'])
  })
})
