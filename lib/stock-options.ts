// Logica pura de stock options de Grupo GO (opcion clasica, decision de
// Emiliano 25/11: la persona cobra la DIFERENCIA entre el valor actual de su
// paquete y el valor al ingreso, devengada segun cliff + periodo + frecuencia).
// Todo en USD. Sin fechas implicitas: "hoy" siempre entra por parametro.

export interface GrantParams {
  fechaOtorgamiento: string // YYYY-MM-DD
  sueldoMensualUsd: number
  multiplo: number
  valuacionIngresoUsd: number
  cliffMeses: number
  periodoMeses: number
  devengamiento: 'mensual' | 'trimestral' | 'anual'
}

export interface StockOptionRow {
  id: number
  nombre: string
  fecha_otorgamiento: string
  sueldo_mensual_usd: number
  multiplo: number
  valuacion_ingreso_usd: number
  cliff_meses: number
  periodo_meses: number
  devengamiento: string
  created_at: string
}

export interface ValuacionEmpresa {
  id: number
  fecha: string
  valuacion_usd: number
  nota: string | null
  created_at: string
}

const PASO: Record<GrantParams['devengamiento'], number> = {
  mensual: 1,
  trimestral: 3,
  anual: 12,
}

function parseFecha(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

/** Meses COMPLETOS transcurridos desde una fecha ISO hasta `hoy` (0 si es futura). */
export function mesesCompletos(desdeIso: string, hoy: Date): number {
  const { y, m, d } = parseFecha(desdeIso)
  let meses = (hoy.getUTCFullYear() - y) * 12 + (hoy.getUTCMonth() + 1 - m)
  if (hoy.getUTCDate() < d) meses -= 1
  return Math.max(0, meses)
}

/** Suma `n` meses a una fecha ISO conservando el dia (regla simple, dia 1-28 seguro). */
function sumarMeses(iso: string, n: number): string {
  const { y, m, d } = parseFecha(iso)
  const total = (m - 1) + n
  const anio = y + Math.floor(total / 12)
  const mes = (total % 12) + 1
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Meses devengados: 0 antes del cliff; en el cliff se devenga cliff de una
 *  vez; despues suma por pasos enteros de la frecuencia hasta el periodo. */
function mesesDevengados(g: Pick<GrantParams, 'fechaOtorgamiento' | 'cliffMeses' | 'periodoMeses' | 'devengamiento'>, hoy: Date): number {
  const paso = PASO[g.devengamiento] ?? 1
  const meses = mesesCompletos(g.fechaOtorgamiento, hoy)
  if (meses < g.cliffMeses) return 0
  const extra = Math.floor((meses - g.cliffMeses) / paso) * paso
  return Math.min(g.periodoMeses, g.cliffMeses + extra)
}

/** Fraccion [0..1] del paquete devengada a la fecha `hoy`. */
export function fraccionDevengada(g: Pick<GrantParams, 'fechaOtorgamiento' | 'cliffMeses' | 'periodoMeses' | 'devengamiento'>, hoy: Date): number {
  if (g.periodoMeses <= 0) return 0
  return mesesDevengados(g, hoy) / g.periodoMeses
}

export interface PaqueteCalculado {
  /** Valor del paquete al ingreso: sueldo mensual x multiplo (USD) */
  base: number
  /** Porcentaje de la empresa que representa el paquete (base / valuacion al ingreso) */
  fraccionEmpresa: number
  /** base x (valuacion actual / valuacion ingreso); null sin valuacion actual */
  valorActualPaquete: number | null
  /** max(0, valorActualPaquete - base) — lo que cobraria al 100% devengado */
  diferenciaTotal: number | null
  fraccionDevengada: number
  /** diferenciaTotal x fraccionDevengada — el numero de "hoy" */
  diferenciaDevengada: number | null
}

export function calcularPaquete(g: GrantParams, valuacionActualUsd: number | null, hoy: Date): PaqueteCalculado {
  const base = g.sueldoMensualUsd * g.multiplo
  const fraccionEmpresa = g.valuacionIngresoUsd > 0 ? base / g.valuacionIngresoUsd : 0
  const fd = fraccionDevengada(g, hoy)
  if (valuacionActualUsd == null || !(valuacionActualUsd > 0) || g.valuacionIngresoUsd <= 0) {
    return { base, fraccionEmpresa, valorActualPaquete: null, diferenciaTotal: null, fraccionDevengada: fd, diferenciaDevengada: null }
  }
  const valorActualPaquete = base * (valuacionActualUsd / g.valuacionIngresoUsd)
  const diferenciaTotal = Math.max(0, valorActualPaquete - base)
  return {
    base,
    fraccionEmpresa,
    valorActualPaquete,
    diferenciaTotal,
    fraccionDevengada: fd,
    diferenciaDevengada: diferenciaTotal * fd,
  }
}

/** Proxima fecha en que sube lo devengado, con la fraccion que quedara vigente. */
export function proximoHito(g: Pick<GrantParams, 'fechaOtorgamiento' | 'cliffMeses' | 'periodoMeses' | 'devengamiento'>, hoy: Date): { fecha: string; fraccion: number } | null {
  const actuales = mesesDevengados(g, hoy)
  if (actuales >= g.periodoMeses) return null
  const paso = PASO[g.devengamiento] ?? 1
  const meses = mesesCompletos(g.fechaOtorgamiento, hoy)
  const siguientes = meses < g.cliffMeses
    ? g.cliffMeses
    : Math.min(g.periodoMeses, actuales + paso)
  return {
    fecha: sumarMeses(g.fechaOtorgamiento, siguientes),
    fraccion: siguientes / g.periodoMeses,
  }
}

/** Ultima valuacion de la empresa (por fecha, empate por created_at/id). */
export function ultimaValuacion(valuaciones: ValuacionEmpresa[]): ValuacionEmpresa | null {
  let mejor: ValuacionEmpresa | null = null
  for (const v of valuaciones) {
    if (!mejor) { mejor = v; continue }
    if (v.fecha > mejor.fecha) { mejor = v; continue }
    if (v.fecha === mejor.fecha && (v.created_at > mejor.created_at || (v.created_at === mejor.created_at && v.id > mejor.id))) mejor = v
  }
  return mejor
}

export function rowToGrant(r: StockOptionRow): GrantParams {
  return {
    fechaOtorgamiento: r.fecha_otorgamiento,
    sueldoMensualUsd: Number(r.sueldo_mensual_usd),
    multiplo: Number(r.multiplo),
    valuacionIngresoUsd: Number(r.valuacion_ingreso_usd),
    cliffMeses: Number(r.cliff_meses),
    periodoMeses: Number(r.periodo_meses),
    devengamiento: (['mensual', 'trimestral', 'anual'].includes(r.devengamiento) ? r.devengamiento : 'mensual') as GrantParams['devengamiento'],
  }
}
