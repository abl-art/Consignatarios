import { describe, it, expect } from 'vitest'
import { CLIENT_IDS_PROPIOS } from '@/lib/client-ids'
import { resumenVentasDia, proyectarVentasMensuales, type VentaAgrupada, type VentaMensual } from '@/lib/ventas-dia'

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

describe('proyectarVentasMensuales', () => {
  function mes(mes: string, over: Partial<VentaMensual> = {}): VentaMensual {
    return { mes, store_name: 'tienda-x', client_id: 'tercero-1', ventas: 10, monto: 1000, ...over }
  }

  it('con ventas constantes proyecta esa misma constante para los meses restantes', () => {
    const datos = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map((m) => mes(m))
    const p = proyectarVentasMensuales(datos, [], '2026-08')
    expect(p.proyeccion.map((x) => x.mes)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12'])
    for (const punto of p.proyeccion) {
      expect(punto.ventas).toBeCloseTo(10)
      expect(punto.monto).toBeCloseTo(1000)
    }
    expect(p.promedioMensualCerrado.ventas).toBeCloseTo(10)
    expect(p.mesesCerrados).toBe(7)
  })

  it('con crecimiento lineal la proyección sigue la recta', () => {
    // ene=10, feb=20, ..., jul=70 → pendiente 10/mes → sep=90, oct=100, nov=110, dic=120
    const datos = Array.from({ length: 7 }, (_, i) =>
      mes(`2026-0${i + 1}`, { ventas: (i + 1) * 10, monto: (i + 1) * 1000 })
    )
    const p = proyectarVentasMensuales(datos, [], '2026-08')
    expect(p.proyeccion.map((x) => Math.round(x.ventas))).toEqual([90, 100, 110, 120])
    expect(p.proyeccion.map((x) => Math.round(x.monto))).toEqual([9000, 10000, 11000, 12000])
  })

  it('excluye consignatarios de la base y el mes en curso del ajuste', () => {
    const datos = [
      ...['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map((m) => mes(m)),
      // consignatario: no debe mover la recta
      mes('2026-03', { store_name: 'Celia Norte', ventas: 500, monto: 99999 }),
      // agosto incompleto: tampoco
      mes('2026-08', { ventas: 3, monto: 300 }),
    ]
    const p = proyectarVentasMensuales(datos, [{ nombre: 'Celia', prefix: 'celia' }], '2026-08')
    for (const punto of p.proyeccion) expect(punto.ventas).toBeCloseTo(10)
  })

  it('un mes sin ventas cuenta como cero en el ajuste', () => {
    // solo hay datos de jul → ene-jun valen 0 y la recta no es plana en 10
    const p = proyectarVentasMensuales([mes('2026-07', { ventas: 70 })], [], '2026-08')
    expect(p.mesesCerrados).toBe(7)
    expect(p.proyeccion[0].ventas).toBeGreaterThan(0)
    expect(p.promedioMensualCerrado.ventas).toBeCloseTo(10)
  })

  it('una tendencia en caída nunca proyecta negativo', () => {
    const datos = Array.from({ length: 7 }, (_, i) =>
      mes(`2026-0${i + 1}`, { ventas: Math.max(70 - i * 30, 0), monto: 100 })
    )
    const p = proyectarVentasMensuales(datos, [], '2026-08')
    for (const punto of p.proyeccion) expect(punto.ventas).toBeGreaterThanOrEqual(0)
  })
})
