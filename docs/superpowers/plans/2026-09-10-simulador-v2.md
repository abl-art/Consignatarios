# Simulador Financiero v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el simulador financiero de /finanzas por un motor determinístico v2 con IVA real, datos por canal (propio/terceros) y un solver que despeja la palanca mínima (múltiplo o tasa de descuento) para un objetivo de resultado neto sobre order amount.

**Architecture:** Motor puro nuevo en `lib/simulador-v2.ts` (el viejo `lib/simulador.ts` queda intacto hasta el swap de UI para que cada commit compile). Datos reales por canal vía parametrización de fetchers existentes + acción nueva `getDatosSimulador`. UI: `SimuladorTab.tsx` reescrito (selector de modalidad → parámetros → solver → flujo), `ListaPreciosTab.tsx` reemplazado por `ProductosTab.tsx`.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind, Supabase (tabla `productos_financieros`), Postgres directo vía `getPool()` de `@/lib/db-pool`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-simulador-v2-design.md`

## Global Constraints

- Antes de CADA commit: `npx tsc --noEmit` limpio y `npm test` verde.
- Tests en `__tests__/<nombre>.test.ts` (vitest, `globals: true` — usar `describe/it/expect` sin imports de vitest, como `__tests__/lista-precios.test.ts`).
- Lógica pura en `lib/` sin `'use server'`/`'use client'`; helpers compartidos server+client NUNCA exportados desde módulos `'use client'` (regla del repo).
- UI en español, estilo Finanzas (tarjetas `bg-white rounded-xl border border-gray-200`, botones `bg-gray-900`), tarjetas de navegación estilo Compras.
- IVA = 21% constante. Todos los `%` de parámetros se ingresan como número humano (15 = 15%).
- `oa` (order amount) en propia SIEMPRE se deriva: `costo_sin_iva × multiplo`.
- No tocar `lib/simulador.ts` ni `ListaPreciosTab.tsx` hasta la Task 10 (siguen en uso por la UI vieja mientras tanto).
- Mensajes de commit con el trailer de Co-Authored-By del harness.

---

### Task 1: Motor v2 — tipos + `simularFlujoV2` + test venta propia calculado a mano

**Files:**
- Create: `lib/simulador-v2.ts`
- Test: `__tests__/simulador-v2.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro nuevo).
- Produces (para Tasks 2-9):

```ts
export type Modalidad = 'propia' | 'terceros'
export interface SplitConfig { plazo_dias: number; porcentaje: number }
export interface ParamsV2 {
  schema_version: 2
  modalidad: Modalidad
  // propia
  costo_sin_iva: number        // $ sin IVA
  multiplo: number             // palanca propia; PVP = costo_sin_iva × multiplo (IVA incluido)
  modelo_id: string | null     // FilaListaPrecios.productoId elegido (null en terceros)
  modelo_nombre: string | null
  flete: number                // $ por operación, solo propia
  // terceros
  order_amount: number         // $ con IVA, solo terceros (en propia se ignora)
  tasa_descuento_pct: number   // palanca terceros
  // comunes
  cuotas: number
  anticipo_pct: number         // default 100/cuotas
  operaciones_por_mes: number[]
  splits: SplitConfig[]        // propia: pago a proveedor; terceros: liquidación al comercio. Día 0 permitido.
  costos_operativos_pct: number
  imp_creditos_pct: number
  imp_debitos_pct: number
  iibb_pct: number
  incobrabilidad_pct: number
  mora_dias: number
  tna_fondeo_pct: number
  objetivo_pct_oa: number      // default 15
}
export interface FlujoFila { concepto: string; valores: number[]; esSubtotal?: boolean; esAcumulado?: boolean }
export interface IndicadoresV2 {
  oa: number                       // por operación
  resultado: number                // acumulado final
  resultado_pct_oa: number         // resultado / (oa × totalOps), fracción (0.15 = 15%)
  capital_requerido: number        // pico negativo del acumulado (positivo)
  capital_promedio: number
  ct_deuda_ratio: number
  payback: number | null           // ÍNDICE de columna (Mes N de la tabla); null si nunca recupera
  rent_anual_capital: number | null // null cuando sin_capital
  sin_capital: boolean
}
export interface ResultadoV2 { filas: FlujoFila[]; indicadores: IndicadoresV2; meses: number }
export function oaPorOperacion(p: ParamsV2): number
export function simularFlujoV2(p: ParamsV2): ResultadoV2
```

- [ ] **Step 1: Escribir el test que falla (caso a mano, venta propia, mora 0)**

Crear `__tests__/simulador-v2.test.ts`. El caso está verificado a mano número por número; los valores esperados de abajo son la referencia — si el motor no los reproduce, el motor está mal, no el test.

```ts
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run __tests__/simulador-v2.test.ts`
Expected: FAIL — `Cannot find module '@/lib/simulador-v2'`.

- [ ] **Step 3: Implementar el motor**

Crear `lib/simulador-v2.ts` con las interfaces del bloque **Produces** y esta implementación:

```ts
// Motor financiero determinístico v2 — corre 100% client-side.
// Premisa: cada producto vendido es el vehículo para originar un crédito.

const IVA = 0.21

function zeros(n: number): number[] { return new Array(n).fill(0) }

export function oaPorOperacion(p: ParamsV2): number {
  return p.modalidad === 'propia' ? p.costo_sin_iva * p.multiplo : p.order_amount
}

export function simularFlujoV2(p: ParamsV2): ResultadoV2 {
  const oa = oaPorOperacion(p)
  const incob = p.incobrabilidad_pct / 100
  const tasaMensual = p.tna_fondeo_pct / 100 / 12
  const tasaDiaria = p.tna_fondeo_pct / 100 / 365
  const mesesOps = p.operaciones_por_mes.length
  const maxMesSplit = p.splits.length > 0
    ? Math.max(...p.splits.map(s => Math.floor(s.plazo_dias / 30)))
    : 0
  // +2: lugar para IVA/IIBB/flete a mes vencido de la última cohorte
  const totalMeses = mesesOps + Math.max(p.cuotas, maxMesSplit + 1) + 2

  const cobroBruto = zeros(totalMeses)     // contractual (fila visible)
  const cobroEfectivo = zeros(totalMeses)  // neto de incobrabilidad (base de imp. créditos)
  const incobFila = zeros(totalMeses)
  const pagoPrincipal = zeros(totalMeses)  // propia: proveedor c/IVA; terceros: liquidación comercio
  const ivaDevengado = zeros(totalMeses)   // posición del mes (débito − crédito), se paga m+1
  const ivaFila = zeros(totalMeses)        // pagos reales a AFIP
  const iibbFila = zeros(totalMeses)
  const costosOp = zeros(totalMeses)
  const fleteFila = zeros(totalMeses)
  const impCred = zeros(totalMeses)
  const impDeb = zeros(totalMeses)
  const moraFila = zeros(totalMeses)
  const fondeo = zeros(totalMeses)

  for (let m0 = 0; m0 < mesesOps; m0++) {
    const ops = p.operaciones_por_mes[m0] || 0
    if (ops === 0) continue
    const anticipo = oa * (p.anticipo_pct / 100)
    const nRestantes = p.cuotas - 1
    const cuotaResto = nRestantes > 0 ? (oa - anticipo) / nRestantes : 0

    // Anticipo: se cobra en el acto, sin incobrabilidad ni mora
    cobroBruto[m0] += ops * anticipo
    cobroEfectivo[m0] += ops * anticipo

    // Cuotas financiadas: incobrabilidad % sobre cada cuota; mora como costo
    // financiero fino (el cobro se atrasa mora_dias → fondeo extra a TNA diaria)
    for (let c = 1; c <= nRestantes; c++) {
      const m = m0 + c
      cobroBruto[m] += ops * cuotaResto
      const efectivo = cuotaResto * (1 - incob)
      cobroEfectivo[m] += ops * efectivo
      incobFila[m] -= ops * cuotaResto * incob
      moraFila[m] -= ops * efectivo * tasaDiaria * p.mora_dias
    }

    // Egreso principal según splits (día 0 → mismo mes: floor, no ceil)
    const egresoPrincipal = p.modalidad === 'propia'
      ? p.costo_sin_iva * (1 + IVA)
      : oa * (1 - p.tasa_descuento_pct / 100)
    for (const s of p.splits) {
      const m = m0 + Math.floor(s.plazo_dias / 30)
      pagoPrincipal[m] -= ops * egresoPrincipal * (s.porcentaje / 100)
    }

    // IVA: el débito fiscal se devenga COMPLETO al facturar (m0), se cobre
    // en cuotas o no; en propia neteado con el crédito de la compra
    if (p.modalidad === 'propia') {
      ivaDevengado[m0] += ops * (oa * IVA / (1 + IVA) - p.costo_sin_iva * IVA)
    } else {
      ivaDevengado[m0] += ops * oa * (p.tasa_descuento_pct / 100) * IVA / (1 + IVA)
    }

    // IIBB mes vencido, sobre el ingreso devengado neto de IVA
    const baseIibb = p.modalidad === 'propia'
      ? oa / (1 + IVA)
      : oa * (p.tasa_descuento_pct / 100) / (1 + IVA)
    iibbFila[m0 + 1] -= ops * baseIibb * (p.iibb_pct / 100)

    costosOp[m0] -= ops * oa * (p.costos_operativos_pct / 100)
    if (p.modalidad === 'propia' && p.flete > 0) fleteFila[m0 + 1] -= ops * p.flete
  }

  // Pago de IVA a AFIP: la posición del mes se paga al mes siguiente;
  // saldo a favor (posición negativa) se arrastra contra meses futuros
  let saldoIva = 0
  for (let m = 0; m + 1 < totalMeses; m++) {
    saldoIva += ivaDevengado[m]
    if (saldoIva > 0) {
      ivaFila[m + 1] -= saldoIva
      saldoIva = 0
    }
  }

  // Imp. créditos sobre cobros EFECTIVOS; imp. débitos sobre TODOS los egresos
  // bancarios operativos (no sobre fondeo/mora, que son intereses)
  for (let m = 0; m < totalMeses; m++) {
    impCred[m] -= cobroEfectivo[m] * (p.imp_creditos_pct / 100)
    const debitos = -(pagoPrincipal[m] + ivaFila[m] + iibbFila[m] + costosOp[m] + fleteFila[m])
    impDeb[m] -= debitos * (p.imp_debitos_pct / 100)
  }

  // Horizonte: hasta el último mes con movimiento OPERATIVO. El fondeo no
  // extiende el horizonte (si el negocio termina en pérdida, la historia
  // termina ahí — no se acumula interés a perpetuidad)
  let ultimo = 0
  for (let m = 0; m < totalMeses; m++) {
    const mov = cobroBruto[m] + incobFila[m] + pagoPrincipal[m] + ivaFila[m] +
      iibbFila[m] + costosOp[m] + fleteFila[m] + impCred[m] + impDeb[m] + moraFila[m]
    if (mov !== 0) ultimo = m
  }
  const meses = ultimo + 1

  const subtotal = zeros(meses)
  const acumulado = zeros(meses)
  let acum = 0
  for (let m = 0; m < meses; m++) {
    subtotal[m] = cobroBruto[m] + incobFila[m] + pagoPrincipal[m] + ivaFila[m] +
      iibbFila[m] + costosOp[m] + fleteFila[m] + impCred[m] + impDeb[m] + moraFila[m]
    if (acum < 0) fondeo[m] = acum * tasaMensual
    subtotal[m] += fondeo[m]
    acum += subtotal[m]
    acumulado[m] = acum
  }

  const trim = (arr: number[]) => arr.slice(0, meses)
  const filas: FlujoFila[] = [
    { concepto: 'Cobro cuotas', valores: trim(cobroBruto) },
    { concepto: 'Incobrabilidad', valores: trim(incobFila) },
    {
      concepto: p.modalidad === 'propia' ? 'Pago proveedor (c/IVA)' : 'Liquidación comercio',
      valores: trim(pagoPrincipal),
    },
    { concepto: 'IVA (pago AFIP)', valores: trim(ivaFila) },
    { concepto: 'IIBB', valores: trim(iibbFila) },
    { concepto: 'Costos operativos', valores: trim(costosOp) },
  ]
  if (p.modalidad === 'propia') filas.push({ concepto: 'Flete', valores: trim(fleteFila) })
  filas.push(
    { concepto: 'Imp. créditos', valores: trim(impCred) },
    { concepto: 'Imp. débitos', valores: trim(impDeb) },
    { concepto: 'Costo de mora', valores: trim(moraFila) },
    { concepto: 'Costo financiación', valores: trim(fondeo) },
    { concepto: 'Subtotal', valores: subtotal, esSubtotal: true },
    { concepto: 'Acumulado', valores: acumulado, esAcumulado: true },
  )

  // Indicadores
  const totalOps = p.operaciones_por_mes.reduce((s, n) => s + n, 0)
  const volumen = oa * totalOps
  const resultado = meses > 0 ? acumulado[meses - 1] : 0
  const capitalRequerido = Math.abs(Math.min(0, ...acumulado))

  let payback: number | null = null
  let tuvoNegativo = false
  for (let m = 0; m < meses; m++) {
    if (tuvoNegativo && payback === null && acumulado[m] >= 0) payback = m
    if (acumulado[m] < 0) tuvoNegativo = true
  }

  const negativos = acumulado.filter(v => v < 0)
  const mesesInvertidos = negativos.length
  const capitalPromedio = mesesInvertidos > 0
    ? negativos.reduce((s, v) => s + Math.abs(v), 0) / mesesInvertidos
    : 0
  const sinCapital = capitalRequerido === 0
  const rentAnualCapital = sinCapital || capitalPromedio === 0
    ? null
    : (resultado / capitalPromedio) * (12 / mesesInvertidos)

  const indicadores: IndicadoresV2 = {
    oa,
    resultado,
    resultado_pct_oa: volumen > 0 ? resultado / volumen : 0,
    capital_requerido: capitalRequerido,
    capital_promedio: capitalPromedio,
    ct_deuda_ratio: volumen > 0 ? capitalRequerido / volumen : 0,
    payback,
    rent_anual_capital: rentAnualCapital,
    sin_capital: sinCapital,
  }

  return { filas, indicadores, meses }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run __tests__/simulador-v2.test.ts`
Expected: PASS (todos los asserts del caso a mano).

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit && npm test
git add lib/simulador-v2.ts __tests__/simulador-v2.test.ts
git commit -m "feat(simulador): motor v2 con IVA real, incobrabilidad sobre expuesto y horizonte sin padding"
```

---

### Task 2: Tests de mora y de venta de terceros (caso a mano)

**Files:**
- Modify: `__tests__/simulador-v2.test.ts` (agregar describes)
- Modify: `lib/simulador-v2.ts` (solo si algún assert revela un bug)

**Interfaces:**
- Consumes: `simularFlujoV2`, `basePropia` (exportado del test de Task 1).
- Produces: nada nuevo — valida el motor.

- [ ] **Step 1: Agregar los tests**

```ts
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
```

Nota: `fila` y `basePropia` ya existen en el archivo; `terceros` reusa `basePropia` con overrides — los campos de propia (`costo_sin_iva: 0, multiplo: 0`) no se usan en modalidad terceros.

- [ ] **Step 2: Correr y verificar**

Run: `npx vitest run __tests__/simulador-v2.test.ts`
Expected: PASS. Si algún valor difiere, el bug está en el motor (los números están verificados a mano) — corregir `lib/simulador-v2.ts`, NO ajustar el test al resultado.

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit && npm test
git add __tests__/simulador-v2.test.ts lib/simulador-v2.ts
git commit -m "test(simulador): mora continua y caso a mano de terceros"
```

---

### Task 3: Casos borde de indicadores

**Files:**
- Modify: `__tests__/simulador-v2.test.ts`
- Modify: `lib/simulador-v2.ts` (si un assert revela bug)

**Interfaces:**
- Consumes: `simularFlujoV2`, `basePropia`, `fila`.
- Produces: nada nuevo.

- [ ] **Step 1: Agregar tests**

```ts
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
```

- [ ] **Step 2: Correr, corregir motor si hace falta, verificar PASS**

Run: `npx vitest run __tests__/simulador-v2.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit && npm test
git add __tests__/simulador-v2.test.ts lib/simulador-v2.ts
git commit -m "test(simulador): casos borde (sin capital, 1 cuota, dia 0, IVA a favor, multi-cohorte)"
```

---

### Task 4: TIR implícita del crédito

**Files:**
- Modify: `lib/simulador-v2.ts`
- Modify: `__tests__/simulador-v2.test.ts`

**Interfaces:**
- Consumes: `ParamsV2`, `oaPorOperacion`.
- Produces:

```ts
export function tirMensual(flujo: number[]): number | null
// bisección del VAN en i ∈ [-0.99, 10]; null si no hay cambio de signo en el flujo

export function tirImplicita(p: ParamsV2): { tem: number; tna: number; tea: number } | null
// Solo propia. Premisa margen-de-producto-cero: el crédito es entregar el
// equipo a costo c/IVA y recibir el flujo CONTRACTUAL (sin incobrabilidad):
// flujo[0] = anticipo − costo_sin_iva×1,21; flujo[c] = cuotaResto (c=1..cuotas−1).
// tna = tem×12; tea = (1+tem)^12 − 1. null en terceros o sin solución.
```

- [ ] **Step 1: Escribir tests que fallan**

```ts
import { tirMensual, tirImplicita } from '@/lib/simulador-v2'

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
    // −121.000 + 40.000 anticipo = −81.000; VAN=0 en tem≈0,3465
    const t = tirImplicita(basePropia)!
    expect(t.tem).toBeCloseTo(0.3465, 3)
    expect(t.tna).toBeCloseTo(t.tem * 12, 10)
    expect(t.tea).toBeCloseTo(Math.pow(1 + t.tem, 12) - 1, 6)
  })
  it('terceros → null', () => {
    expect(tirImplicita({ ...basePropia, modalidad: 'terceros', order_amount: 100_000, tasa_descuento_pct: 10 })).toBeNull()
  })
})
```

Verificación a mano del 0,3465: VAN(i) = −81.000 + 40.000×[(1−(1+i)^−4)/i]. Con i=0,3465: (1,3465)^4 = 3,287; factor = (1−0,30422)/0,3465 = 2,00804; 40.000×2,00804 = 80.321 ≈ 81.000 → ajustar tolerancia: usar `toBeCloseTo(esperado, 2)` donde `esperado` sale de correr la bisección una vez y VERIFICAR en planilla que VAN(esperado)≈0 antes de fijarlo. Si difiere de 0,3465 en más de 0,01, revisar la implementación, no el número.

- [ ] **Step 2: Correr y verificar FAIL** (`tirMensual is not a function`)

- [ ] **Step 3: Implementar**

```ts
export function tirMensual(flujo: number[]): number | null {
  const hayPos = flujo.some(v => v > 0)
  const hayNeg = flujo.some(v => v < 0)
  if (!hayPos || !hayNeg) return null
  const van = (i: number) => flujo.reduce((s, f, t) => s + f / Math.pow(1 + i, t), 0)
  let lo = -0.99, hi = 10
  if (van(lo) * van(hi) > 0) return null
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    if (van(lo) * van(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

export function tirImplicita(p: ParamsV2): { tem: number; tna: number; tea: number } | null {
  if (p.modalidad !== 'propia') return null
  const oa = oaPorOperacion(p)
  const anticipo = oa * (p.anticipo_pct / 100)
  const nRestantes = p.cuotas - 1
  if (nRestantes <= 0) return null
  const cuotaResto = (oa - anticipo) / nRestantes
  const flujo = [anticipo - p.costo_sin_iva * (1 + IVA), ...new Array(nRestantes).fill(cuotaResto)]
  const tem = tirMensual(flujo)
  if (tem === null) return null
  return { tem, tna: tem * 12, tea: Math.pow(1 + tem, 12) - 1 }
}
```

- [ ] **Step 4: Correr y verificar PASS** — `npx vitest run __tests__/simulador-v2.test.ts`

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm test
git add lib/simulador-v2.ts __tests__/simulador-v2.test.ts
git commit -m "feat(simulador): TIR implicita del credito (premisa margen-producto-cero)"
```

---

### Task 5: Solver de palanca mínima + nombre de producto

**Files:**
- Modify: `lib/simulador-v2.ts`
- Modify: `__tests__/simulador-v2.test.ts`

**Interfaces:**
- Consumes: `simularFlujoV2`, `ParamsV2`.
- Produces:

```ts
export function conPalanca(p: ParamsV2, v: number): ParamsV2
// propia: {...p, multiplo: v}; terceros: {...p, tasa_descuento_pct: v}

export function resolverPalanca(p: ParamsV2): { palanca: number; alcanzable: boolean }
// Búsqueda binaria de la palanca mínima con resultado_pct_oa ≥ objetivo_pct_oa/100.
// Rangos: propia múltiplo [1, 5]; terceros tasa [0, 60]. 60 iteraciones.
// alcanzable=false si ni el tope del rango cumple (palanca = tope).

export function generarNombreV2(p: ParamsV2): string
// propia:   "Vta Propia — <modelo_nombre ?? 'genérico'> — 9 cuotas — obj 15%"
// terceros: "Vta Terceros — 9 cuotas — liq 100% a 0d — obj 15%"
```

- [ ] **Step 1: Tests que fallan**

```ts
import { resolverPalanca, conPalanca, generarNombreV2 } from '@/lib/simulador-v2'

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
```

- [ ] **Step 2: Correr y verificar FAIL**

- [ ] **Step 3: Implementar**

```ts
export function conPalanca(p: ParamsV2, v: number): ParamsV2 {
  return p.modalidad === 'propia' ? { ...p, multiplo: v } : { ...p, tasa_descuento_pct: v }
}

export function resolverPalanca(p: ParamsV2): { palanca: number; alcanzable: boolean } {
  const [lo0, hi0] = p.modalidad === 'propia' ? [1, 5] : [0, 60]
  const objetivo = p.objetivo_pct_oa / 100
  const cumple = (v: number) =>
    simularFlujoV2(conPalanca(p, v)).indicadores.resultado_pct_oa >= objetivo
  if (!cumple(hi0)) return { palanca: hi0, alcanzable: false }
  let lo = lo0, hi = hi0
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    if (cumple(mid)) hi = mid
    else lo = mid
  }
  return { palanca: hi, alcanzable: true }
}

export function generarNombreV2(p: ParamsV2): string {
  const obj = `obj ${p.objetivo_pct_oa}%`
  if (p.modalidad === 'propia') {
    return `Vta Propia — ${p.modelo_nombre ?? 'genérico'} — ${p.cuotas} cuotas — ${obj}`
  }
  const liq = p.splits.map(s => `${s.porcentaje}% a ${s.plazo_dias}d`).join(' / ')
  return `Vta Terceros — ${p.cuotas} cuotas — liq ${liq} — ${obj}`
}
```

- [ ] **Step 4: Correr y verificar PASS** — `npx vitest run __tests__/simulador-v2.test.ts`

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm test
git add lib/simulador-v2.ts __tests__/simulador-v2.test.ts
git commit -m "feat(simulador): solver de palanca minima por busqueda binaria + nombre v2"
```

---

### Task 6: Derivación pura de datos de canal (incobrabilidad y mora del vintage)

**Files:**
- Create: `lib/simulador-canal.ts`
- Test: `__tests__/simulador-canal.test.ts`

**Interfaces:**
- Consumes: nada (puro; define su propia forma estructural compatible con las rows de `fetchVintageAnalysis`).
- Produces:

```ts
export interface CohorteVintage {
  origination_month: string // 'YYYY-MM'
  amt_total: number
  amt_incobrable_120_plus: number
  amt_cobrada_en_termino: number
  amt_recupero_1_29: number
  amt_recupero_30_59: number
  amt_recupero_60_89: number
  amt_recupero_90_119: number
  amt_recupero_120_plus: number
}
export interface DatosCanal {
  incobrabilidad_pct: number | null // % (5 = 5%)
  fpd_pct: number | null
  mora_dias: number | null
  ticket_promedio: number | null
}
export function derivarIncobrabilidad(rows: CohorteVintage[], hoy: Date): number | null
// cohortes con originación ≥ 6 meses antes de hoy, ponderado por amt_total
export function derivarMoraDias(rows: CohorteVintage[]): number | null
// promedio ponderado sobre lo COBRADO: en término 0d; recuperos por punto
// medio de bucket (15/45/75/105/135)
```

- [ ] **Step 1: Tests que fallan**

```ts
import { derivarIncobrabilidad, derivarMoraDias, type CohorteVintage } from '@/lib/simulador-canal'

const cohorte = (over: Partial<CohorteVintage>): CohorteVintage => ({
  origination_month: '2026-01', amt_total: 0, amt_incobrable_120_plus: 0,
  amt_cobrada_en_termino: 0, amt_recupero_1_29: 0, amt_recupero_30_59: 0,
  amt_recupero_60_89: 0, amt_recupero_90_119: 0, amt_recupero_120_plus: 0, ...over,
})
const hoy = new Date('2026-09-10T12:00:00Z')

describe('derivarIncobrabilidad', () => {
  it('pondera cohortes maduras (≥6 meses) y excluye las verdes', () => {
    const rows = [
      cohorte({ origination_month: '2026-01', amt_total: 1000, amt_incobrable_120_plus: 40 }),
      cohorte({ origination_month: '2025-12', amt_total: 500, amt_incobrable_120_plus: 50 }),
      cohorte({ origination_month: '2026-08', amt_total: 9000, amt_incobrable_120_plus: 0 }), // verde: fuera
    ]
    expect(derivarIncobrabilidad(rows, hoy)).toBeCloseTo(6, 5) // (40+50)/1500 = 6%
  })
  it('sin cohortes maduras → null', () => {
    expect(derivarIncobrabilidad([cohorte({ origination_month: '2026-08', amt_total: 100 })], hoy)).toBeNull()
  })
})

describe('derivarMoraDias', () => {
  it('promedio ponderado por punto medio de bucket sobre lo cobrado', () => {
    const rows = [cohorte({ amt_cobrada_en_termino: 800, amt_recupero_1_29: 100, amt_recupero_30_59: 100 })]
    expect(derivarMoraDias(rows)).toBeCloseTo(6, 5) // (800×0+100×15+100×45)/1000
  })
  it('sin cobros → null', () => {
    expect(derivarMoraDias([cohorte({})])).toBeNull()
  })
})
```

- [ ] **Step 2: Correr y verificar FAIL**

- [ ] **Step 3: Implementar**

```ts
function mesesDesde(origination: string, hoy: Date): number {
  const [y, m] = origination.split('-').map(Number)
  return (hoy.getUTCFullYear() - y) * 12 + (hoy.getUTCMonth() + 1 - m)
}

export function derivarIncobrabilidad(rows: CohorteVintage[], hoy: Date): number | null {
  const maduras = rows.filter(r => mesesDesde(r.origination_month, hoy) >= 6)
  const total = maduras.reduce((s, r) => s + r.amt_total, 0)
  if (total <= 0) return null
  const incobrable = maduras.reduce((s, r) => s + r.amt_incobrable_120_plus, 0)
  return (incobrable / total) * 100
}

const BUCKETS_MORA: [keyof CohorteVintage, number][] = [
  ['amt_cobrada_en_termino', 0], ['amt_recupero_1_29', 15], ['amt_recupero_30_59', 45],
  ['amt_recupero_60_89', 75], ['amt_recupero_90_119', 105], ['amt_recupero_120_plus', 135],
]

export function derivarMoraDias(rows: CohorteVintage[]): number | null {
  let monto = 0, ponderado = 0
  for (const r of rows) {
    for (const [campo, dias] of BUCKETS_MORA) {
      const v = r[campo] as number
      monto += v
      ponderado += v * dias
    }
  }
  if (monto <= 0) return null
  return ponderado / monto
}
```

- [ ] **Step 4: Correr y verificar PASS** — `npx vitest run __tests__/simulador-canal.test.ts`

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm test
git add lib/simulador-canal.ts __tests__/simulador-canal.test.ts
git commit -m "feat(simulador): derivacion pura de incobrabilidad y mora desde vintage"
```

---

### Task 7: Fetchers por canal + acción `getDatosSimulador`

**Files:**
- Modify: `lib/actions/finanzas.ts` (parametrizar `fetchVintageAnalysis` y `fetchPDIndicadores` con `clientIds` opcional)
- Create: `lib/actions/simulador-datos.ts`

**Interfaces:**
- Consumes: `getPool` de `@/lib/db-pool`; `CLIENT_IDS_PROPIOS`, `CLIENT_IDS_TERCEROS`, `CLIENT_IDS_TODOS`, `SQL_IDS_TERCEROS` de `@/lib/client-ids`; `getListaPrecios` y `FilaListaPrecios` de `@/lib/actions/lista-precios-canales`; `derivarIncobrabilidad`, `derivarMoraDias`, `DatosCanal` de `@/lib/simulador-canal`.
- Produces:

```ts
// lib/actions/finanzas.ts — firmas cambiadas (compatibles: default = comportamiento actual)
export async function fetchVintageAnalysis(clientIds: string[] = CLIENT_IDS_TODOS): Promise<VintageRow[]>
export async function fetchPDIndicadores(clientIds: string[] = CLIENT_IDS_TODOS): Promise<{...igual...}>

// lib/actions/simulador-datos.ts
export interface DatosSimulador {
  propia: DatosCanal
  terceros: DatosCanal
  modelos: FilaListaPrecios[]
}
export async function getDatosSimulador(): Promise<DatosSimulador>
```

- [ ] **Step 1: Parametrizar los fetchers en `finanzas.ts`**

En `fetchVintageAnalysis` y `fetchPDIndicadores`: agregar parámetro `clientIds: string[] = CLIENT_IDS_TODOS`, y dentro de cada query reemplazar `${SQL_IDS_TODOS}` por `${clientIds.map(id => `'${id}'`).join(', ')}` (solo en las DOS funciones tocadas — el resto de `finanzas.ts` no se toca). Exportar el tipo `VintageRow` (hoy es `interface` sin export). Los callers existentes (`page.tsx`) no cambian: el default reproduce el comportamiento actual.

- [ ] **Step 2: Verificar que nada se rompió**

Run: `npx tsc --noEmit && npm test`
Expected: limpio (cambio compatible).

- [ ] **Step 3: Crear `lib/actions/simulador-datos.ts`**

```ts
'use server'

import { getPool } from '@/lib/db-pool'
import { CLIENT_IDS_PROPIOS, CLIENT_IDS_TERCEROS, SQL_IDS_TERCEROS } from '@/lib/client-ids'
import { fetchVintageAnalysis, fetchPDIndicadores } from '@/lib/actions/finanzas'
import { getListaPrecios, type FilaListaPrecios } from '@/lib/actions/lista-precios-canales'
import { derivarIncobrabilidad, derivarMoraDias, type DatosCanal } from '@/lib/simulador-canal'

export interface DatosSimulador {
  propia: DatosCanal
  terceros: DatosCanal
  modelos: FilaListaPrecios[]
}

// Ticket promedio del canal terceros: total por orden (suma de cuotas) de
// órdenes entregadas creadas en los últimos 30 días
async function fetchTicketPromedioTerceros(): Promise<number | null> {
  const pool = getPool()
  if (!pool) return null
  const client = await pool.connect()
  try {
    const res = await client.query<{ ticket: string | null }>(`
      SELECT AVG(t.total) AS ticket FROM (
        SELECT i.order_id, SUM(i.installment_amount) AS total
        FROM gocuotas_installments i
        JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
        WHERE o.order_created_at >= CURRENT_DATE - 30
          AND o.order_delivered_at IS NOT NULL
          AND o.order_discarded_at IS NULL
          AND o.client_id::text IN (${SQL_IDS_TERCEROS})
        GROUP BY 1
      ) t
    `)
    const v = res.rows[0]?.ticket
    return v ? Number(v) : null
  } finally {
    client.release()
  }
}

export async function getDatosSimulador(): Promise<DatosSimulador> {
  const [vinPropia, vinTerceros, pdPropia, pdTerceros, modelos, ticketTerceros] = await Promise.all([
    fetchVintageAnalysis(CLIENT_IDS_PROPIOS),
    fetchVintageAnalysis(CLIENT_IDS_TERCEROS),
    fetchPDIndicadores(CLIENT_IDS_PROPIOS),
    fetchPDIndicadores(CLIENT_IDS_TERCEROS),
    getListaPrecios(),
    fetchTicketPromedioTerceros(),
  ])
  const hoy = new Date()
  const fpd = (pd: Awaited<ReturnType<typeof fetchPDIndicadores>>) =>
    pd.resumen.find(r => r.cuota === 1)?.pd_hard ?? null
  return {
    propia: {
      incobrabilidad_pct: derivarIncobrabilidad(vinPropia, hoy),
      fpd_pct: fpd(pdPropia),
      mora_dias: derivarMoraDias(vinPropia),
      ticket_promedio: null,
    },
    terceros: {
      incobrabilidad_pct: derivarIncobrabilidad(vinTerceros, hoy),
      fpd_pct: fpd(pdTerceros),
      mora_dias: derivarMoraDias(vinTerceros),
      ticket_promedio: ticketTerceros,
    },
    modelos,
  }
}
```

Nota: `derivarIncobrabilidad`/`derivarMoraDias` aceptan `VintageRow` por tipado estructural (tiene todos los campos de `CohorteVintage`). Si tsc se queja por los campos `pct_*` extra, no pasa nada — los extra son compatibles. `getListaPrecios()` dispara la autocuración de ToDos de bonos (idempotente, mismo efecto que abrir /canales/lista-precios).

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/finanzas.ts lib/actions/simulador-datos.ts
git commit -m "feat(simulador): datos reales por canal (vintage/FPD/mora/ticket) + fetchers parametrizados"
```

---

### Task 8: FinanzasTabs sincronizado con ?tab=

**Files:**
- Modify: `app/(admin)/finanzas/FinanzasTabs.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: FinanzasTabs lee/escribe `?tab=<id>` (necesario para que "Cargar" desde Productos navegue a Simulación). Misma API de props.

- [ ] **Step 1: Reemplazar el cuerpo por el patrón de EnviosTabs**

Copiar el mecanismo exacto de `app/(admin)/compras/envios/EnviosTabs.tsx` (ya probado en el repo): `useSearchParams`/`useRouter`/`usePathname`, estado inicial desde `?tab=` si el id existe, `router.replace(\`${pathname}?tab=${id}\`, { scroll: false })` al click, y `useEffect` que sigue cambios del param. Mantener las clases visuales actuales de FinanzasTabs (`border-magenta-600`).

```tsx
'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface Tab {
  id: string
  label: string
  content: ReactNode
}

export default function FinanzasTabs({ tabs }: { tabs: Tab[] }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tabParam = searchParams.get('tab')
  const [active, setActive] = useState(tabParam && tabs.some(t => t.id === tabParam) ? tabParam : tabs[0]?.id ?? '')

  const elegir = (id: string) => {
    setActive(id)
    router.replace(`${pathname}?tab=${id}`, { scroll: false })
  }

  useEffect(() => {
    if (tabParam && tabs.some(t => t.id === tabParam)) setActive(tabParam)
  }, [tabParam, tabs])

  return (
    <div>
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => elegir(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'border-magenta-600 text-magenta-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} className={active === tab.id ? '' : 'hidden'}>
          {tab.content}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verificar build y comportamiento**

Run: `npx tsc --noEmit && npm run build`
Expected: limpio (la page de finanzas es dinámica — mismo patrón que /compras/envios; si el build pidiera Suspense para `useSearchParams`, envolver el `<FinanzasTabs>` en `page.tsx` con `<Suspense>` como hace la page de envíos).

- [ ] **Step 3: Commit**

```bash
git add app/(admin)/finanzas/FinanzasTabs.tsx
git commit -m "feat(finanzas): pestana activa persistida en ?tab= (patron EnviosTabs)"
```

---

### Task 9: SimuladorTab v2 (UI completa) + wiring en page.tsx

**Files:**
- Modify: `app/(admin)/finanzas/SimuladorTab.tsx` (reescritura completa)
- Modify: `app/(admin)/finanzas/page.tsx`

**Interfaces:**
- Consumes: todo `lib/simulador-v2.ts`, `DatosSimulador` de `@/lib/actions/simulador-datos`, `guardarProducto`/`eliminarProducto`/`ProductoFinanciero` de `@/lib/actions/productos`, `FilaListaPrecios`.
- Produces:

```tsx
// SimuladorTab.tsx
interface Props { productos: ProductoFinanciero[]; datos: DatosSimulador }
export default function SimuladorTab({ productos, datos }: Props)
// Lee ?producto=<id> al montar: carga esos parámetros y limpia el param.
```

- [ ] **Step 1: Reescribir `SimuladorTab.tsx`**

Estructura (todo en este archivo; borrar el contenido v1 completo, incluidos imports de `@/lib/simulador`):

```tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { guardarProducto, type ProductoFinanciero } from '@/lib/actions/productos'
import type { DatosSimulador } from '@/lib/actions/simulador-datos'
import {
  simularFlujoV2, resolverPalanca, conPalanca, tirImplicita, generarNombreV2,
  oaPorOperacion, type ParamsV2, type Modalidad,
} from '@/lib/simulador-v2'

const fmt$ = (v: number) => '$' + Math.round(v).toLocaleString('es-AR')
const fmtPct = (v: number) => (v * 100).toFixed(2) + '%'
const fmtK = (v: number) => {
  if (v === 0) return ''
  const abs = Math.abs(v); const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return sign + Math.round(abs / 1_000) + 'K'
  return sign + Math.round(abs).toString()
}
const redondear1 = (v: number) => Math.round(v * 10) / 10

function paramsIniciales(modalidad: Modalidad, datos: DatosSimulador): ParamsV2 {
  const canal = modalidad === 'propia' ? datos.propia : datos.terceros
  const cuotas = 9
  return {
    schema_version: 2,
    modalidad,
    costo_sin_iva: 0,
    multiplo: 2,
    modelo_id: null,
    modelo_nombre: null,
    flete: 0,
    order_amount: canal.ticket_promedio ? Math.round(canal.ticket_promedio) : 150_000,
    tasa_descuento_pct: 15,
    cuotas,
    anticipo_pct: redondear1(100 / cuotas),
    operaciones_por_mes: [1],
    splits: [{ plazo_dias: 0, porcentaje: 100 }],
    costos_operativos_pct: 2,
    imp_creditos_pct: 0.6,
    imp_debitos_pct: 0.6,
    iibb_pct: 4,
    incobrabilidad_pct: canal.incobrabilidad_pct !== null ? redondear1(canal.incobrabilidad_pct) : 3,
    mora_dias: canal.mora_dias !== null ? Math.round(canal.mora_dias) : 15,
    tna_fondeo_pct: 45,
    objetivo_pct_oa: 15,
  }
}
```

Componente principal:
- `const [modalidad, setModalidad] = useState<Modalidad | null>(null)` — si `null`, renderiza SOLO el selector: dos tarjetas estilo Compras (header coloreado + ícono SVG inline, como las tarjetas de `/inventario`): "Venta Propia" (vendés el equipo y originás el crédito) y "Venta de Terceros" (el comercio vende, vos originás el crédito y cobrás tasa de descuento). Click → `setModalidad(m)` + `setParams(paramsIniciales(m, datos))`. Botón "‹ Cambiar modalidad" arriba a la izquierda cuando ya hay una elegida.
- `const [params, setParams] = useState<ParamsV2 | null>(null)`; helper `up<K extends keyof ParamsV2>(k, v)` como el `updateParam` v1.
- Al cambiar `cuotas`, si `anticipo_pct` era el default de las cuotas anteriores (`redondear1(100/cuotasPrev)`), actualizarlo a `redondear1(100/cuotasNuevas)`; si el usuario lo pisó, respetarlo.
- **Selector de modelo (solo propia):** `<select>` con `datos.modelos` filtrados a `costo !== null`, opción "— modelo genérico —" (deja `costo_sin_iva` editable a mano). Al elegir: `up('modelo_id', f.productoId)`, `up('modelo_nombre', f.nombre)`, `up('costo_sin_iva', f.costo)`. Debajo, línea de referencia gris: "Hoy: PVP {fmt$(f.pvp)} · múltiplo {f.multiplo} · cuota {fmt$(f.cuota)} · tienda {f.precioTienda ? fmt$(f.precioTienda) : '—'}".
- **Bloques de parámetros** (grid `md:grid-cols-4 gap-3 text-xs`, cada bloque con subtítulo `text-[11px] font-semibold text-gray-500 uppercase`):
  - *Operación:* modelo (propia) / order amount (terceros), cuotas, anticipo %, ops/mes (input texto CSV como v1, con estado string aparte `opsStr`), múltiplo actual editable (propia) / tasa descuento editable (terceros) — la palanca también es input para simular "qué pasa con X".
  - *Costos e impuestos:* costos op %, imp. créditos %, imp. débitos %, IIBB %, flete $ (solo propia).
  - *Riesgo del canal:* incobrabilidad %, mora días. Al lado de cada input, el dato real en gris: `vintage: {datos[canal].incobrabilidad_pct?.toFixed(1) ?? 's/d'}%`, `FPD: {…}%`, `mora real: {…}d`.
  - *Fondeo y objetivo:* TNA %, objetivo % sobre OA, splits (mismo UI v1: contador + plazo/porcentaje por fila, validación suma 100 con mensaje rojo; `min` del plazo = 0).
- **Tarjeta "Simulación"** (la del solver, ancho completo, borde índigo `border-indigo-200 bg-indigo-50`):
  ```tsx
  const sim = useMemo(() => params ? simularFlujoV2(params) : null, [params])
  const solver = useMemo(() => params && splitsOk ? resolverPalanca(params) : null, [params, splitsOk])
  const tir = useMemo(() => params ? tirImplicita(params) : null, [params])
  ```
  - Propia: "Múltiplo mínimo para obj {objetivo}%: **{solver.palanca.toFixed(2)}**" → `PVP {fmt$(costo×palanca)}` y `cuota {fmt$(costo×palanca/cuotas)}`; al lado "con tu múltiplo actual {multiplo}: resultado {fmtPct(sim.indicadores.resultado_pct_oa)}". TIR: "Tasa implícita del crédito: TNA {fmtPct(tir.tna)} · TEA {fmtPct(tir.tea)}".
  - Terceros: "Tasa de descuento mínima: **{solver.palanca.toFixed(1)}%**" + resultado actual.
  - `!solver.alcanzable` → banner ámbar "El objetivo no se alcanza ni con la palanca al tope del rango — revisá costos/incobrabilidad".
- **Indicadores** (tarjetas como v1): Resultado ({fmt$} y {fmtPct} vs objetivo, verde/rojo), Capital requerido, Deuda/OA, Rent. anual s/capital (`sin_capital` → "No requiere capital"), Payback (`payback === null` → "No recupera", sino `Mes {payback}`).
- **Tabla de flujo:** mismo renderer v1 (sticky primera columna, colores, `fmtK`), columnas `Mes 0..meses-1`, filas de `sim.filas`. Sin la nota al pie de colocación.
- **Guardar:** input de nombre con `value={nombre}` inicializado/re-sugerido con `generarNombreV2(params)` cada vez que cambian los parámetros SI el usuario no lo editó (flag `nombreEditado`), + botón "Guardar como producto" (disabled si splits ≠ 100 o `saving`). `await guardarProducto(nombre, params, { ...sim.indicadores, tir })` y `router.refresh()`.
- **Carga desde Productos:**
  ```tsx
  const productoParam = searchParams.get('producto')
  useEffect(() => {
    if (!productoParam) return
    const p = productos.find(x => x.id === productoParam)
    if (p && (p.parametros as { schema_version?: number }).schema_version === 2) {
      const loaded = p.parametros as unknown as ParamsV2
      setModalidad(loaded.modalidad)
      setParams(loaded)
      setOpsStr(loaded.operaciones_por_mes.join(', '))
    }
    router.replace(`${pathname}?tab=simulador`, { scroll: false })
  }, [productoParam]) // eslint-disable-line react-hooks/exhaustive-deps
  ```

- [ ] **Step 2: Wiring en `page.tsx`**

- `import { getDatosSimulador } from '@/lib/actions/simulador-datos'` y agregarlo al `Promise.all` existente (junto a `fetchProductos()`).
- Tab simulador: `{ id: 'simulador', label: 'Simulación', content: <SimuladorTab productos={productosFinancieros} datos={datosSimulador} /> }`.
- (El rename de la pestaña `precios` se hace en Task 10 junto con ProductosTab.)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: limpio. Verificación manual con `npm run dev`: elegir Venta Propia → seleccionar un modelo → ver solver y flujo; elegir Terceros → ver ticket promedio precargado; guardar un producto con nombre custom y verlo tras refresh.

- [ ] **Step 4: Commit**

```bash
git add app/(admin)/finanzas/SimuladorTab.tsx app/(admin)/finanzas/page.tsx
git commit -m "feat(finanzas): SimuladorTab v2 — selector de modalidad, datos reales, solver y guardado con nombre"
```

---

### Task 10: ProductosTab (dos tarjetas) + renames + cleanup final

**Files:**
- Create: `app/(admin)/finanzas/ProductosTab.tsx`
- Delete: `app/(admin)/finanzas/ListaPreciosTab.tsx`, `lib/simulador.ts`
- Modify: `app/(admin)/finanzas/page.tsx`
- Create: `scripts/productos-v1-cleanup.sql`

**Interfaces:**
- Consumes: `ProductoFinanciero`, `eliminarProducto` de `@/lib/actions/productos`; `ParamsV2`, `IndicadoresV2` de `@/lib/simulador-v2`; `useRouter`.
- Produces:

```tsx
interface Props { productos: ProductoFinanciero[] }
export default function ProductosTab({ productos }: Props)
```

- [ ] **Step 1: Crear `ProductosTab.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { eliminarProducto, type ProductoFinanciero } from '@/lib/actions/productos'
import type { ParamsV2, IndicadoresV2 } from '@/lib/simulador-v2'

const fmt$ = (v: number) => '$' + Math.round(v).toLocaleString('es-AR')
const fmtPct = (v: number) => (v * 100).toFixed(1) + '%'

export default function ProductosTab({ productos }: Props) {
  const router = useRouter()
  const v2 = productos
    .map(p => ({ p, params: p.parametros as unknown as ParamsV2, ind: p.indicadores as unknown as IndicadoresV2 }))
    .filter(x => x.params.schema_version === 2)
  const propios = v2.filter(x => x.params.modalidad === 'propia')
  const terceros = v2.filter(x => x.params.modalidad === 'terceros')
  const cargar = (id: string) => router.push(`/finanzas?tab=simulador&producto=${id}`)
  // ... dos tarjetas, ver abajo
}
```

**Tarjeta Venta Propia** (`bg-white rounded-xl border`, header con fondo suave índigo): tabla-listado con columnas Nombre | Modelo | Múltiplo | PVP | Cuota | Cuotas | Resultado %OA | Rent. anual | Acciones. Valores: `params.modelo_nombre ?? 'genérico'`, `params.multiplo.toFixed(2)`, `fmt$(params.costo_sin_iva × params.multiplo)`, `fmt$(params.costo_sin_iva × params.multiplo / params.cuotas)`, `params.cuotas`, `fmtPct(ind.resultado_pct_oa)` (verde ≥ objetivo, rojo si no), `ind.sin_capital ? 'Sin capital' : ind.rent_anual_capital !== null ? fmtPct(ind.rent_anual_capital) : '—'`. Acciones: botón "Cargar" (`cargar(p.id)`) y "Eliminar" (`await eliminarProducto(p.id); router.refresh()`). Vacía → "Todavía no guardaste productos de venta propia".

**Tarjeta Venta de Terceros** (header suave esmeralda): la matriz actual de `ListaPreciosTab` adaptada a v2 — filas = `cuotas` únicas, columnas = `splitsKey` únicos (`params.splits.map(s => \`${s.porcentaje}% a ${s.plazo_dias}d\`).join(' / ')`), celda = `params.tasa_descuento_pct%` (lookup por `\`${cuotas}-${splitsKey}\``, '—' si no hay). Debajo de la matriz, listado compacto (Nombre | Tasa | Cuotas | Resultado %OA | Cargar | Eliminar). Vacía → mensaje análogo.

- [ ] **Step 2: Renombrar pestaña y borrar lo viejo**

En `page.tsx`: reemplazar el import y la entrada `{ id: 'precios', label: 'Lista de Precios', content: <ListaPreciosTab …/> }` por `{ id: 'precios', label: 'Productos', content: <ProductosTab productos={productosFinancieros} /> }` (mantener `id: 'precios'` para no romper links `?tab=precios`). Borrar `app/(admin)/finanzas/ListaPreciosTab.tsx` y `lib/simulador.ts`. Verificar que nada más los importa:

Run: `grep -rn "lib/simulador'" --include="*.ts*" app lib components | grep -v simulador-v2 | grep -v simulador-canal` y `grep -rn "ListaPreciosTab" app`
Expected: sin resultados.

- [ ] **Step 3: SQL de limpieza de productos v1**

Crear `scripts/productos-v1-cleanup.sql`:

```sql
-- productos-v1-cleanup: borrar productos financieros del simulador v1
-- (Emiliano, 10 sep 2026: no los va a usar; el simulador v2 usa schema_version 2)
DELETE FROM productos_financieros
WHERE (parametros->>'schema_version') IS DISTINCT FROM '2';
```

Ejecutarlo en el Supabase SQL Editor con el nombre `productos-v1-cleanup` (convención del proyecto: toda query del editor lleva nombre).

- [ ] **Step 4: Verificación completa**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: todo limpio y verde. Manual con `npm run dev`: pestañas "Simulación" y "Productos" visibles; guardar un producto propio y uno de terceros; verlos en sus tarjetas; "Cargar" navega a Simulación con los parámetros puestos; matriz de terceros muestra la tasa.

- [ ] **Step 5: Commit + deploy**

```bash
git add -A
git commit -m "feat(finanzas): pestana Productos (listado propia + matriz terceros), elimina simulador v1 y estocastico"
git push
npx vercel --prod --yes
```

Tras el deploy: smoke test en https://gocelular360.vercel.app/finanzas (pestañas Simulación y Productos), y recordar a Emiliano hacer `git pull` en la otra computadora.

---

## Self-review del plan (hecho al escribirlo)

- **Cobertura de la spec:** estructura de pestañas (T8-T10), selector de modalidad (T9), motor con IVA/incobrabilidad/mora/día 0/sin colocación (T1-T3), TIR (T4), solver (T5), datos reales por canal (T6-T7), DP default 100/cuotas (T9), guardado con nombre (T9), Productos con dos tarjetas (T10), borrado v1 (T10), eliminación de estocástico y consignatarios (T9-T10 al borrar `lib/simulador.ts` y la UI vieja). ✓
- **Tipos consistentes:** `ParamsV2`/`IndicadoresV2`/`DatosCanal`/`DatosSimulador` definidos una vez y consumidos con los mismos nombres en T5-T10. ✓
- **Números de tests:** verificados a mano en esta sesión (flujo propia m0..m4, terceros m0..m3, mora 562,19, TIR 5%, derivaciones 6%/6d). La TIR implícita 0,3465 se fija tras la primera corrida verificando VAN≈0 en planilla (instrucción explícita en T4). ✓
