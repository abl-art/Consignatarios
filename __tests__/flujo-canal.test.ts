import { describe, it, expect } from 'vitest'
import { armarFlujoPorCanal, type FuentesFlujo } from '@/lib/flujo-canal'

// Miércoles 16/9/2026 como "hoy" para que la proyección sea determinística
const HOY = new Date('2026-09-16T00:00:00')

function fuentes(overrides: Partial<FuentesFlujo> = {}): FuentesFlujo {
  return {
    incomePropia: [],
    incomeTerceros: [],
    vta3ero: [],
    asistencias: [],
    egresos: [],
    pagosMayoristas: [],
    proyeccionDiaria: 0,
    hoy: HOY,
    ...overrides,
  }
}

function fila<T extends { cash_date: string }>(rows: T[], fecha: string): T | undefined {
  return rows.find(r => r.cash_date === fecha)
}

describe('armarFlujoPorCanal', () => {
  it('terceros solo lleva sus cuotas y el egreso V3; propia no lleva V3', () => {
    const { propia, terceros } = armarFlujoPorCanal(fuentes({
      incomePropia: [{ cash_date: '2026-09-14', in_adelantado: 100, in_en_termino: 200, in_atrasado: 0, in_pendiente: 0, in_vencida: 0 }],
      incomeTerceros: [{ cash_date: '2026-09-14', in_adelantado: 0, in_en_termino: 50, in_atrasado: 10, in_pendiente: 0, in_vencida: 0 }],
      vta3ero: [{ cash_date: '2026-09-14', out_vta3ero: -30 }],
      asistencias: [{ cash_date: '2026-09-14', in_asistencia: 500 }],
      pagosMayoristas: [{ cash_date: '2026-09-14', in_mayoristas: 70 }],
      egresos: [{ cash_date: '2026-09-14', column: 'out_sueldos', amount: -40 }],
    }))

    const t = fila(terceros, '2026-09-14')!
    expect(t.in_en_termino).toBe(50)
    expect(t.in_atrasado).toBe(10)
    expect(t.out_vta3ero).toBe(-30)
    // nada de lo "propio" contamina terceros
    expect(t.in_adelantado).toBe(0)
    expect(t.in_asistencia).toBe(0)
    expect(t.in_mayoristas).toBe(0)
    expect(t.out_sueldos).toBe(0)
    expect(t.net_flow).toBe(30)

    const p = fila(propia, '2026-09-14')!
    expect(p.in_adelantado).toBe(100)
    expect(p.in_en_termino).toBe(200)
    expect(p.in_asistencia).toBe(500)
    expect(p.in_mayoristas).toBe(70)
    expect(p.out_sueldos).toBe(-40)
    expect(p.out_vta3ero).toBe(0)
    expect(p.net_flow).toBe(100 + 200 + 500 + 70 - 40)
  })

  it('total combina ambos canales y coincide con propia + terceros', () => {
    const f = fuentes({
      incomePropia: [{ cash_date: '2026-09-14', in_adelantado: 100, in_en_termino: 0, in_atrasado: 0, in_pendiente: 0, in_vencida: 0 }],
      incomeTerceros: [{ cash_date: '2026-09-15', in_adelantado: 0, in_en_termino: 80, in_atrasado: 0, in_pendiente: 0, in_vencida: 0 }],
      vta3ero: [{ cash_date: '2026-09-15', out_vta3ero: -20 }],
      egresos: [{ cash_date: '2026-09-14', column: 'out_celulares', amount: -60 }],
    })
    const { total, propia, terceros } = armarFlujoPorCanal(f)

    for (const fecha of ['2026-09-14', '2026-09-15']) {
      const t = fila(total, fecha)!
      const p = fila(propia, fecha)
      const c = fila(terceros, fecha)
      expect(t.net_flow).toBeCloseTo((p?.net_flow ?? 0) + (c?.net_flow ?? 0))
    }
    expect(fila(total, '2026-09-14')!.in_adelantado).toBe(100)
    expect(fila(total, '2026-09-15')!.out_vta3ero).toBe(-20)
  })

  it('egresos y V3 en fin de semana se imputan al lunes', () => {
    const { total, terceros } = armarFlujoPorCanal(fuentes({
      // sábado 19/9/2026
      egresos: [{ cash_date: '2026-09-19', column: 'out_envios', amount: -10 }],
      vta3ero: [{ cash_date: '2026-09-19', out_vta3ero: -5 }],
      incomeTerceros: [{ cash_date: '2026-09-19', in_adelantado: 0, in_en_termino: 1, in_atrasado: 0, in_pendiente: 0, in_vencida: 0 }],
    }))
    expect(fila(total, '2026-09-21')!.out_envios).toBe(-10)
    expect(fila(total, '2026-09-21')!.out_vta3ero).toBe(-5)
    expect(fila(terceros, '2026-09-21')!.out_vta3ero).toBe(-5)
    // las cuotas NO se corren: la fecha ya viene imputada por acreditación
    expect(fila(terceros, '2026-09-19')!.in_en_termino).toBe(1)
  })

  it('la proyección arranca hoy+2 hábiles, triplica los martes y va solo a propia y total', () => {
    const { total, propia, terceros } = armarFlujoPorCanal(fuentes({
      proyeccionDiaria: 100,
      // ancla para que exista el rango de fechas
      incomePropia: [{ cash_date: '2026-09-14', in_adelantado: 1, in_en_termino: 0, in_atrasado: 0, in_pendiente: 0, in_vencida: 0 }],
    }))
    // hoy miércoles 16/9 → +2 hábiles = viernes 18/9
    expect(fila(propia, '2026-09-17')?.in_proyectado ?? 0).toBe(0)
    expect(fila(propia, '2026-09-18')!.in_proyectado).toBe(100)
    // martes 22/9 = triple
    expect(fila(propia, '2026-09-22')!.in_proyectado).toBe(300)
    // finde sin proyección
    expect(fila(propia, '2026-09-20')?.in_proyectado ?? 0).toBe(0)
    expect(fila(total, '2026-09-18')!.in_proyectado).toBe(100)
    expect(fila(terceros, '2026-09-18')?.in_proyectado ?? 0).toBe(0)
  })

  it('rellena el calendario sin saltos y acumula cash_balance excluyendo in_vencida', () => {
    const { total } = armarFlujoPorCanal(fuentes({
      incomePropia: [
        { cash_date: '2026-09-14', in_adelantado: 100, in_en_termino: 0, in_atrasado: 0, in_pendiente: 0, in_vencida: 999 },
        { cash_date: '2026-09-17', in_adelantado: 50, in_en_termino: 0, in_atrasado: 0, in_pendiente: 0, in_vencida: 0 },
      ],
    }))
    // días intermedios presentes en cero
    expect(fila(total, '2026-09-15')).toBeDefined()
    expect(fila(total, '2026-09-16')).toBeDefined()
    expect(fila(total, '2026-09-15')!.net_flow).toBe(0)
    // in_vencida no suma al neto ni al saldo
    expect(fila(total, '2026-09-14')!.net_flow).toBe(100)
    expect(fila(total, '2026-09-17')!.cash_balance).toBe(150)
  })
})
