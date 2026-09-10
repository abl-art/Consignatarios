import { describe, it, expect } from 'vitest'
import { simularFlujoV2, oaPorOperacion, type ParamsV2 } from '@/lib/simulador-v2'

export const basePropia: ParamsV2 = {
  schema_version: 2,
  modalidad: 'propia',
  costo_sin_iva: 100_000,
  multiplo: 2,
  modelo_id: null,
  modelo_nombre: null,
  flete: 10_000,
  order_amount: 0,
  tasa_descuento_pct: 0,
  cuotas: 5,
  anticipo_pct: 20,
  operaciones_por_mes: [1],
  splits: [{ plazo_dias: 0, porcentaje: 100 }],
  costos_operativos_pct: 2,
  imp_creditos_pct: 0.6,
  imp_debitos_pct: 0.6,
  iibb_pct: 4,
  incobrabilidad_pct: 5,
  mora_dias: 0,
  tna_fondeo_pct: 36,
  objetivo_pct_oa: 15,
}

const fila = (r: ReturnType<typeof simularFlujoV2>, concepto: string) =>
  r.filas.find(f => f.concepto === concepto)!.valores

describe('simularFlujoV2 — venta propia, caso a mano', () => {
  // Derivación a mano: PVP = 200.000. Anticipo m0 = 40.000 (siempre cobra).
  // Cuotas m1..m4 = 40.000 brutas; incob 5% → efectivo 38.000, fila incob −2.000.
  // Proveedor día 0: −121.000 en m0. IVA débito 200.000×21/121 = 34.710,74;
  // crédito 21.000; posición 13.710,74 → AFIP m1. IIBB (200.000/1,21)×4% =
  // 6.611,57 en m1. Costos op −4.000 m0. Flete −10.000 m1.
  // Imp créd: m0 −240, m1..m4 −228. Imp déb m0 −(125.000×0,006)=−750;
  // m1 −(30.322,31×0,006)=−181,93. Fondeo 3% sobre saldo negativo previo.
  const r = simularFlujoV2(basePropia)

  it('deriva el OA del múltiplo', () => {
    expect(oaPorOperacion(basePropia)).toBe(200_000)
    expect(r.indicadores.oa).toBe(200_000)
  })

  it('horizonte: 5 meses (m0..m4), sin padding', () => {
    expect(r.meses).toBe(5)
  })

  it('filas del flujo mes a mes', () => {
    expect(fila(r, 'Cobro cuotas')).toEqual([40_000, 40_000, 40_000, 40_000, 40_000])
    expect(fila(r, 'Incobrabilidad')).toEqual([0, -2_000, -2_000, -2_000, -2_000])
    expect(fila(r, 'Pago proveedor (c/IVA)')[0]).toBe(-121_000)
    expect(fila(r, 'IVA (pago AFIP)')[1]).toBeCloseTo(-13_710.74, 1)
    expect(fila(r, 'IIBB')[1]).toBeCloseTo(-6_611.57, 1)
    expect(fila(r, 'Costos operativos')[0]).toBe(-4_000)
    expect(fila(r, 'Flete')[1]).toBe(-10_000)
    expect(fila(r, 'Imp. créditos')).toEqual([-240, -228, -228, -228, -228])
    expect(fila(r, 'Imp. débitos')[0]).toBeCloseTo(-750, 2)
    expect(fila(r, 'Imp. débitos')[1]).toBeCloseTo(-181.93, 1)
    expect(fila(r, 'Costo financiación')[0]).toBe(0)
    expect(fila(r, 'Costo financiación')[1]).toBeCloseTo(-2_579.7, 1)
  })

  it('subtotal y acumulado', () => {
    const sub = fila(r, 'Subtotal')
    const acu = fila(r, 'Acumulado')
    expect(sub[0]).toBeCloseTo(-85_990, 1)
    expect(sub[1]).toBeCloseTo(4_688.05, 1)
    expect(acu[1]).toBeCloseTo(-81_301.95, 1)
    expect(acu[2]).toBeCloseTo(-45_969.01, 1)
    expect(acu[3]).toBeCloseTo(-9_576.08, 1)
    expect(acu[4]).toBeCloseTo(27_908.64, 1)
  })

  it('indicadores', () => {
    const i = r.indicadores
    expect(i.resultado).toBeCloseTo(27_908.64, 1)
    expect(i.resultado_pct_oa).toBeCloseTo(0.13954, 4) // < 15%: el solver deberá subir el múltiplo
    expect(i.capital_requerido).toBeCloseTo(85_990, 1)
    expect(i.ct_deuda_ratio).toBeCloseTo(0.42995, 4)
    expect(i.capital_promedio).toBeCloseTo(55_709.26, 1)
    expect(i.payback).toBe(4) // columna Mes 4 de la tabla — alineado, sin off-by-one
    expect(i.sin_capital).toBe(false)
    expect(i.rent_anual_capital).toBeCloseTo(1.5029, 3)
  })
})
