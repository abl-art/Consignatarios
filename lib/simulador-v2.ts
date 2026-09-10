// Motor financiero determinístico v2 — corre 100% client-side.
// Premisa: cada producto vendido es el vehículo para originar un crédito.

const IVA = 0.21

function zeros(n: number): number[] { return new Array(n).fill(0) }

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

export function oaPorOperacion(p: ParamsV2): number {
  return p.modalidad === 'propia' ? p.costo_sin_iva * p.multiplo : p.order_amount
}

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
