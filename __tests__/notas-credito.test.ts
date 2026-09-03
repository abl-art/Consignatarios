import { describe, it, expect } from 'vitest'
import { armarNotasCredito } from '@/lib/notas-credito'
import type { FilaHistorialBono, VentaPropiaDiaria } from '@/lib/lista-precios'

// Campaña como sale de armarHistorialBonos; los números de NC ya vienen
// calculados ahí — acá solo se agrupan e imputan por mes
function campania(over: Partial<FilaHistorialBono> = {}): FilaHistorialBono {
  return {
    id: 'b1',
    productoId: 'p1',
    nombreModelo: 'Motorola Moto G17 4/128GB',
    monto: 50000,
    desde: '2026-09-03',
    hasta: '2026-09-10',
    cupo: 100,
    estado: 'vigente',
    vendidas: 10,
    reconocidas: 10,
    ncUnitaria: 25000,
    ncTotal: 250000,
    ...over,
  }
}

const venta = (fecha: string, ventas: number, modelo = 'Motorola Moto G17 4/128GB'): VentaPropiaDiaria => ({ fecha, modelo, ventas })

describe('armarNotasCredito', () => {
  it('bonos del mismo proveedor y la misma vigencia van en una única NC', () => {
    const r = armarNotasCredito([
      campania({ id: 'a', nombreModelo: 'Motorola Moto G06 64GB', ncTotal: 100000, reconocidas: 5 }),
      campania({ id: 'b', nombreModelo: 'Motorola Moto G17 4/128GB', ncTotal: 250000, reconocidas: 10 }),
      campania({ id: 'c', nombreModelo: 'Motorola Moto G77 8/256GB 5G', ncTotal: 80000, reconocidas: 2 }),
    ], [])
    expect(r.grupos).toHaveLength(1)
    expect(r.grupos[0].proveedor).toBe('Newsan')
    expect(r.grupos[0].ncTotal).toBe(430000)
    expect(r.grupos[0].unidades).toBe(17)
    expect(r.grupos[0].campanias.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('proveedores distintos con la misma vigencia son NC separadas', () => {
    const r = armarNotasCredito([
      campania({ id: 'a' }),
      campania({ id: 'b', nombreModelo: 'Nubia Music 2 128/4GB' }),
      campania({ id: 'c', nombreModelo: 'Xiaomi Redmi 14C 128/4GB' }),
      campania({ id: 'd', nombreModelo: 'Samsung Galaxy A17 5G' }),
    ], [])
    expect(r.grupos.map(g => g.proveedor).sort()).toEqual(['IATEC (Mirgor)', 'Newsan', 'Relojería Fueguina', 'Solnik'])
  })

  it('el mismo proveedor con otra vigencia es otra NC (otra acción comercial)', () => {
    const r = armarNotasCredito([
      campania({ id: 'a' }),
      campania({ id: 'b', desde: '2026-08-26', hasta: '2026-09-01' }),
    ], [])
    expect(r.grupos).toHaveLength(2)
  })

  it('las tarjetas: total = emitidas + pendientes', () => {
    const r = armarNotasCredito([
      campania({ id: 'a', ncTotal: 300000, ncEmitidaAt: '2026-09-02T10:00:00Z', desde: '2026-08-26', hasta: '2026-09-01' }),
      campania({ id: 'b', ncTotal: 250000 }),
    ], [])
    expect(r.totales.total).toBe(550000)
    expect(r.totales.emitidas).toBe(300000)
    expect(r.totales.pendientes).toBe(250000)
  })

  it('un grupo cuenta como emitido solo si TODAS sus campañas están emitidas', () => {
    const r = armarNotasCredito([
      campania({ id: 'a', ncEmitidaAt: '2026-09-02T10:00:00Z' }),
      campania({ id: 'b', nombreModelo: 'Motorola Moto G06 64GB' }),
    ], [])
    expect(r.grupos[0].emitida).toBe(false)
  })

  it('un grupo está en curso si alguna campaña sigue vigente o futura', () => {
    const r = armarNotasCredito([
      campania({ id: 'a', estado: 'vencido', desde: '2026-08-26', hasta: '2026-09-01' }),
      campania({ id: 'b', estado: 'vigente' }),
      campania({ id: 'c', nombreModelo: 'Nubia Music 2 128/4GB', estado: 'agotado' }),
    ], [])
    const newsanCerrada = r.grupos.find(g => g.proveedor === 'Newsan' && g.hasta === '2026-09-01')!
    const newsanEnCurso = r.grupos.find(g => g.proveedor === 'Newsan' && g.hasta === '2026-09-10')!
    const nubia = r.grupos.find(g => g.proveedor === 'Relojería Fueguina')!
    expect(newsanCerrada.enCurso).toBe(false)
    expect(newsanEnCurso.enCurso).toBe(true)
    expect(nubia.enCurso).toBe(false) // agotado: no suma más unidades
  })

  it('imputa la NC por mes de venta de las unidades reconocidas (campaña que cruza meses)', () => {
    // 8 unidades en agosto + 4 en septiembre, NC/u 25.000
    const ventas = [venta('2026-08-28', 5), venta('2026-08-30', 3), venta('2026-09-01', 4)]
    const r = armarNotasCredito([
      campania({ desde: '2026-08-26', hasta: '2026-09-01', vendidas: 12, reconocidas: 12, ncTotal: 300000 }),
    ], ventas)
    expect(r.meses).toEqual([
      { mes: '2026-09', total: 100000, emitidas: 0, pendientes: 100000 },
      { mes: '2026-08', total: 200000, emitidas: 0, pendientes: 200000 },
    ])
  })

  it('el cupo corta cronológicamente: las ventas que llegan tarde no generan NC', () => {
    // cupo 6: 5 de agosto + 1 de septiembre; las otras 3 de sept quedan afuera
    const ventas = [venta('2026-08-28', 5), venta('2026-09-01', 4)]
    const r = armarNotasCredito([
      campania({ desde: '2026-08-26', hasta: '2026-09-01', cupo: 6, vendidas: 9, reconocidas: 6, ncTotal: 150000 }),
    ], ventas)
    expect(r.meses.find(m => m.mes === '2026-08')!.total).toBe(125000)
    expect(r.meses.find(m => m.mes === '2026-09')!.total).toBe(25000)
  })

  it('la suma mensual coincide con la NC total del grupo', () => {
    const ventas = [venta('2026-08-28', 5), venta('2026-09-01', 4)]
    const r = armarNotasCredito([
      campania({ desde: '2026-08-26', hasta: '2026-09-01', cupo: 6, vendidas: 9, reconocidas: 6, ncTotal: 150000 }),
    ], ventas)
    const sumaMeses = r.meses.reduce((acc, m) => acc + m.total, 0)
    expect(sumaMeses).toBe(r.totales.total)
  })

  it('ordena grupos y meses del más reciente al más viejo', () => {
    const r = armarNotasCredito([
      campania({ id: 'a', desde: '2026-08-26', hasta: '2026-09-01' }),
      campania({ id: 'b' }),
    ], [])
    expect(r.grupos[0].desde).toBe('2026-09-03')
  })
})
