import { describe, it, expect } from 'vitest'
import { CLIENT_IDS_PROPIOS } from '@/lib/client-ids'
import {
  mesesSiguientes,
  indiceEstacional,
  serieDimension,
  ventanaSerie,
  proyectarHibrido,
  proyectarPorGocuotas,
  armarProyVsReal,
  fraccionMesTranscurrida,
  type MesCifras,
  type PuntoMensual,
  type VentaMensualDim,
  type SnapshotProyeccion,
} from '@/lib/proyeccion-ventas'

const CLIENT_PROPIO = CLIENT_IDS_PROPIOS[0]

const mes = (m: string, ventas: number, monto = ventas * 10): MesCifras => ({ mes: m, ventas, monto })

// Índice plano: todos los meses = 1 (sin estacionalidad)
const INDICE_PLANO: Record<string, number> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [String(i + 1).padStart(2, '0'), 1])
)

describe('mesesSiguientes', () => {
  it('devuelve los n meses siguientes cruzando el año', () => {
    expect(mesesSiguientes('2026-11', 4)).toEqual(['2026-12', '2027-01', '2027-02', '2027-03'])
  })
})

describe('indiceEstacional', () => {
  // 25 meses de nivel 100 con diciembre al doble: el índice tiene que
  // detectar diciembre fuerte y quedar normalizado (promedio 1)
  const serie: PuntoMensual[] = []
  for (let y = 2024; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const clave = `${y}-${String(m).padStart(2, '0')}`
      if (clave > '2026-01') break
      serie.push({ mes: clave, n: m === 12 ? 200 : 100 })
    }
  }

  it('detecta el mes fuerte y queda normalizado', () => {
    const idx = indiceEstacional(serie)
    expect(idx['12']).toBeGreaterThan(1.8)
    expect(idx['12']).toBeLessThan(1.9)
    expect(idx['06']).toBeGreaterThan(0.9)
    expect(idx['06']).toBeLessThan(0.95)
    const promedio = Object.values(idx).reduce((a, b) => a + b, 0) / 12
    expect(promedio).toBeCloseTo(1, 1)
  })

  it('con menos de 13 meses devuelve índice neutro', () => {
    const idx = indiceEstacional(serie.slice(0, 10))
    for (const v of Object.values(idx)) expect(v).toBe(1)
  })
})

describe('serieDimension', () => {
  const raw: VentaMensualDim[] = [
    { mes: '2026-05', store_name: 'GOcelular Tienda', client_id: CLIENT_PROPIO, store_id: '1', ventas: 10, monto: 100 },
    { mes: '2026-05', store_name: 'Nebitel Centro', client_id: '999', store_id: '77', ventas: 5, monto: 50 },
    { mes: '2026-05', store_name: 'Celia Lopez Local', client_id: '888', store_id: '88', ventas: 3, monto: 30 },
    { mes: '2026-06', store_name: 'Nebitel Norte', client_id: '999', store_id: '78', ventas: 7, monto: 70 },
  ]
  const prefixes = [{ nombre: 'Celia', prefix: 'celia' }]

  it('total excluye consignatarios y agrupa por mes', () => {
    expect(serieDimension(raw, { nivel: 'total' }, prefixes)).toEqual([
      { mes: '2026-05', ventas: 15, monto: 150 },
      { mes: '2026-06', ventas: 7, monto: 70 },
    ])
  })

  it('propia solo client_ids propios', () => {
    expect(serieDimension(raw, { nivel: 'propia' }, prefixes)).toEqual([{ mes: '2026-05', ventas: 10, monto: 100 }])
  })

  it('terceros excluye propios y consignatarios', () => {
    expect(serieDimension(raw, { nivel: 'terceros' }, prefixes)).toEqual([
      { mes: '2026-05', ventas: 5, monto: 50 },
      { mes: '2026-06', ventas: 7, monto: 70 },
    ])
  })

  it('merchant filtra por client_id y store por store_id', () => {
    expect(serieDimension(raw, { nivel: 'merchant', clientId: '999' }, prefixes)).toEqual([
      { mes: '2026-05', ventas: 5, monto: 50 },
      { mes: '2026-06', ventas: 7, monto: 70 },
    ])
    expect(serieDimension(raw, { nivel: 'store', storeId: '78' }, prefixes)).toEqual([{ mes: '2026-06', ventas: 7, monto: 70 }])
  })
})

describe('ventanaSerie', () => {
  it('arranca en el primer mes con ventas, rellena huecos con 0 y termina en hastaMes', () => {
    const serie = [mes('2025-01', 0), mes('2026-02', 562), mes('2026-04', 10)]
    expect(ventanaSerie(serie, '2026-05')).toEqual([
      mes('2026-02', 562),
      { mes: '2026-03', ventas: 0, monto: 0 },
      mes('2026-04', 10),
      { mes: '2026-05', ventas: 0, monto: 0 },
    ])
  })

  it('corta a los últimos 12 meses', () => {
    const serie: MesCifras[] = []
    for (let m = 0; m < 15; m++) {
      const y = 2025 + Math.floor(m / 12)
      serie.push(mes(`${y}-${String((m % 12) + 1).padStart(2, '0')}`, 100 + m))
    }
    const v = ventanaSerie(serie, '2026-03')
    expect(v).toHaveLength(12)
    expect(v[0].mes).toBe('2025-04')
    expect(v[11].mes).toBe('2026-03')
  })

  it('ignora meses posteriores a hastaMes', () => {
    const v = ventanaSerie([mes('2026-07', 50), mes('2026-09', 99)], '2026-08')
    expect(v).toEqual([mes('2026-07', 50), { mes: '2026-08', ventas: 0, monto: 0 }])
  })
})

describe('proyectarHibrido', () => {
  it('con índice plano equivale a la regresión lineal', () => {
    const serie = [mes('2026-01', 10), mes('2026-02', 20), mes('2026-03', 30)]
    const p = proyectarHibrido(serie, INDICE_PLANO, ['2026-04', '2026-05'])
    expect(p[0].ventas).toBeCloseTo(40)
    expect(p[1].ventas).toBeCloseTo(50)
    expect(p[0].monto).toBeCloseTo(400)
  })

  it('reestacionaliza el mes proyectado con su índice', () => {
    const serie = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((m) => mes(m, 100))
    const idx = { ...INDICE_PLANO, '12': 2 }
    const p = proyectarHibrido(serie, idx, ['2026-12'])
    expect(p[0].ventas).toBeCloseTo(200)
  })

  it('desestacionaliza la serie de entrada', () => {
    const idx = { ...INDICE_PLANO, '05': 1.25 }
    const p = proyectarHibrido([mes('2026-05', 125)], idx, ['2026-06'])
    expect(p[0].ventas).toBeCloseTo(100)
  })

  it('proyecta saltando el mes en curso (hueco entre serie y horizonte)', () => {
    const serie = [mes('2026-01', 10), mes('2026-02', 20), mes('2026-03', 30)]
    // se congela en abril: horizonte arranca en mayo (x=5)
    const p = proyectarHibrido(serie, INDICE_PLANO, ['2026-05'])
    expect(p[0].ventas).toBeCloseTo(50)
  })

  it('nunca proyecta negativo', () => {
    const serie = [mes('2026-01', 30), mes('2026-02', 20), mes('2026-03', 10)]
    const p = proyectarHibrido(serie, INDICE_PLANO, ['2026-08'])
    expect(p[0].ventas).toBe(0)
  })
})

describe('proyectarPorGocuotas', () => {
  const gq: PuntoMensual[] = [
    { mes: '2025-08', n: 400 },
    { mes: '2025-09', n: 500 },
    { mes: '2025-10', n: 550 },
    { mes: '2025-11', n: 600 },
  ]

  it('aplica los ratios mes a mes del año anterior de GOcuotas', () => {
    const p = proyectarPorGocuotas([mes('2026-09', 100, 1000)], gq, ['2026-10', '2026-11'])
    expect(p[0].ventas).toBeCloseTo(110) // 100 × 550/500
    expect(p[1].ventas).toBeCloseTo(120) // 110 × 600/550
    expect(p[0].monto).toBeCloseTo(1100)
  })

  it('encadena desde el último mes cerrado aunque el horizonte no sea contiguo', () => {
    const p = proyectarPorGocuotas([mes('2026-08', 100)], gq, ['2026-10'])
    expect(p[0].ventas).toBeCloseTo(137.5) // 100 × 500/400 × 550/500
  })

  it('mes sin dato de GOcuotas usa factor neutro', () => {
    const p = proyectarPorGocuotas([mes('2026-11', 100)], gq, ['2026-12'])
    expect(p[0].ventas).toBeCloseTo(100)
  })
})

describe('armarProyVsReal', () => {
  const snap = (run_mes: string, metodo: 'hibrido' | 'gocuotas', m: string, ventas: number): SnapshotProyeccion => ({
    run_mes,
    metodo,
    mes: m,
    ventas,
    monto: ventas * 10,
  })

  it('para un mes cerrado usa el run más reciente que lo proyectó y le pega el real', () => {
    const snapshots = [
      snap('2026-09', 'hibrido', '2026-10', 100),
      snap('2026-09', 'gocuotas', '2026-10', 90),
      snap('2026-10', 'hibrido', '2026-10', 110),
      snap('2026-10', 'gocuotas', '2026-10', 95),
    ]
    const filas = armarProyVsReal(snapshots, [mes('2026-10', 105)], '2026-11')
    expect(filas).toHaveLength(1)
    expect(filas[0].hibrido?.ventas).toBe(110)
    expect(filas[0].gocuotas?.ventas).toBe(95)
    expect(filas[0].real?.ventas).toBe(105)
  })

  it('el mes en curso y los futuros van sin real', () => {
    const snapshots = [snap('2026-10', 'hibrido', '2026-11', 120), snap('2026-10', 'hibrido', '2026-12', 130)]
    const filas = armarProyVsReal(snapshots, [mes('2026-11', 40)], '2026-11')
    expect(filas.map((f) => f.mes)).toEqual(['2026-11', '2026-12'])
    expect(filas[0].real).toBeNull()
    expect(filas[1].real).toBeNull()
  })

  it('no usa runs posteriores al mes proyectado', () => {
    // el run de noviembre "proyectando" octubre no vale como proyección de octubre
    const snapshots = [snap('2026-11', 'hibrido', '2026-10', 999), snap('2026-09', 'hibrido', '2026-10', 100)]
    const filas = armarProyVsReal(snapshots, [mes('2026-10', 105)], '2026-11')
    expect(filas[0].hibrido?.ventas).toBe(100)
  })

  it('mes cerrado proyectado sin ventas reales muestra real en 0', () => {
    const snapshots = [snap('2026-10', 'hibrido', '2026-10', 100)]
    const filas = armarProyVsReal(snapshots, [], '2026-11')
    expect(filas[0].real).toEqual({ ventas: 0, monto: 0 })
  })

  it('el mes en curso lleva realParcial con el acumulado al día (real sigue null)', () => {
    const snapshots = [snap('2026-10', 'hibrido', '2026-10', 100), snap('2026-10', 'hibrido', '2026-11', 120)]
    const filas = armarProyVsReal(snapshots, [mes('2026-10', 38)], '2026-10')
    expect(filas[0].real).toBeNull()
    expect(filas[0].realParcial).toEqual({ ventas: 38, monto: 380 })
    expect(filas[1].realParcial).toBeNull()
  })

  it('mes en curso sin ventas todavía: realParcial null, meses cerrados nunca lo llevan', () => {
    const snapshots = [snap('2026-09', 'hibrido', '2026-09', 90), snap('2026-10', 'hibrido', '2026-10', 100)]
    const filas = armarProyVsReal(snapshots, [mes('2026-09', 85)], '2026-10')
    expect(filas[0].realParcial).toBeNull()
    expect(filas[0].real?.ventas).toBe(85)
    expect(filas[1].realParcial).toBeNull()
  })
})

describe('fraccionMesTranscurrida', () => {
  it('día del mes sobre los días del mes', () => {
    expect(fraccionMesTranscurrida('2026-10-05')).toBeCloseTo(5 / 31)
    expect(fraccionMesTranscurrida('2026-02-28')).toBeCloseTo(1)
    expect(fraccionMesTranscurrida('2026-10-31')).toBeCloseTo(1)
  })
})
