import { describe, it, expect } from 'vitest'
import { armarNotasCredito, resumenVentasAccion } from '@/lib/notas-credito'
import type { FilaHistorialBono } from '@/lib/lista-precios'

// Campaña como sale de armarHistorialBonos; los números de NC ya vienen
// calculados ahí — acá solo se agrupan en acciones por marca+vigencia
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

describe('armarNotasCredito', () => {
  it('bonos de la misma marca y la misma vigencia van en una única NC', () => {
    const grupos = armarNotasCredito([
      campania({ id: 'a', nombreModelo: 'Motorola Moto G06 64GB', ncTotal: 100000, reconocidas: 5 }),
      campania({ id: 'b', nombreModelo: 'Motorola Moto G17 4/128GB', ncTotal: 250000, reconocidas: 10 }),
      campania({ id: 'c', nombreModelo: 'Motorola Moto G77 8/256GB 5G', ncTotal: 80000, reconocidas: 2 }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].marca).toBe('Motorola')
    expect(grupos[0].proveedor).toBe('Newsan')
    expect(grupos[0].ncTotal).toBe(430000)
    expect(grupos[0].unidades).toBe(17)
    expect(grupos[0].campanias.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('marcas distintas con la misma vigencia son NC separadas, con su proveedor', () => {
    const grupos = armarNotasCredito([
      campania({ id: 'a' }),
      campania({ id: 'b', nombreModelo: 'Nubia Music 2 128/4GB' }),
      campania({ id: 'c', nombreModelo: 'Xiaomi Redmi 14C 128/4GB' }),
      campania({ id: 'd', nombreModelo: 'Samsung Galaxy A17 5G' }),
    ])
    expect(grupos.map(g => `${g.marca}→${g.proveedor}`).sort()).toEqual([
      'Motorola→Newsan',
      'Nubia→Relojería Fueguina',
      'Samsung→IATEC (Mirgor)',
      'Xiaomi→Solnik',
    ])
  })

  it('la misma marca con otra vigencia es otra NC (otra acción comercial)', () => {
    const grupos = armarNotasCredito([
      campania({ id: 'a' }),
      campania({ id: 'b', desde: '2026-08-26', hasta: '2026-09-01' }),
    ])
    expect(grupos).toHaveLength(2)
  })

  it('una acción que cruza meses toca los dos (para el filtro por mes)', () => {
    const [g] = armarNotasCredito([campania({ desde: '2026-08-26', hasta: '2026-09-01' })])
    expect(g.meses).toEqual(['2026-08', '2026-09'])
  })

  it('una acción dentro de un mes toca solo ese mes; sin hasta, el del inicio', () => {
    const grupos = armarNotasCredito([
      campania({ id: 'a' }),
      campania({ id: 'b', desde: '2026-07-01', hasta: undefined, nombreModelo: 'Xiaomi Redmi 14C 128/4GB' }),
    ])
    expect(grupos.find(g => g.marca === 'Motorola')!.meses).toEqual(['2026-09'])
    expect(grupos.find(g => g.marca === 'Xiaomi')!.meses).toEqual(['2026-07'])
  })

  it('un grupo cuenta como emitido solo si TODAS sus campañas están emitidas', () => {
    const [g] = armarNotasCredito([
      campania({ id: 'a', ncEmitidaAt: '2026-09-02T10:00:00Z' }),
      campania({ id: 'b', nombreModelo: 'Motorola Moto G06 64GB' }),
    ])
    expect(g.emitida).toBe(false)
    const [todoEmitido] = armarNotasCredito([
      campania({ id: 'a', ncEmitidaAt: '2026-09-02T10:00:00Z' }),
      campania({ id: 'b', nombreModelo: 'Motorola Moto G06 64GB', ncEmitidaAt: '2026-09-02T10:00:00Z' }),
    ])
    expect(todoEmitido.emitida).toBe(true)
  })

  it('un grupo está en curso si alguna campaña sigue vigente o futura', () => {
    const grupos = armarNotasCredito([
      campania({ id: 'a', estado: 'vencido', desde: '2026-08-26', hasta: '2026-09-01' }),
      campania({ id: 'b', estado: 'vigente' }),
      campania({ id: 'c', nombreModelo: 'Nubia Music 2 128/4GB', estado: 'agotado' }),
    ])
    expect(grupos.find(g => g.marca === 'Motorola' && g.hasta === '2026-09-01')!.enCurso).toBe(false)
    expect(grupos.find(g => g.marca === 'Motorola' && g.hasta === '2026-09-10')!.enCurso).toBe(true)
    expect(grupos.find(g => g.marca === 'Nubia')!.enCurso).toBe(false) // agotado: no suma más
  })

  it('ordena las acciones de la más reciente a la más vieja', () => {
    const grupos = armarNotasCredito([
      campania({ id: 'a', desde: '2026-08-26', hasta: '2026-09-01' }),
      campania({ id: 'b' }),
    ])
    expect(grupos[0].desde).toBe('2026-09-03')
  })
})

describe('resumenVentasAccion (PDF de detalle por acción)', () => {
  const venta = (fecha: string, modelo: string, ventas: number) => ({ fecha, modelo, ventas })

  it('cuenta las vendidas por modelo dentro de la vigencia, con su cupo', () => {
    const filas = resumenVentasAccion(
      [{ nombreModelo: 'Motorola Moto G17 4/128GB', cupo: 100 }],
      [venta('2026-09-03', 'Motorola Moto G17 4/128GB', 2), venta('2026-09-04', 'Motorola Moto G17 4/128GB', 1)],
      '2026-09-03',
      '2026-09-10',
    )
    expect(filas).toEqual([{ modelo: 'Motorola Moto G17 4/128GB', vendidas: 3, cupo: 100 }])
  })

  it('solo cuenta las ventas dentro de la vigencia y matchea variantes de nombre', () => {
    const filas = resumenVentasAccion(
      [{ nombreModelo: 'Motorola Moto G17 4/128GB' }],
      [
        venta('2026-09-02', 'Motorola Moto G17 4/128GB', 5), // antes del desde
        venta('2026-09-03', 'Celular Motorola Moto G17 128GB', 1),
        venta('2026-09-03', 'Motorola Moto G06 64GB', 4), // otro modelo
      ],
      '2026-09-03',
      '2026-09-10',
    )
    expect(filas).toEqual([{ modelo: 'Motorola Moto G17 4/128GB', vendidas: 1, cupo: null }])
  })

  it('un modelo sin ventas sale con 0', () => {
    const filas = resumenVentasAccion([{ nombreModelo: 'Motorola Moto G77 8/256GB 5G', cupo: 50 }], [])
    expect(filas).toEqual([{ modelo: 'Motorola Moto G77 8/256GB 5G', vendidas: 0, cupo: 50 }])
  })
})
