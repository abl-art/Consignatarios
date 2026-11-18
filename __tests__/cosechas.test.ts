import { describe, it, expect } from 'vitest'
import {
  MAX_ORDENES_COSECHA,
  validarDefCosecha,
  aplicarLimite,
  agruparModelos,
  agregarVintage,
  curvaEvolucion,
  resumenMadurez,
  type DefCosecha,
  type CuotaCosecha,
} from '@/lib/cosechas'
import type { VintageRow } from '@/lib/actions/finanzas'

const defBase = (overrides: Partial<DefCosecha> = {}): DefCosecha => ({
  nombre: 'Cosecha test',
  fechaDesde: '2026-01-01',
  fechaHasta: '2026-01-31',
  filtros: { canal: 'total' },
  limite: null,
  ...overrides,
})

describe('validarDefCosecha', () => {
  it('def válida → null', () => {
    expect(validarDefCosecha(defBase())).toBeNull()
  })

  it('nombre vacío o solo espacios → error', () => {
    expect(validarDefCosecha(defBase({ nombre: '' }))).not.toBeNull()
    expect(validarDefCosecha(defBase({ nombre: '   ' }))).not.toBeNull()
  })

  it('fechas con formato inválido → error', () => {
    expect(validarDefCosecha(defBase({ fechaDesde: '01/01/2026' }))).not.toBeNull()
    expect(validarDefCosecha(defBase({ fechaHasta: '2026-1-31' }))).not.toBeNull()
  })

  it('fechaDesde > fechaHasta → error', () => {
    expect(validarDefCosecha(defBase({ fechaDesde: '2026-02-01', fechaHasta: '2026-01-01' }))).not.toBeNull()
  })

  it('límite fuera de [1, MAX_ORDENES_COSECHA] → error', () => {
    expect(validarDefCosecha(defBase({ limite: 0 }))).not.toBeNull()
    expect(validarDefCosecha(defBase({ limite: MAX_ORDENES_COSECHA + 1 }))).not.toBeNull()
  })

  it('límite no entero (3.5) → error', () => {
    expect(validarDefCosecha(defBase({ limite: 3.5 }))).not.toBeNull()
  })

  it('límite dentro de rango o null → ok', () => {
    expect(validarDefCosecha(defBase({ limite: 1 }))).toBeNull()
    expect(validarDefCosecha(defBase({ limite: MAX_ORDENES_COSECHA }))).toBeNull()
    expect(validarDefCosecha(defBase({ limite: null }))).toBeNull()
  })
})

describe('aplicarLimite', () => {
  const filas = [1, 2, 3, 4, 5]

  it('límite null → mismas filas', () => {
    expect(aplicarLimite(filas, null)).toEqual(filas)
  })

  it('límite ≥ length → mismas filas', () => {
    expect(aplicarLimite(filas, 5)).toEqual(filas)
    expect(aplicarLimite(filas, 10)).toEqual(filas)
  })

  it('límite < length → primeras N (orden cronológico lo da el caller)', () => {
    expect(aplicarLimite(filas, 2)).toEqual([1, 2])
  })
})

describe('agruparModelos', () => {
  it('unifica variantes que normalizan igual (difieren solo en el "Moto" que normalizarModelo recorta)', () => {
    const grupos = agruparModelos([
      { model: 'Motorola Edge 60 Fusion', n: 10 },
      { model: 'Motorola Moto Edge 60 Fusion', n: 3 },
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].label).toBe('Motorola Edge 60 Fusion') // mayor n
    expect(grupos[0].n).toBe(13)
    expect(grupos[0].variantes.sort()).toEqual(['Motorola Edge 60 Fusion', 'Motorola Moto Edge 60 Fusion'].sort())
  })

  it('empate de n → label alfabético', () => {
    const grupos = agruparModelos([
      { model: 'Motorola Moto Edge 60 Fusion', n: 5 },
      { model: 'Motorola Edge 60 Fusion', n: 5 },
    ])
    expect(grupos[0].label).toBe('Motorola Edge 60 Fusion')
  })

  it('ordena grupos por n desc', () => {
    const grupos = agruparModelos([
      { model: 'iPhone 15', n: 2 },
      { model: 'Samsung A15', n: 20 },
    ])
    expect(grupos.map(g => g.n)).toEqual([20, 2])
  })
})

describe('agregarVintage', () => {
  const row = (overrides: Partial<VintageRow>): VintageRow => ({
    origination_month: '2026-01',
    amt_total: 0,
    amt_por_vencer: 0,
    amt_cobrada_en_termino: 0,
    amt_mora_1_29: 0,
    amt_mora_30_59: 0,
    amt_mora_60_89: 0,
    amt_incobrable_90_plus: 0,
    amt_recupero_1_29: 0,
    amt_recupero_30_59: 0,
    amt_recupero_60_89: 0,
    amt_recupero_90_119: 0,
    amt_recupero_120_plus: 0,
    pct_por_vencer: 0,
    pct_cobrada_en_termino: 0,
    pct_mora_1_29: 0,
    pct_mora_30_59: 0,
    pct_mora_60_89: 0,
    pct_incobrable_90_plus: 0,
    pct_recupero_1_29: 0,
    pct_recupero_30_59: 0,
    pct_recupero_60_89: 0,
    pct_recupero_90_119: 0,
    pct_recupero_120_plus: 0,
    ...overrides,
  })

  it('suma los amt_* y re-deriva cada pct_* sobre el total agregado', () => {
    const resultado = agregarVintage([
      row({ amt_total: 100, amt_cobrada_en_termino: 60, amt_mora_1_29: 40, pct_cobrada_en_termino: 60, pct_mora_1_29: 40 }),
      row({ amt_total: 200, amt_cobrada_en_termino: 100, amt_mora_1_29: 100, pct_cobrada_en_termino: 50, pct_mora_1_29: 50 }),
    ])
    // total agregado = 300, cobrada_en_termino = 160 (no 55% simple del promedio de pcts)
    expect(resultado.amt_total).toBe(300)
    expect(resultado.amt_cobrada_en_termino).toBe(160)
    expect(resultado.amt_mora_1_29).toBe(140)
    expect(resultado.pct_cobrada_en_termino).toBe(53.33)
    expect(resultado.pct_mora_1_29).toBe(46.67)
    expect('origination_month' in resultado).toBe(false)
  })

  it('total 0 → todos los pct en 0 (sin división por cero)', () => {
    const resultado = agregarVintage([row({ amt_total: 0 })])
    expect(resultado.amt_total).toBe(0)
    expect(resultado.pct_cobrada_en_termino).toBe(0)
    expect(resultado.pct_incobrable_90_plus).toBe(0)
  })
})

describe('curvaEvolucion', () => {
  const cuota = (overrides: Partial<CuotaCosecha>): CuotaCosecha => ({
    orderId: 'o1',
    venta: '2026-01-01',
    due: '2026-01-01',
    collected: null,
    descartada: false,
    cb: false,
    amount: 100,
    ...overrides,
  })

  it('sin cuotas vencidas en ningún punto → curva vacía', () => {
    const cuotas = [cuota({ orderId: 'o1', venta: '2026-01-01', due: '2026-12-31' })]
    expect(curvaEvolucion(cuotas, '2026-02-01')).toEqual([])
  })

  it('todas las cuotas descartadas → curva vacía', () => {
    const cuotas = [
      cuota({ orderId: 'o1', venta: '2026-01-01', due: '2026-01-05', descartada: true }),
      cuota({ orderId: 'o2', venta: '2026-01-01', due: '2026-01-05', descartada: true }),
    ]
    expect(curvaEvolucion(cuotas, '2026-02-01')).toEqual([])
  })

  it('cb=true cuenta como impago aunque collected esté seteado', () => {
    const cuotas = [
      cuota({ orderId: 'o1', venta: '2026-01-01', due: '2026-01-05', collected: '2026-01-06', cb: true }),
    ]
    const puntos = curvaEvolucion(cuotas, '2026-02-01')
    expect(puntos.length).toBeGreaterThan(0)
    expect(puntos[0].pctImpago).toBe(100)
  })

  it('recupero tardío: impago a los 35 días, pago recién a los 42 (collected a los 40 días)', () => {
    const cuotas = [
      cuota({ orderId: 'o1', venta: '2026-01-01', due: '2026-01-15', collected: '2026-02-10' }),
    ]
    const puntos = curvaEvolucion(cuotas, '2026-02-20')
    const p35 = puntos.find(p => p.edadDias === 35)!
    const p42 = puntos.find(p => p.edadDias === 42)!
    expect(p35.pctImpago).toBe(100)
    expect(p42.pctImpago).toBe(0)
  })

  it('2 órdenes de distinta edad: cobertura 1 mientras ambas alcanzaron esa edad, 0.5 en el tramo punteado, corte en la edad máxima', () => {
    const cuotas = [
      cuota({ orderId: 'vieja', venta: '2026-05-01', due: '2026-05-01' }),
      cuota({ orderId: 'joven', venta: '2026-06-10', due: '2026-06-10' }),
    ]
    const puntos = curvaEvolucion(cuotas, '2026-06-30', 10)
    expect(puntos.map(p => p.edadDias)).toEqual([10, 20, 30, 40, 50, 60])
    expect(puntos.map(p => p.cobertura)).toEqual([1, 1, 0.5, 0.5, 0.5, 0.5])
    expect(puntos[puntos.length - 1].edadDias).toBe(60) // corte: no hay puntos más allá de la orden más vieja
  })

  it('pctImpago ponderado por MONTO, no por cantidad de cuotas: 100 (al día) + 900 (impaga) → 90%, no 50%', () => {
    const cuotas = [
      cuota({ orderId: 'o1', venta: '2026-01-01', due: '2026-01-05', collected: '2026-01-05', amount: 100 }),
      cuota({ orderId: 'o2', venta: '2026-01-01', due: '2026-01-05', collected: null, amount: 900 }),
    ]
    const puntos = curvaEvolucion(cuotas, '2026-02-01', 7)
    const p = puntos.find(pt => pt.edadDias === 7)!
    expect(p.pctImpago).toBe(90)
  })

  it('cobertura: 199/200 órdenes alcanzaron la edad → ratio exacto (0.995), no redondea a 1 (sólido falso)', () => {
    const cuotas: CuotaCosecha[] = []
    for (let i = 0; i < 199; i++) {
      cuotas.push(cuota({ orderId: `vieja-${i}`, venta: '2026-01-01', due: '2026-01-05', collected: '2026-01-05' }))
    }
    cuotas.push(cuota({ orderId: 'joven', venta: '2026-02-20', due: '2026-02-25', collected: '2026-02-25' }))

    const puntos = curvaEvolucion(cuotas, '2026-02-21', 10)
    const p50 = puntos.find(p => p.edadDias === 50)!
    expect(p50.cobertura).toBeLessThan(1)
    expect(p50.cobertura).toBeCloseTo(199 / 200, 4)
  })
})

describe('resumenMadurez', () => {
  const cuota = (overrides: Partial<CuotaCosecha>): CuotaCosecha => ({
    orderId: 'o1',
    venta: '2026-01-01',
    due: '2026-01-01',
    collected: null,
    descartada: false,
    cb: false,
    amount: 100,
    ...overrides,
  })

  it('todas las cuotas descartadas → montoTotal 0 y sin fechas', () => {
    const resumen = resumenMadurez([cuota({ descartada: true })], '2026-02-01')
    expect(resumen.montoTotal).toBe(0)
    expect(resumen.pctPorVencer).toBe(0)
    expect(resumen.finCiclo).toBeNull()
    expect(resumen.primeraVenta).toBeNull()
    expect(resumen.ultimaVenta).toBeNull()
  })

  it('calcula montoPorVencer, finCiclo (max due + DIAS_INCOBRABLE) y edadDias de la orden más joven', () => {
    const cuotas = [
      cuota({ orderId: 'vieja', venta: '2026-01-01', due: '2026-01-10', amount: 100 }),
      cuota({ orderId: 'joven', venta: '2026-01-20', due: '2026-02-05', amount: 50 }),
    ]
    const hoy = '2026-01-25'
    const resumen = resumenMadurez(cuotas, hoy)
    expect(resumen.montoTotal).toBe(150)
    // solo la cuota "joven" (due 2026-02-05) vence después de hoy
    expect(resumen.montoPorVencer).toBe(50)
    expect(resumen.pctPorVencer).toBe(33.33)
    expect(resumen.finCiclo).toBe('2026-05-06') // 2026-02-05 + 90 días
    expect(resumen.primeraVenta).toBe('2026-01-01')
    expect(resumen.ultimaVenta).toBe('2026-01-20')
    expect(resumen.edadDias).toBe(5) // orden "joven" (venta 2026-01-20) → hoy 2026-01-25
  })
})
