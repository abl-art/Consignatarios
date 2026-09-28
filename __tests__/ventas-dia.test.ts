import { describe, it, expect } from 'vitest'
import { CLIENT_IDS_PROPIOS } from '@/lib/client-ids'
import { resumenVentasDia, type VentaAgrupada } from '@/lib/ventas-dia'

const CLIENT_PROPIO = CLIENT_IDS_PROPIOS[0]

const PREFIXES = [{ nombre: 'Celia', prefix: 'celia' }]

function venta(over: Partial<VentaAgrupada>): VentaAgrupada {
  return { store_name: 'tienda-x', client_id: 'tercero-1', ventas: 1, monto: 100, ...over }
}

describe('resumenVentasDia', () => {
  it('clasifica hoy en gocelular y terceros excluyendo consignatarios', () => {
    const hoy = [
      venta({ store_name: 'go-store', client_id: CLIENT_PROPIO, ventas: 5, monto: 5000 }),
      venta({ store_name: 'Celia Norte', ventas: 3, monto: 3000 }),
      venta({ store_name: 'mayorista-sur', ventas: 2, monto: 2000 }),
    ]
    const r = resumenVentasDia(hoy, [], PREFIXES)
    expect(r.hoy.gocelular).toEqual({ ventas: 5, monto: 5000 })
    expect(r.hoy.terceros).toEqual({ ventas: 2, monto: 2000 })
    expect(r.hoy.total).toEqual({ ventas: 7, monto: 7000 })
  })

  it('el prefijo de consignatario matchea sin importar mayúsculas', () => {
    const hoy = [venta({ store_name: 'CELIA-caballito', ventas: 4, monto: 4000 })]
    const r = resumenVentasDia(hoy, [], PREFIXES)
    expect(r.hoy.total).toEqual({ ventas: 0, monto: 0 })
  })

  it('un client_id propio es gocelular aunque el store matchee un prefijo', () => {
    const hoy = [venta({ store_name: 'celia-go', client_id: CLIENT_PROPIO, ventas: 1, monto: 900 })]
    const r = resumenVentasDia(hoy, [], PREFIXES)
    expect(r.hoy.gocelular).toEqual({ ventas: 1, monto: 900 })
  })

  it('promedia los últimos 30 días dividiendo siempre por 30', () => {
    const ult30d = [
      venta({ store_name: 'go-store', client_id: CLIENT_PROPIO, ventas: 60, monto: 60000 }),
      venta({ store_name: 'Celia Norte', ventas: 300, monto: 999999 }),
      venta({ store_name: 'mayorista-sur', ventas: 30, monto: 15000 }),
    ]
    const r = resumenVentasDia([], ult30d, PREFIXES)
    expect(r.prom30d.gocelular).toEqual({ ventas: 2, monto: 2000 })
    expect(r.prom30d.terceros).toEqual({ ventas: 1, monto: 500 })
    expect(r.prom30d.general).toEqual({ ventas: 3, monto: 2500 })
  })

  it('devuelve ceros con arrays vacíos', () => {
    const r = resumenVentasDia([], [], [])
    expect(r.hoy.total).toEqual({ ventas: 0, monto: 0 })
    expect(r.prom30d.general).toEqual({ ventas: 0, monto: 0 })
  })
})
