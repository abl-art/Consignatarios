import { describe, it, expect } from 'vitest'
import { armarSiniestrosStock, type SiniestroStockRow, type DispositivoStock } from '@/lib/siniestros-stock'

const AHORA = new Date('2026-09-23T15:00:00Z')

function fila(over: Partial<SiniestroStockRow> = {}): SiniestroStockRow {
  return {
    id: 'id-1',
    producto: 'Motorola Moto G06 4/64GB',
    sku: 'PBAT0006AR',
    imei: null,
    tipo: 'extraviado',
    fecha: '2026-09-20',
    nota: null,
    estado: 'abierto',
    resueltoAt: null,
    notaCredito: false,
    createdAt: '2026-09-20T12:00:00Z',
    ...over,
  }
}

describe('armarSiniestrosStock', () => {
  it('enriquece con el dispositivo de GOcelular cuando hay IMEI', () => {
    const disp: DispositivoStock = {
      imei: '350000000000001',
      modelo: 'Motorola Moto G06 4/64GB',
      ubicacion: 'andreani_wh',
      status: 'available',
      trustonicStatus: 'locked',
    }
    const [s] = armarSiniestrosStock([fila({ imei: '350000000000001' })], [disp], AHORA)
    expect(s.dispositivo).toEqual(disp)
  })

  it('dispositivo null sin IMEI o cuando el IMEI no figura en GOcelular', () => {
    const [sinImei, noFigura] = armarSiniestrosStock(
      [fila({ id: 'a' }), fila({ id: 'b', imei: '350000000000009', fecha: '2026-09-19' })],
      [],
      AHORA,
    )
    expect(sinImei.dispositivo).toBeNull()
    expect(noFigura.dispositivo).toBeNull()
  })

  it('dias = días desde el hallazgo para abiertos', () => {
    const [s] = armarSiniestrosStock([fila({ fecha: '2026-09-20' })], [], AHORA)
    expect(s.dias).toBe(3)
  })

  it('dias nunca es negativo (hallazgo cargado con fecha de hoy)', () => {
    const [s] = armarSiniestrosStock([fila({ fecha: '2026-09-23' })], [], AHORA)
    expect(s.dias).toBe(0)
  })

  it('en resueltos, dias = lo que estuvo abierto (fecha → resueltoAt)', () => {
    const [s] = armarSiniestrosStock(
      [fila({ estado: 'resuelto', fecha: '2026-09-01', resueltoAt: '2026-09-11T10:00:00Z' })],
      [],
      AHORA,
    )
    expect(s.dias).toBe(10)
  })

  it('ordena abiertos primero y por fecha de hallazgo descendente', () => {
    const rows = [
      fila({ id: 'resuelto-nuevo', estado: 'resuelto', fecha: '2026-09-22', resueltoAt: '2026-09-22T18:00:00Z' }),
      fila({ id: 'abierto-viejo', fecha: '2026-09-10' }),
      fila({ id: 'abierto-nuevo', fecha: '2026-09-21' }),
    ]
    const ids = armarSiniestrosStock(rows, [], AHORA).map(s => s.id)
    expect(ids).toEqual(['abierto-nuevo', 'abierto-viejo', 'resuelto-nuevo'])
  })

  it('desempata misma fecha por createdAt descendente', () => {
    const rows = [
      fila({ id: 'primero', fecha: '2026-09-20', createdAt: '2026-09-20T10:00:00Z' }),
      fila({ id: 'segundo', fecha: '2026-09-20', createdAt: '2026-09-20T11:00:00Z' }),
    ]
    const ids = armarSiniestrosStock(rows, [], AHORA).map(s => s.id)
    expect(ids).toEqual(['segundo', 'primero'])
  })
})
