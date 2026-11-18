// Lógica pura de "Cosechas": cohortes custom de órdenes para A/B testing
// financiero. El caller (server actions) arma las filas de entrada (filtros
// SQL, orden cronológico) y esta capa solo valida, agrupa, agrega y calcula
// las curvas/resúmenes. Fechas siempre como strings YYYY-MM-DD; las
// diferencias de días se calculan con Date.UTC para no depender del TZ local.

import { normalizarModelo } from '@/lib/inventario-indicadores'
import { DIAS_INCOBRABLE } from '@/lib/incobrabilidad'
import type { VintageRow } from '@/lib/actions/finanzas'

export const MAX_ORDENES_COSECHA = 10000
export const PASO_CURVA_DIAS = 7
export const COBERTURA_MINIMA = 0.5
export const ESTADOS_TRUSTONIC = ['active', 'locked', 'ready_for_use', 'idle', 'released', 'returned'] as const

export interface FiltrosCosecha {
  canal: 'total' | 'propia' | 'terceros'
  merchantId?: string
  storeId?: string
  segmentoLetra?: string
  segmentoNumero?: string
  bloqueo?: 'knox' | 'motosafe' | 'dlc'
  trustonic?: string[] // estados elegidos; undefined/[] = todos
  modelos?: string[]   // labels normalizados elegidos; undefined/[] = todos
}

export interface DefCosecha {
  nombre: string
  fechaDesde: string // YYYY-MM-DD
  fechaHasta: string
  filtros: FiltrosCosecha
  limite: number | null
}

export interface Cosecha extends DefCosecha {
  id: string
  cantOrdenes: number
  cantDisponibles: number
  montoTotal: number
  createdAt: string
}

export interface CuotaCosecha {
  orderId: string
  venta: string // YYYY-MM-DD (order_created_at ART)
  due: string
  collected: string | null
  descartada: boolean // installment_discarded_at IS NOT NULL
  cb: boolean // la orden tiene contracargo
  amount: number
}

export interface PuntoCurva { edadDias: number; pctImpago: number; cobertura: number }

export interface MadurezCosecha {
  montoTotal: number; montoPorVencer: number; pctPorVencer: number
  finCiclo: string | null; diasRestantes: number
  edadDias: number; primeraVenta: string | null; ultimaVenta: string | null
}

export type CosechaVintage = Omit<VintageRow, 'origination_month'>

export interface GrupoModelo { label: string; variantes: string[]; n: number }

// --- helpers de fecha (YYYY-MM-DD, siempre UTC) ---

const DIA_MS = 24 * 60 * 60 * 1000

function fechaAUtcMs(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((fechaAUtcMs(hasta) - fechaAUtcMs(desde)) / DIA_MS)
}

function sumarDias(fecha: string, dias: number): string {
  return new Date(fechaAUtcMs(fecha) + dias * DIA_MS).toISOString().slice(0, 10)
}

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function validarDefCosecha(def: DefCosecha): string | null {
  if (def.nombre.trim() === '') return 'El nombre no puede estar vacío'
  if (!FECHA_REGEX.test(def.fechaDesde) || !FECHA_REGEX.test(def.fechaHasta)) {
    return 'Las fechas deben tener formato YYYY-MM-DD'
  }
  if (def.fechaDesde > def.fechaHasta) return 'La fecha desde no puede ser posterior a la fecha hasta'
  if (def.limite !== null && (!Number.isInteger(def.limite) || def.limite < 1 || def.limite > MAX_ORDENES_COSECHA)) {
    return `El límite debe ser un número entero entre 1 y ${MAX_ORDENES_COSECHA}`
  }
  return null
}

/** El caller ya ordenó cronológicamente; acá solo se recorta. */
export function aplicarLimite<T>(items: T[], limite: number | null): T[] {
  if (limite === null || limite >= items.length) return items
  return items.slice(0, limite)
}

/**
 * Agrupa filas de modelo por su clave normalizada (mismo modelo con distinto
 * nombre de catálogo/tienda). El label del grupo es la variante más frecuente
 * (empate → alfabética, para que el resultado sea determinístico).
 */
export function agruparModelos(filas: { model: string; n: number }[]): GrupoModelo[] {
  const porClave = new Map<string, Map<string, number>>()
  for (const { model, n } of filas) {
    const clave = normalizarModelo(model)
    const variantes = porClave.get(clave) ?? new Map<string, number>()
    variantes.set(model, (variantes.get(model) ?? 0) + n)
    porClave.set(clave, variantes)
  }

  const grupos: GrupoModelo[] = []
  for (const variantes of porClave.values()) {
    const nombres = [...variantes.keys()].sort()
    let label = nombres[0]
    let maxN = variantes.get(label)!
    for (const nombre of nombres) {
      const n = variantes.get(nombre)!
      if (n > maxN) { label = nombre; maxN = n }
    }
    const n = [...variantes.values()].reduce((s, v) => s + v, 0)
    grupos.push({ label, variantes: nombres, n })
  }
  return grupos.sort((a, b) => b.n - a.n)
}

const CAMPOS_MONTO_PCT: [keyof VintageRow & `amt_${string}`, keyof VintageRow & `pct_${string}`][] = [
  ['amt_por_vencer', 'pct_por_vencer'],
  ['amt_cobrada_en_termino', 'pct_cobrada_en_termino'],
  ['amt_mora_1_29', 'pct_mora_1_29'],
  ['amt_mora_30_59', 'pct_mora_30_59'],
  ['amt_mora_60_89', 'pct_mora_60_89'],
  ['amt_incobrable_90_plus', 'pct_incobrable_90_plus'],
  ['amt_recupero_1_29', 'pct_recupero_1_29'],
  ['amt_recupero_30_59', 'pct_recupero_30_59'],
  ['amt_recupero_60_89', 'pct_recupero_60_89'],
  ['amt_recupero_90_119', 'pct_recupero_90_119'],
  ['amt_recupero_120_plus', 'pct_recupero_120_plus'],
]

/**
 * Suma los montos de varias filas de vintage (ya separadas por cohorte custom)
 * y re-deriva cada % sobre el total agregado — promediar los % originales
 * daría un resultado distinto (y erróneo) cuando las filas tienen tamaños
 * distintos.
 */
export function agregarVintage(rows: VintageRow[]): CosechaVintage {
  let amtTotal = 0
  const montos = new Map<string, number>(CAMPOS_MONTO_PCT.map(([amtKey]) => [amtKey, 0]))
  for (const row of rows) {
    amtTotal += row.amt_total
    for (const [amtKey] of CAMPOS_MONTO_PCT) montos.set(amtKey, montos.get(amtKey)! + row[amtKey])
  }

  const resultado = { amt_total: amtTotal } as CosechaVintage
  for (const [amtKey, pctKey] of CAMPOS_MONTO_PCT) {
    const amt = montos.get(amtKey)!
    ;(resultado as Record<string, number>)[amtKey] = amt
    ;(resultado as Record<string, number>)[pctKey] = amtTotal === 0 ? 0 : Math.round((amt / amtTotal) * 10000) / 100
  }
  return resultado
}

/**
 * Curva de evolución de mora por edad de cohorte: en cada punto d (múltiplo
 * de pasoDias) solo entran las órdenes que ya alcanzaron esa edad — así el
 * % no se contamina con órdenes demasiado jóvenes para haber llegado ahí.
 * pctImpago = monto impago a edad d / monto vencido a edad d (ponderado por
 * monto, no por cantidad de cuotas — spec decisiones 8 y 14).
 * cobertura < COBERTURA_MINIMA (muy pocas órdenes alcanzaron esa edad todavía)
 * o sin monto vencido en el punto → se omite.
 */
export function curvaEvolucion(cuotas: CuotaCosecha[], hoy: string, pasoDias: number = PASO_CURVA_DIAS): PuntoCurva[] {
  const activas = cuotas.filter(c => !c.descartada)
  if (activas.length === 0) return []

  const ventaPorOrden = new Map<string, string>()
  for (const c of activas) {
    if (!ventaPorOrden.has(c.orderId)) ventaPorOrden.set(c.orderId, c.venta)
  }
  const ordenes = [...ventaPorOrden.entries()].map(([orderId, venta]) => ({
    orderId,
    venta,
    edad: diasEntre(venta, hoy),
  }))
  const totalOrdenes = ordenes.length
  const edadMaxima = Math.max(...ordenes.map(o => o.edad))

  const puntos: PuntoCurva[] = []
  for (let d = pasoDias; d <= edadMaxima; d += pasoDias) {
    const activasEnD = ordenes.filter(o => o.edad >= d)
    const ratioExacto = activasEnD.length / totalOrdenes
    if (ratioExacto < COBERTURA_MINIMA) continue
    // cobertura = 1 EXACTO solo si todas las órdenes alcanzaron esta edad;
    // si no, se redondea a 4 decimales (no 2) para que p. ej. 0.996 no
    // termine mostrándose como "100%"/sólido en la UI (cobertura === 1).
    const cobertura = activasEnD.length === totalOrdenes ? 1 : Math.round(ratioExacto * 10000) / 10000

    const limitePorOrden = new Map(activasEnD.map(o => [o.orderId, sumarDias(o.venta, d)]))
    // Ponderado por MONTO (no por cantidad de cuotas): spec decisiones 8/14.
    let vencido = 0
    let impago = 0
    for (const c of activas) {
      const limite = limitePorOrden.get(c.orderId)
      if (limite === undefined || c.due > limite) continue
      vencido += c.amount
      const collected = c.cb ? null : c.collected
      if (collected === null || collected > limite) impago += c.amount
    }
    if (vencido === 0) continue

    puntos.push({ edadDias: d, pctImpago: Math.round((impago / vencido) * 10000) / 100, cobertura })
  }
  return puntos
}

/** Sobre cuotas no descartadas: cuánto falta vencer y cuándo termina el ciclo de la cohorte. */
export function resumenMadurez(cuotas: CuotaCosecha[], hoy: string): MadurezCosecha {
  const activas = cuotas.filter(c => !c.descartada)
  if (activas.length === 0) {
    return {
      montoTotal: 0, montoPorVencer: 0, pctPorVencer: 0,
      finCiclo: null, diasRestantes: 0,
      edadDias: 0, primeraVenta: null, ultimaVenta: null,
    }
  }

  const montoTotal = activas.reduce((s, c) => s + c.amount, 0)
  const montoPorVencer = activas.filter(c => c.due > hoy).reduce((s, c) => s + c.amount, 0)
  const pctPorVencer = montoTotal === 0 ? 0 : Math.round((montoPorVencer / montoTotal) * 10000) / 100

  const maxDue = activas.reduce((m, c) => (c.due > m ? c.due : m), activas[0].due)
  const finCiclo = sumarDias(maxDue, DIAS_INCOBRABLE)
  const diasRestantes = Math.max(0, diasEntre(hoy, finCiclo))

  const primeraVenta = activas.reduce((m, c) => (c.venta < m ? c.venta : m), activas[0].venta)
  const ultimaVenta = activas.reduce((m, c) => (c.venta > m ? c.venta : m), activas[0].venta)
  const edadDias = diasEntre(ultimaVenta, hoy) // la orden más joven es la de venta más reciente

  return { montoTotal, montoPorVencer, pctPorVencer, finCiclo, diasRestantes, edadDias, primeraVenta, ultimaVenta }
}
