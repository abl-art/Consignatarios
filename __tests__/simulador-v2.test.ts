import { describe, it, expect } from 'vitest'
import { simularFlujoV2, oaPorOperacion, tirMensual, tirImplicita, resolverPalanca, conPalanca, generarNombreV2, costoLicenciaUnitario, type ParamsV2 } from '@/lib/simulador-v2'

export const basePropia: ParamsV2 = {
  schema_version: 2,
  modalidad: 'propia',
  costo_sin_iva: 100_000,
  multiplo: 2,
  modelo_id: null,
  modelo_nombre: null,
  flete: 10_000,
  kit_seguridad: 0,
  licencias_fijo_usd: 0,
  licencias_usd_equipo: 0,
  licencias_tc: 1550,
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

describe('simularFlujoV2 — mora como costo financiero continuo', () => {
  it('mora 15d a TNA 36 genera fila de costo por cuota financiada, sin mover cobros de mes', () => {
    const r = simularFlujoV2({ ...basePropia, mora_dias: 15 })
    // 38.000 × (0,36/365) × 15 = 562,19 por cuota, m1..m4
    const mora = fila(r, 'Costo de mora')
    expect(mora[0]).toBe(0)
    for (const m of [1, 2, 3, 4]) expect(mora[m]).toBeCloseTo(-562.19, 1)
    expect(fila(r, 'Cobro cuotas')).toEqual([40_000, 40_000, 40_000, 40_000, 40_000])
    expect(r.meses).toBe(5) // sin salto de mes entero (v1: ceil(15/30)=1 corría todo)
    const base = simularFlujoV2(basePropia)
    expect(r.indicadores.resultado).toBeLessThan(base.indicadores.resultado)
  })

  it('mora 14d y 16d dan costos distintos (continuo, no bucketizado)', () => {
    const r14 = simularFlujoV2({ ...basePropia, mora_dias: 14 })
    const r16 = simularFlujoV2({ ...basePropia, mora_dias: 16 })
    expect(r14.indicadores.resultado).toBeGreaterThan(r16.indicadores.resultado)
  })
})

describe('simularFlujoV2 — venta de terceros, caso a mano', () => {
  // OA 100.000, d 10%, 4 cuotas, anticipo 25%, liq 100% día 0, TNA 36,
  // op 1%, imp 0,6/0,6, IIBB 4%, incob 4%, mora 0.
  // m0: +25.000 −90.000 −1.000 −150 −546 = −66.696.
  // IVA comisión 10.000×21/121 = 1.735,54 (AFIP m1); IIBB (10.000/1,21)×4% = 330,58 (m1).
  // m1: fondeo −2.000,88 → subtotal 19.776,61, acum −46.919,39.
  // m3 final: acum −1.349,10 → ¡d=10% pierde plata! (caso real para el solver)
  const terceros: ParamsV2 = {
    ...basePropia,
    modalidad: 'terceros',
    order_amount: 100_000,
    tasa_descuento_pct: 10,
    costo_sin_iva: 0,
    multiplo: 0,
    flete: 0,
    cuotas: 4,
    anticipo_pct: 25,
    costos_operativos_pct: 1,
    incobrabilidad_pct: 4,
  }
  const r = simularFlujoV2(terceros)

  it('filas clave', () => {
    expect(fila(r, 'Liquidación comercio')[0]).toBe(-90_000)
    expect(fila(r, 'IVA (pago AFIP)')[1]).toBeCloseTo(-1_735.54, 1)
    expect(fila(r, 'IIBB')[1]).toBeCloseTo(-330.58, 1)
    expect(fila(r, 'Incobrabilidad')).toEqual([0, -1_000, -1_000, -1_000])
    expect(fila(r, 'Imp. débitos')[0]).toBeCloseTo(-546, 1)
    expect(r.filas.find(f => f.concepto === 'Flete')).toBeUndefined()
  })

  it('acumulado y resultado negativo', () => {
    const acu = fila(r, 'Acumulado')
    expect(acu[0]).toBeCloseTo(-66_696, 1)
    expect(acu[1]).toBeCloseTo(-46_919.39, 1)
    expect(acu[2]).toBeCloseTo(-24_470.97, 1)
    expect(acu[3]).toBeCloseTo(-1_349.10, 1)
    expect(r.meses).toBe(4)
    expect(r.indicadores.resultado).toBeCloseTo(-1_349.10, 1)
    expect(r.indicadores.payback).toBeNull()
    expect(r.indicadores.capital_requerido).toBeCloseTo(66_696, 1)
  })
})

describe('simularFlujoV2 — casos borde', () => {
  it('sin capital: liquidación a 90 días con anticipo alto → nunca negativo', () => {
    const r = simularFlujoV2({
      ...basePropia,
      modalidad: 'terceros',
      order_amount: 100_000,
      tasa_descuento_pct: 10,
      cuotas: 4,
      anticipo_pct: 25,
      costos_operativos_pct: 0,
      incobrabilidad_pct: 0,
      splits: [{ plazo_dias: 90, porcentaje: 100 }],
    })
    expect(r.indicadores.sin_capital).toBe(true)
    expect(r.indicadores.capital_requerido).toBe(0)
    expect(r.indicadores.rent_anual_capital).toBeNull()
    expect(r.indicadores.payback).toBeNull() // nunca fue negativo: no hay payback que medir
  })

  it('1 cuota: todo es anticipo, sin cuotas financiadas ni incobrabilidad', () => {
    const r = simularFlujoV2({ ...basePropia, cuotas: 1, anticipo_pct: 100 })
    expect(fila(r, 'Cobro cuotas')[0]).toBe(200_000)
    expect(fila(r, 'Incobrabilidad').every(v => v === 0)).toBe(true)
  })

  it('split día 0 vs día 30: pagar antes requiere más capital', () => {
    const dia0 = simularFlujoV2(basePropia)
    const dia30 = simularFlujoV2({ ...basePropia, splits: [{ plazo_dias: 30, porcentaje: 100 }] })
    expect(dia0.indicadores.capital_requerido).toBeGreaterThan(dia30.indicadores.capital_requerido)
  })

  it('IVA a favor se arrastra: múltiplo 1 (débito < crédito) no paga AFIP', () => {
    const r = simularFlujoV2({ ...basePropia, multiplo: 1 })
    // débito = 200k/2×21/121=17.355 < crédito 21.000 → posición a favor, nunca se paga
    expect(fila(r, 'IVA (pago AFIP)').every(v => v === 0)).toBe(true)
  })

  it('multi-cohorte: 2 meses de ops duplican el volumen', () => {
    const r = simularFlujoV2({ ...basePropia, operaciones_por_mes: [1, 1] })
    expect(fila(r, 'Pago proveedor (c/IVA)')[0]).toBe(-121_000)
    expect(fila(r, 'Pago proveedor (c/IVA)')[1]).toBe(-121_000)
    expect(fila(r, 'Cobro cuotas')[1]).toBe(80_000) // cuota m1 de cohorte 0 + anticipo cohorte 1
  })
})

describe('tirMensual', () => {
  it('crédito sintético de TEM 5% conocida', () => {
    // PV=100.000, 3 cuotas: pmt = 100.000×0,05/(1−1,05^−3) = 36.720,9
    expect(tirMensual([-100_000, 36_721, 36_721, 36_721])!).toBeCloseTo(0.05, 3)
  })
  it('sin cambio de signo → null', () => {
    expect(tirMensual([1000, 1000])).toBeNull()
  })
})

describe('tirImplicita', () => {
  it('caso base propia: flujo [−81.000, 40.000×4]', () => {
    // −121.000 + 40.000 anticipo = −81.000; VAN=0 en tem≈0,3412 (verificado a
    // mano: VAN(0,34122)=−81.000+40.000×[(1−1,34122^−4)/0,34122]≈2,9e-11≈0;
    // el 0,3465 de la premisa original del brief no anula el VAN — VAN(0,3465)≈−678)
    const t = tirImplicita(basePropia)!
    expect(t.tem).toBeCloseTo(0.3412, 2)
    expect(t.tna).toBeCloseTo(t.tem * 12, 10)
    expect(t.tea).toBeCloseTo(Math.pow(1 + t.tem, 12) - 1, 6)
  })
  it('terceros → null', () => {
    expect(tirImplicita({ ...basePropia, modalidad: 'terceros', order_amount: 100_000, tasa_descuento_pct: 10 })).toBeNull()
  })
})

describe('resolverPalanca', () => {
  it('propia: múltiplo 2 da 13,95% < 15% → el solver devuelve más de 2', () => {
    const { palanca, alcanzable } = resolverPalanca(basePropia)
    expect(alcanzable).toBe(true)
    expect(palanca).toBeGreaterThan(2)
    // autoconsistencia: en la palanca cumple; un pelo abajo no cumple
    const en = simularFlujoV2(conPalanca(basePropia, palanca))
    const bajo = simularFlujoV2(conPalanca(basePropia, palanca - 0.01))
    expect(en.indicadores.resultado_pct_oa).toBeGreaterThanOrEqual(0.15 - 1e-6)
    expect(bajo.indicadores.resultado_pct_oa).toBeLessThan(0.15)
  })

  it('terceros: d=10% pierde plata → el solver devuelve d>10', () => {
    const t: ParamsV2 = { ...basePropia, modalidad: 'terceros', order_amount: 100_000,
      tasa_descuento_pct: 10, cuotas: 4, anticipo_pct: 25, costos_operativos_pct: 1,
      incobrabilidad_pct: 4, flete: 0 }
    const { palanca, alcanzable } = resolverPalanca(t)
    expect(alcanzable).toBe(true)
    expect(palanca).toBeGreaterThan(10)
    const en = simularFlujoV2(conPalanca(t, palanca))
    expect(en.indicadores.resultado_pct_oa).toBeGreaterThanOrEqual(0.15 - 1e-6)
  })

  it('objetivo inalcanzable → flag', () => {
    const { alcanzable } = resolverPalanca({ ...basePropia, objetivo_pct_oa: 500 })
    expect(alcanzable).toBe(false)
  })
})

describe('generarNombreV2', () => {
  it('propia con modelo', () => {
    expect(generarNombreV2({ ...basePropia, cuotas: 9, modelo_nombre: 'Moto G06' }))
      .toBe('Vta Propia — Moto G06 — 9 cuotas — obj 15%')
  })
  it('terceros con splits', () => {
    expect(generarNombreV2({ ...basePropia, modalidad: 'terceros', cuotas: 9,
      splits: [{ plazo_dias: 0, porcentaje: 100 }] }))
      .toBe('Vta Terceros — 9 cuotas — liq 100% a 0d — obj 15%')
  })
})

describe('kit de seguridad', () => {
  it('propia: 4 pagos iguales a 30/60/90/120 días (financiación Mil200)', () => {
    const r = simularFlujoV2({ ...basePropia, kit_seguridad: 7_500 })
    expect(fila(r, 'Kit de seguridad')).toEqual([0, -1_875, -1_875, -1_875, -1_875])
    // cada pago entra en la base de imp. débitos de su mes
    const sin = simularFlujoV2(basePropia)
    expect(fila(r, 'Imp. débitos')[1]).toBeCloseTo(fila(sin, 'Imp. débitos')[1] - 1_875 * 0.006, 2)
  })

  it('el pago a 120d puede extender el horizonte más allá de las cuotas', () => {
    const r = simularFlujoV2({ ...basePropia, cuotas: 1, anticipo_pct: 100, kit_seguridad: 7_500 })
    expect(r.meses).toBe(5) // m0 venta + pagos m1..m4
    expect(fila(r, 'Kit de seguridad')).toEqual([0, -1_875, -1_875, -1_875, -1_875])
  })

  it('propia sin kit: fila en cero', () => {
    const r = simularFlujoV2(basePropia)
    expect(fila(r, 'Kit de seguridad')).toEqual([0, 0, 0, 0, 0])
  })

  it('terceros: no genera fila ni egreso', () => {
    const t: ParamsV2 = { ...basePropia, modalidad: 'terceros', order_amount: 100_000,
      tasa_descuento_pct: 15, cuotas: 4, anticipo_pct: 25, kit_seguridad: 7_500 }
    const r = simularFlujoV2(t)
    expect(r.filas.some(f => f.concepto === 'Kit de seguridad')).toBe(false)
  })
})

describe('licencias', () => {
  // 500 ops: (1.000 + 500×3,5) USD × 1.550 = 4.262.500 al m+2.
  // Unitario: (1.000/500 + 3,5) × 1.550 = 8.525 $/equipo.
  const conLic: ParamsV2 = { ...basePropia, operaciones_por_mes: [500],
    licencias_fijo_usd: 1_000, licencias_usd_equipo: 3.5, licencias_tc: 1_550 }

  it('propia: fijo + variable al TC, pagado vencido a 60 días (m+2)', () => {
    const r = simularFlujoV2(conLic)
    const lic = r.filas.find(f => f.concepto.startsWith('Licencias'))!
    expect(lic.valores[0]).toBe(0)
    expect(lic.valores[1]).toBe(0)
    expect(lic.valores[2]).toBe(-4_262_500)
    expect(lic.valores.slice(3).every(v => v === 0)).toBe(true)
  })

  it('el costo unitario se muestra en el concepto de la fila', () => {
    expect(costoLicenciaUnitario(conLic)).toBeCloseTo(8_525, 2)
    const r = simularFlujoV2(conLic)
    expect(r.filas.some(f => f.concepto === 'Licencias ($8.525/u)')).toBe(true)
  })

  it('entra en la base de imp. débitos de su mes', () => {
    const r = simularFlujoV2(conLic)
    const sin = simularFlujoV2({ ...basePropia, operaciones_por_mes: [500] })
    const dif = fila(r, 'Imp. débitos')[2] - fila(sin, 'Imp. débitos')[2]
    expect(dif).toBeCloseTo(-4_262_500 * 0.006, 1)
  })

  it('terceros: no genera fila', () => {
    const t: ParamsV2 = { ...conLic, modalidad: 'terceros', order_amount: 100_000,
      tasa_descuento_pct: 15, cuotas: 4, anticipo_pct: 25 }
    const r = simularFlujoV2(t)
    expect(r.filas.some(f => f.concepto.startsWith('Licencias'))).toBe(false)
  })
})
