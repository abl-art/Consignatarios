import { describe, it, expect } from 'vitest'
import { armarMargenExtraMensual } from '@/lib/margen-extra'
import type { FilaHistorialBono, VentaPropiaDiaria } from '@/lib/lista-precios'

// Fila mínima del historial: solo importan vigencia, cupo, margen unitario y modelo
function fila(over: Partial<FilaHistorialBono> = {}): FilaHistorialBono {
  return {
    id: 'b1',
    productoId: 'p1',
    nombreModelo: 'Motorola Moto G17 4/128GB',
    monto: 30000,
    traslado: 20000,
    desde: '2026-08-20',
    hasta: '2026-09-10',
    estado: 'vencido',
    vendidas: 0,
    reconocidas: 0,
    ncUnitaria: 15000,
    ncTotal: 0,
    margenExtraUnitario: 10000 / 1.21,
    margenExtraTotal: 0,
    ...over,
  }
}

function venta(fecha: string, ventas: number, modelo = 'Motorola Moto G17 4/128GB'): VentaPropiaDiaria {
  return { fecha, modelo, ventas }
}

describe('armarMargenExtraMensual', () => {
  it('reparte el devengo por mes de venta cuando la vigencia cruza de mes', () => {
    const r = armarMargenExtraMensual([fila()], [venta('2026-08-25', 30), venta('2026-09-05', 20)])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ mes: '2026-08', unidades: 30, marca: 'Motorola' })
    expect(r[1]).toMatchObject({ mes: '2026-09', unidades: 20 })
    expect(r[0].margenTotal).toBeCloseTo(30 * (10000 / 1.21), 2)
  })

  it('expone el bono total y el aplicado (traslado) de cada campaña', () => {
    const r = armarMargenExtraMensual([fila()], [venta('2026-08-25', 5)])
    expect(r[0]).toMatchObject({ bonoTotal: 30000, bonoAplicado: 20000 })
  })

  it('el cupo corta en orden cronológico: devenga hasta agotarlo y después nada', () => {
    const r = armarMargenExtraMensual(
      [fila({ cupo: 40 })],
      [venta('2026-08-25', 30), venta('2026-09-05', 20)],
    )
    expect(r.map(x => x.unidades)).toEqual([30, 10])
  })

  it('un día que excede el cupo restante devenga solo el remanente', () => {
    const r = armarMargenExtraMensual(
      [fila({ cupo: 7 })],
      [venta('2026-08-25', 5), venta('2026-08-26', 5)],
    )
    expect(r).toHaveLength(1)
    expect(r[0].unidades).toBe(7)
  })

  it('ignora ventas fuera de la vigencia y de otros modelos', () => {
    const r = armarMargenExtraMensual(
      [fila()],
      [
        venta('2026-08-19', 10), // antes del desde
        venta('2026-09-11', 10), // después del hasta
        venta('2026-08-25', 4, 'Samsung Galaxy A17 5G'), // otro modelo
        venta('2026-08-25', 3),
      ],
    )
    expect(r).toHaveLength(1)
    expect(r[0].unidades).toBe(3)
  })

  it('cuenta el modelo aunque el nombre venga con otra variante de escritura', () => {
    const r = armarMargenExtraMensual(
      [fila()],
      [venta('2026-08-25', 6, 'Motorola G17 128GB')],
    )
    expect(r).toHaveLength(1)
    expect(r[0].unidades).toBe(6)
  })

  it('excluye bonos que trasladan todo (margen extra 0)', () => {
    const r = armarMargenExtraMensual(
      [fila({ margenExtraUnitario: 0 })],
      [venta('2026-08-25', 30)],
    )
    expect(r).toEqual([])
  })

  it('cruza de año sin mezclar meses', () => {
    const r = armarMargenExtraMensual(
      [fila({ desde: '2026-12-20', hasta: '2027-01-10' })],
      [venta('2026-12-28', 8), venta('2027-01-03', 5)],
    )
    expect(r.map(x => x.mes)).toEqual(['2026-12', '2027-01'])
  })

  it('las ventas desordenadas igual devengan en orden cronológico contra el cupo', () => {
    const r = armarMargenExtraMensual(
      [fila({ cupo: 35 })],
      [venta('2026-09-05', 20), venta('2026-08-25', 30)],
    )
    expect(r.map(x => ({ mes: x.mes, unidades: x.unidades }))).toEqual([
      { mes: '2026-08', unidades: 30 },
      { mes: '2026-09', unidades: 5 },
    ])
  })
})
