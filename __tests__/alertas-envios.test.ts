import { describe, it, expect } from 'vitest'
import { armarAlertasEnvios, type AlertaEnvioRaw } from '@/lib/alertas-envios'

const AHORA = new Date('2026-08-25T15:00:00.000Z')

function raw(over: Partial<AlertaEnvioRaw> = {}): AlertaEnvioRaw {
  return {
    estado: 'expedido',
    orderNumber: 'SO-UT7BFE',
    clienteNombre: 'Miguel Gallo',
    clienteDni: '42861274',
    clienteTelefono: '3564236012',
    producto: 'Xiaomi Redmi 14C 256/4 GB',
    ciudad: 'SAN FRANCISCO',
    provincia: 'CORDOBA',
    paidAt: '2026-08-14T00:00:00.000Z',
    sentAt: '2026-08-21T11:02:05.384Z',
    ordenWh: '0000068451',
    razon: null,
    tracking: '360003075386040',
    shipmentStatus: 'in_transit',
    shipmentError: null,
    admittedAt: '2026-08-21T00:00:00.000Z',
    ...over,
  }
}

describe('armarAlertasEnvios', () => {
  it('separa requires_attention de expedidos sin IMEI', () => {
    const r = armarAlertasEnvios([raw(), raw({ estado: 'requires_attention', orderNumber: 'SO-XX1' })], AHORA)
    expect(r.expedidosSinImei).toHaveLength(1)
    expect(r.requierenAtencion).toHaveLength(1)
    expect(r.requierenAtencion[0].orderNumber).toBe('SO-XX1')
  })

  it('calcula días pendiente desde la expedición (sentAt)', () => {
    const [a] = armarAlertasEnvios([raw({ sentAt: '2026-08-21T11:02:05.384Z' })], AHORA).expedidosSinImei
    expect(a.diasPendiente).toBe(4)
  })

  it('sin sentAt usa la fecha de pago como base', () => {
    const [a] = armarAlertasEnvios([raw({ estado: 'requires_attention', sentAt: null, paidAt: '2026-08-09T00:00:00.000Z' })], AHORA).requierenAtencion
    expect(a.diasPendiente).toBe(16)
  })

  it('limpia espacios dobles y bordes del nombre del cliente', () => {
    const [a] = armarAlertasEnvios([raw({ clienteNombre: ' Cristian  Amaya ' })], AHORA).expedidosSinImei
    expect(a.cliente).toBe('Cristian Amaya')
  })

  it('arma el destino como ciudad, provincia y tolera faltantes', () => {
    const [a] = armarAlertasEnvios([raw({ ciudad: 'G GREGORES', provincia: 'SANTA CRUZ' })], AHORA).expedidosSinImei
    expect(a.destino).toBe('G GREGORES, SANTA CRUZ')
    const [b] = armarAlertasEnvios([raw({ ciudad: null, provincia: 'SALTA' })], AHORA).expedidosSinImei
    expect(b.destino).toBe('SALTA')
  })

  it('ordena cada lista del más viejo al más nuevo', () => {
    const r = armarAlertasEnvios([
      raw({ orderNumber: 'SO-NUEVO', sentAt: '2026-08-24T00:00:00.000Z' }),
      raw({ orderNumber: 'SO-VIEJO', sentAt: '2026-08-10T00:00:00.000Z' }),
    ], AHORA)
    expect(r.expedidosSinImei.map(a => a.orderNumber)).toEqual(['SO-VIEJO', 'SO-NUEVO'])
  })
})
