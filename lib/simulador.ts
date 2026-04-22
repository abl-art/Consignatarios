// Motor de cálculo financiero — determinístico y estocástico
// Corre 100% client-side para respuesta instantánea

export interface SplitConfig {
  plazo_dias: number
  porcentaje: number // 0-100, suma de todos = 100
}

export interface SimuladorParams {
  order_amount: number
  down_payment_pct: number        // % (ej: 10)
  cuotas: number
  operaciones_por_mes: number[]   // array de N meses, ej: [500, 500, 500...]
  tasa_descuento_comercio: number // % (ej: 15)
  splits: SplitConfig[]
  costo_financiacion_tna: number  // % (ej: 45)
  costos_operativos_pct: number   // % (ej: 2)
  imp_creditos_pct: number        // % (ej: 0.6)
  imp_debitos_pct: number         // % (ej: 0.6)
  iibb_pct: number                // % (ej: 4)
  incobrabilidad_media: number    // % (ej: 3)
  incobrabilidad_desvio: number   // % (ej: 1.5)
  mora_media_dias: number         // días (ej: 15)
  mora_desvio_dias: number        // días (ej: 7)
  fondos_propios: boolean         // true = capital propio, false = financiado con deuda
}

export interface FlujoFila {
  concepto: string
  valores: number[] // un valor por mes
  esSubtotal?: boolean
  esAcumulado?: boolean
}

export interface Indicadores {
  tir_mensual: number
  tir_anual: number
  van: number
  capital_requerido: number     // pico negativo del acumulado
  payback: number               // mes en que acumulado > 0, 0 si nunca
  rent_sobre_capital: number    // resultado / capital requerido
  rent_sobre_order: number      // resultado / (order_amount * total ops)
  margen_neto_op: number        // resultado / total operaciones
  fondos_propios: boolean
}

export interface ResultadoSimulacion {
  filas: FlujoFila[]
  indicadores: Indicadores
  meses: number
}

export interface ResultadoEstocastico {
  mediana: ResultadoSimulacion
  p10: Indicadores
  p90: Indicadores
  distribuciones: {
    tir: number[]
    van: number[]
    capital_requerido: number[]
  }
}

// ---------------------------------------------------------------------------
// Utilidades financieras
// ---------------------------------------------------------------------------

export function calcTIR(flujos: number[], guess = 0.1, maxIter = 200, tol = 0.0001): number {
  let tir = guess
  for (let i = 0; i < maxIter; i++) {
    let van = 0
    let dvan = 0
    for (let t = 0; t < flujos.length; t++) {
      const factor = Math.pow(1 + tir, t)
      van += flujos[t] / factor
      if (t > 0) dvan -= t * flujos[t] / Math.pow(1 + tir, t + 1)
    }
    if (Math.abs(van) < tol) break
    if (dvan === 0) break
    tir -= van / dvan
    if (!isFinite(tir)) return 0
  }
  return isFinite(tir) ? tir : 0
}

export function calcVAN(flujos: number[], tasa: number): number {
  let van = 0
  for (let t = 0; t < flujos.length; t++) {
    van += flujos[t] / Math.pow(1 + tasa, t)
  }
  return van
}

// Distribución normal con Box-Muller
function randNormal(media: number, desvio: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return media + z * desvio
}

// ---------------------------------------------------------------------------
// Simulación determinística
// ---------------------------------------------------------------------------

export function simularDeterministico(params: SimuladorParams): ResultadoSimulacion {
  return simularFlujo(params, params.incobrabilidad_media / 100, 0)
}

function simularFlujo(
  params: SimuladorParams,
  incobrabilidad: number,
  moraDias: number,
): ResultadoSimulacion {
  const {
    order_amount, down_payment_pct, cuotas, operaciones_por_mes, splits,
    tasa_descuento_comercio, costo_financiacion_tna, costos_operativos_pct,
    imp_creditos_pct, imp_debitos_pct, iibb_pct,
  } = params

  const dp = down_payment_pct / 100
  const descuento = tasa_descuento_comercio / 100
  const costoFinMensual = costo_financiacion_tna / 100 / 12
  const costosOp = costos_operativos_pct / 100
  const impCred = imp_creditos_pct / 100
  const impDeb = imp_debitos_pct / 100
  const iibb = iibb_pct / 100

  // Cuota 1 = down payment (% del order_amount)
  // Cuotas 2 a N = resto dividido en (cuotas - 1)
  const cuota1 = order_amount * dp
  const montoFinanciado = order_amount - cuota1
  const cuotasRestantes = cuotas - 1
  const montoCuotaResto = cuotasRestantes > 0 ? montoFinanciado / cuotasRestantes : 0
  const liquidacionTotal = order_amount * (1 - descuento)

  // Calcular en qué mes cae cada split (plazo_dias / 30 redondeado)
  const splitsPorMes = splits.map(s => ({
    mes: Math.max(1, Math.ceil(s.plazo_dias / 30)),
    monto: liquidacionTotal * (s.porcentaje / 100),
  }))

  // Total de meses en la simulación: max entre cuotas y último split + margen para mora
  const mesesOps = operaciones_por_mes.length
  const maxMesSplit = Math.max(...splitsPorMes.map(s => s.mes))
  const moraExtra = Math.ceil(moraDias / 30)
  const totalMeses = mesesOps + cuotas + moraExtra + maxMesSplit

  // Inicializar filas
  const cobroCuota = new Array(totalMeses).fill(0)
  const liquidacionComercio = new Array(totalMeses).fill(0)
  const costoOperativo = new Array(totalMeses).fill(0)
  const impCreditosFila = new Array(totalMeses).fill(0)
  const impDebitosFila = new Array(totalMeses).fill(0)
  const iibbFila = new Array(totalMeses).fill(0)
  const incobrabilidadFila = new Array(totalMeses).fill(0)
  const costoFinanciacion = new Array(totalMeses).fill(0)

  // Generar flujos por cohorte de operaciones
  for (let mesInicio = 0; mesInicio < mesesOps; mesInicio++) {
    const ops = operaciones_por_mes[mesInicio] || 0
    if (ops === 0) continue

    // Cuota 1 (= down payment) en mes de inicio, siempre se cobra, sin incobrabilidad
    cobroCuota[mesInicio] += ops * cuota1

    // Cuotas 2 a N: cobro nominal completo, incobrabilidad como egreso separado
    for (let c = 2; c <= cuotas; c++) {
      const mesDelay = Math.ceil(moraDias / 30)
      const mesCobro = mesInicio + (c - 1) + mesDelay
      if (mesCobro < totalMeses) {
        cobroCuota[mesCobro] += ops * montoCuotaResto
        incobrabilidadFila[mesCobro] += -(ops * montoCuotaResto * incobrabilidad)
      }
    }

    // Splits de liquidación
    for (const split of splitsPorMes) {
      const mesLiq = mesInicio + split.mes - 1
      if (mesLiq < totalMeses) {
        liquidacionComercio[mesLiq] += -(ops * split.monto)
      }
    }

    // Costos operativos en mes de inicio
    costoOperativo[mesInicio] += -(ops * order_amount * costosOp)

    // IIBB en mes de inicio
    const ventaNeta = order_amount * (1 - descuento)
    iibbFila[mesInicio] += -(ops * ventaNeta * iibb)
  }

  // Imp créditos sobre cobros, imp débitos sobre liquidaciones
  for (let m = 0; m < totalMeses; m++) {
    if (cobroCuota[m] > 0) {
      impCreditosFila[m] = -(cobroCuota[m] * impCred)
    }
    if (liquidacionComercio[m] < 0) {
      impDebitosFila[m] = liquidacionComercio[m] * impDeb // ya es negativo * positivo = negativo
    }
  }

  // Calcular subtotal y acumulado, luego costo de financiación sobre saldo negativo
  const subtotal = new Array(totalMeses).fill(0)
  const acumulado = new Array(totalMeses).fill(0)

  // Primera pasada: subtotal sin financiación
  for (let m = 0; m < totalMeses; m++) {
    subtotal[m] = cobroCuota[m] + liquidacionComercio[m] +
      costoOperativo[m] + impCreditosFila[m] + impDebitosFila[m] + iibbFila[m] + incobrabilidadFila[m]
  }

  // Costo de financiación sobre acumulado negativo
  let acum = 0
  for (let m = 0; m < totalMeses; m++) {
    if (acum < 0) {
      costoFinanciacion[m] = acum * costoFinMensual // negativo * positivo = negativo
    }
    subtotal[m] += costoFinanciacion[m]
    acum += subtotal[m]
    acumulado[m] = acum
  }

  // Recortar meses trailing con 0
  let ultimoMesActivo = totalMeses - 1
  while (ultimoMesActivo > 0 && subtotal[ultimoMesActivo] === 0 && acumulado[ultimoMesActivo] === acumulado[ultimoMesActivo - 1]) {
    ultimoMesActivo--
  }
  const meses = ultimoMesActivo + 1

  const trim = (arr: number[]) => arr.slice(0, meses)

  const filas: FlujoFila[] = [
    { concepto: 'Cobro cuotas', valores: trim(cobroCuota) },
    { concepto: 'Liquidación comercio', valores: trim(liquidacionComercio) },
    { concepto: 'Costo operativo', valores: trim(costoOperativo) },
    { concepto: 'Imp. créditos', valores: trim(impCreditosFila) },
    { concepto: 'Imp. débitos', valores: trim(impDebitosFila) },
    { concepto: 'IIBB', valores: trim(iibbFila) },
    { concepto: 'Incobrabilidad', valores: trim(incobrabilidadFila) },
    { concepto: 'Costo financiación', valores: trim(costoFinanciacion) },
    { concepto: 'Subtotal', valores: trim(subtotal), esSubtotal: true },
    { concepto: 'Acumulado', valores: trim(acumulado), esAcumulado: true },
  ]

  // Indicadores
  const totalOps = operaciones_por_mes.reduce((s, n) => s + n, 0)
  const trimmedSubtotal = trim(subtotal)
  const capitalRequerido = Math.abs(Math.min(...trim(acumulado), 0))
  const resultado = acumulado[meses - 1]
  let payback = 0
  for (let m = 0; m < meses; m++) {
    if (acumulado[m] > 0) { payback = m + 1; break }
  }

  // TIR: solo tiene sentido con fondos propios (costo de oportunidad)
  // Con fondos de terceros el costo ya está en el flujo como egreso
  const tirMensual = params.fondos_propios ? calcTIR(trimmedSubtotal) : 0
  const tasaMensual = costo_financiacion_tna / 100 / 12

  const indicadores: Indicadores = {
    tir_mensual: tirMensual,
    tir_anual: params.fondos_propios ? Math.pow(1 + tirMensual, 12) - 1 : 0,
    van: calcVAN(trimmedSubtotal, tasaMensual),
    capital_requerido: capitalRequerido,
    payback,
    rent_sobre_capital: capitalRequerido > 0 ? resultado / capitalRequerido : 0,
    rent_sobre_order: totalOps > 0 ? resultado / (order_amount * totalOps) : 0,
    margen_neto_op: totalOps > 0 ? resultado / totalOps : 0,
    fondos_propios: params.fondos_propios,
  }

  return { filas, indicadores, meses }
}

// ---------------------------------------------------------------------------
// Simulación estocástica
// ---------------------------------------------------------------------------

export function simularEstocastico(params: SimuladorParams, n = 500): ResultadoEstocastico {
  const resultados: { indicadores: Indicadores; subtotales: number[] }[] = []

  for (let i = 0; i < n; i++) {
    const incob = Math.max(0, randNormal(params.incobrabilidad_media, params.incobrabilidad_desvio)) / 100
    const mora = Math.max(0, randNormal(params.mora_media_dias, params.mora_desvio_dias))
    const res = simularFlujo(params, incob, mora)
    resultados.push({ indicadores: res.indicadores, subtotales: res.filas.find(f => f.esSubtotal)?.valores ?? [] })
  }

  // Ordenar por TIR para percentiles
  resultados.sort((a, b) => a.indicadores.tir_mensual - b.indicadores.tir_mensual)
  const idx10 = Math.floor(n * 0.1)
  const idx50 = Math.floor(n * 0.5)
  const idx90 = Math.floor(n * 0.9)

  // Mediana: correr simulación con valores medianos para tener el flujo completo
  const mediana = simularFlujo(
    params,
    params.incobrabilidad_media / 100,
    params.mora_media_dias,
  )

  return {
    mediana,
    p10: resultados[idx10].indicadores,
    p90: resultados[idx90].indicadores,
    distribuciones: {
      tir: resultados.map(r => r.indicadores.tir_anual),
      van: resultados.map(r => r.indicadores.van),
      capital_requerido: resultados.map(r => r.indicadores.capital_requerido),
    },
  }
}

// ---------------------------------------------------------------------------
// Generador de nombre automático
// ---------------------------------------------------------------------------

export function generarNombreProducto(params: SimuladorParams): string {
  const splitsStr = params.splits.map(s => `${s.porcentaje}%`).join('/')
  const plazosStr = params.splits.map(s => `${s.plazo_dias}`).join('/')
  const dp = params.down_payment_pct > 0 ? ` - DP ${params.down_payment_pct}%` : ''
  return `${params.cuotas} cuotas - Liq ${splitsStr} a ${plazosStr}d${dp}`
}
