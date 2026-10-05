import { clasificarCanal, type ConsignatarioPrefix } from './ventas-dia'

// Cifras de un mes calendario ('YYYY-MM')
export interface MesCifras {
  mes: string
  ventas: number
  monto: number
}

// Punto de la serie mensual de GOcuotas plataforma (solo conteo de órdenes)
export interface PuntoMensual {
  mes: string
  n: number
}

// Fila cruda de la réplica: ventas de un mes por store
export interface VentaMensualDim {
  mes: string
  store_name: string
  client_id: string
  store_id: string | null
  ventas: number
  monto: number
}

export type DimensionProyeccion =
  | { nivel: 'total' | 'propia' | 'terceros' }
  | { nivel: 'merchant'; clientId: string }
  | { nivel: 'store'; storeId: string }

export type MetodoProyeccion = 'hibrido' | 'gocuotas'

export interface SnapshotProyeccion {
  run_mes: string
  metodo: MetodoProyeccion
  mes: string
  ventas: number
  monto: number
}

export interface FilaProyReal {
  mes: string
  hibrido: { ventas: number; monto: number } | null
  gocuotas: { ventas: number; monto: number } | null
  real: { ventas: number; monto: number } | null
  /** acumulado al día del mes EN CURSO (pedido de Emiliano 5/10: ver cómo
   *  viene el mes sin esperar el cierre); null en cerrados y futuros */
  realParcial: { ventas: number; monto: number } | null
}

// --- Helpers de meses 'YYYY-MM' ---

export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

function diffMeses(desde: string, hasta: string): number {
  const [y1, m1] = desde.split('-').map(Number)
  const [y2, m2] = hasta.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

export function mesesSiguientes(mes: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => sumarMeses(mes, i + 1))
}

/**
 * Índice estacional por mes calendario ('01'..'12') a partir de una serie
 * mensual larga (GOcuotas plataforma): cada punto se divide por la media
 * móvil centrada de 12 meses y se promedia por mes calendario, normalizado
 * a promedio 1. Con menos de 13 meses no hay señal: índice neutro.
 */
export function indiceEstacional(serie: PuntoMensual[]): Record<string, number> {
  const neutro = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1).padStart(2, '0'), 1]))
  if (serie.length < 13) return neutro

  const ordenada = [...serie].sort((a, b) => a.mes.localeCompare(b.mes))
  const vals = ordenada.map((p) => p.n)
  const acum: Record<string, number> = {}
  const cuenta: Record<string, number> = {}
  for (let i = 6; i < vals.length - 5; i++) {
    const ventana = vals.slice(i - 6, i + 6)
    const trend = ventana.reduce((a, b) => a + b, 0) / 12
    if (trend <= 0) continue
    const mesCal = ordenada[i].mes.slice(5)
    acum[mesCal] = (acum[mesCal] || 0) + vals[i] / trend
    cuenta[mesCal] = (cuenta[mesCal] || 0) + 1
  }

  const definidos = Object.keys(acum)
  if (definidos.length === 0) return neutro
  const idx: Record<string, number> = { ...neutro }
  for (const m of definidos) idx[m] = acum[m] / cuenta[m]
  const media = definidos.reduce((s, m) => s + idx[m], 0) / definidos.length
  for (const m of definidos) idx[m] /= media
  return idx
}

/** Agrupa las filas crudas de la réplica por mes según la dimensión pedida. */
export function serieDimension(
  raw: VentaMensualDim[],
  dim: DimensionProyeccion,
  prefixes: ConsignatarioPrefix[]
): MesCifras[] {
  const pasa = (r: VentaMensualDim): boolean => {
    switch (dim.nivel) {
      case 'total':
        return clasificarCanal(r, prefixes) !== 'consignatarios'
      case 'propia':
        return clasificarCanal(r, prefixes) === 'gocelular'
      case 'terceros':
        return clasificarCanal(r, prefixes) === 'terceros'
      case 'merchant':
        return r.client_id === dim.clientId
      case 'store':
        return r.store_id === dim.storeId
    }
  }

  const porMes = new Map<string, MesCifras>()
  for (const r of raw) {
    if (!pasa(r)) continue
    const acc = porMes.get(r.mes) ?? { mes: r.mes, ventas: 0, monto: 0 }
    acc.ventas += r.ventas
    acc.monto += r.monto
    porMes.set(r.mes, acc)
  }
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))
}

/**
 * Ventana móvil de meses cerrados: arranca en el primer mes con ventas
 * (los meses previos al arranque de la operación no cuentan como cero),
 * rellena huecos intermedios con 0, termina en hastaMes y corta a los
 * últimos maxMeses.
 */
export function ventanaSerie(serie: MesCifras[], hastaMes: string, maxMeses = 12): MesCifras[] {
  const porMes = new Map(serie.map((p) => [p.mes, p]))
  const conVentas = serie.filter((p) => (p.ventas > 0 || p.monto > 0) && p.mes <= hastaMes)
  if (conVentas.length === 0) return []
  const primero = conVentas[0].mes

  const salida: MesCifras[] = []
  for (let m = primero; m <= hastaMes; m = sumarMeses(m, 1)) {
    const p = porMes.get(m)
    salida.push(p ? { ...p } : { mes: m, ventas: 0, monto: 0 })
  }
  return salida.slice(-maxMeses)
}

// Cuadrados mínimos sobre y = a + b·x con x = 1..n. Con menos de 2 puntos
// no hay pendiente: devuelve la media (o cero) como recta plana.
function ajustarRecta(ys: number[]): { a: number; b: number } {
  const n = ys.length
  if (n === 0) return { a: 0, b: 0 }
  const media = ys.reduce((s, y) => s + y, 0) / n
  if (n === 1) return { a: media, b: 0 }

  const mediaX = (n + 1) / 2
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    const dx = i + 1 - mediaX
    sxy += dx * (ys[i] - media)
    sxx += dx * dx
  }
  const b = sxy / sxx
  return { a: media - b * mediaX, b }
}

/**
 * Método híbrido: la serie propia se desestacionaliza con el índice de
 * GOcuotas, se ajusta una recta sobre la serie limpia y cada mes del
 * horizonte se proyecta sobre la recta y se re-estacionaliza con su índice.
 * El horizonte puede saltar meses (ej.: congelar en septiembre proyectando
 * desde octubre); la posición x se calcula por distancia de meses real.
 */
export function proyectarHibrido(
  serieCerrada: MesCifras[],
  indice: Record<string, number>,
  horizonte: string[]
): MesCifras[] {
  if (serieCerrada.length === 0) return horizonte.map((mes) => ({ mes, ventas: 0, monto: 0 }))

  const idx = (mes: string) => indice[mes.slice(5)] ?? 1
  const des = serieCerrada.map((p) => ({ ventas: p.ventas / idx(p.mes), monto: p.monto / idx(p.mes) }))
  const fVentas = ajustarRecta(des.map((p) => p.ventas))
  const fMonto = ajustarRecta(des.map((p) => p.monto))

  const n = serieCerrada.length
  const ultimo = serieCerrada[n - 1].mes
  return horizonte.map((mes) => {
    const x = n + diffMeses(ultimo, mes)
    return {
      mes,
      ventas: Math.max(0, (fVentas.a + fVentas.b * x) * idx(mes)),
      monto: Math.max(0, (fMonto.a + fMonto.b * x) * idx(mes)),
    }
  })
}

/**
 * Método GOcuotas: el nivel del último mes cerrado propio crece mes a mes
 * con los ratios reales que tuvo la plataforma GOcuotas en los mismos meses
 * del año anterior (estacionalidad + crecimiento de plataforma). Meses sin
 * dato de GOcuotas usan factor neutro.
 */
export function proyectarPorGocuotas(
  serieCerrada: MesCifras[],
  serieGocuotas: PuntoMensual[],
  horizonte: string[]
): MesCifras[] {
  if (serieCerrada.length === 0 || horizonte.length === 0)
    return horizonte.map((mes) => ({ mes, ventas: 0, monto: 0 }))

  const gq = new Map(serieGocuotas.map((p) => [p.mes, p.n]))
  const base = serieCerrada[serieCerrada.length - 1]

  let nivel = { ventas: base.ventas, monto: base.monto }
  const proyectado = new Map<string, MesCifras>()
  const fin = horizonte[horizonte.length - 1]
  for (let m = sumarMeses(base.mes, 1); m <= fin; m = sumarMeses(m, 1)) {
    const numerador = gq.get(sumarMeses(m, -12))
    const denominador = gq.get(sumarMeses(m, -13))
    const factor = numerador && denominador ? numerador / denominador : 1
    nivel = { ventas: nivel.ventas * factor, monto: nivel.monto * factor }
    proyectado.set(m, { mes: m, ...nivel })
  }
  return horizonte.map((mes) => proyectado.get(mes) ?? { mes, ventas: base.ventas, monto: base.monto })
}

/**
 * Cruza los snapshots congelados contra lo real: para cada mes proyectado
 * toma, por método, el run más reciente cuyo run_mes no sea posterior al
 * mes (una "proyección" hecha después del mes no vale). Meses anteriores a
 * mesActual llevan el real (0 si no hubo ventas); el mes en curso y los
 * futuros van sin real.
 */
export function armarProyVsReal(
  snapshots: SnapshotProyeccion[],
  reales: MesCifras[],
  mesActual: string
): FilaProyReal[] {
  const realesPorMes = new Map(reales.map((r) => [r.mes, r]))
  const meses = [...new Set(snapshots.map((s) => s.mes))].sort()

  const elegir = (mes: string, metodo: MetodoProyeccion) => {
    const candidatos = snapshots.filter((s) => s.mes === mes && s.metodo === metodo && s.run_mes <= mes)
    if (candidatos.length === 0) return null
    const mejor = candidatos.reduce((a, b) => (b.run_mes > a.run_mes ? b : a))
    return { ventas: mejor.ventas, monto: mejor.monto }
  }

  return meses.map((mes) => {
    const cerrado = mes < mesActual
    const real = realesPorMes.get(mes)
    return {
      mes,
      hibrido: elegir(mes, 'hibrido'),
      gocuotas: elegir(mes, 'gocuotas'),
      real: cerrado ? { ventas: real?.ventas ?? 0, monto: real?.monto ?? 0 } : null,
      realParcial:
        mes === mesActual && real ? { ventas: real.ventas, monto: real.monto } : null,
    }
  })
}

/** Fracción del mes ya transcurrida (día de hoy inclusive / días del mes) —
 *  para prorratear la proyección al comparar contra el acumulado parcial. */
export function fraccionMesTranscurrida(hoyISO: string): number {
  const [y, m, d] = hoyISO.slice(0, 10).split('-').map(Number)
  const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Math.min(1, d / diasMes)
}
