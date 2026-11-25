// Logica pura de stock options de Grupo GO. Decisiones de Emiliano (25/11):
// - Opcion clasica: la persona cobra la DIFERENCIA entre el valor actual de su
//   paquete y el valor al ingreso (nunca negativa).
// - Devengamiento ANUAL y PERSONALIZADO: cliff y periodo en anios, y un
//   esquema editable de % por anio (suma 100). Antes del cliff no se cobra
//   nada; al cumplirlo se devenga de golpe lo acumulado de esos anios.
// Todo en USD. Sin fechas implicitas: "hoy" siempre entra por parametro.

export interface EsquemaAnio {
  anio: number // 1..periodoAnios
  pct: number  // porcentaje del paquete que devenga ese anio (0-100)
}

export interface GrantParams {
  fechaOtorgamiento: string // YYYY-MM-DD
  sueldoMensualUsd: number
  multiplo: number
  valuacionIngresoUsd: number
  cliffAnios: number
  periodoAnios: number
  esquema: EsquemaAnio[]
}

export interface StockOptionRow {
  id: number
  nombre: string
  fecha_otorgamiento: string
  sueldo_mensual_usd: number
  multiplo: number
  valuacion_ingreso_usd: number
  cliff_anios: number
  periodo_anios: number
  esquema: EsquemaAnio[]
  /** Cierre (salida del colaborador): deja de devengar en esta fecha. NULL = vigente. */
  cierre_fecha: string | null
  /** 'recompra' (la empresa pago lo devengado) | 'conserva' (mantiene lo devengado) */
  cierre_tipo: string | null
  /** Pagado en la recompra (USD, congelado al cierre) */
  cierre_monto_usd: number | null
  created_at: string
}

export interface ValuacionEmpresa {
  id: number
  fecha: string
  valuacion_usd: number
  nota: string | null
  created_at: string
}

function parseFecha(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

/** Anios COMPLETOS transcurridos desde una fecha ISO hasta `hoy` (0 si es futura). */
export function aniosCompletos(desdeIso: string, hoy: Date): number {
  const { y, m, d } = parseFecha(desdeIso)
  let anios = hoy.getUTCFullYear() - y
  const mesHoy = hoy.getUTCMonth() + 1
  if (mesHoy < m || (mesHoy === m && hoy.getUTCDate() < d)) anios -= 1
  return Math.max(0, anios)
}

/** Fecha ISO del aniversario N del otorgamiento. */
export function fechaAniversario(iso: string, n: number): string {
  const { y, m, d } = parseFecha(iso)
  return `${y + n}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** % acumulado del esquema hasta el anio `n` inclusive (0-100). */
function pctAcumulado(esquema: EsquemaAnio[], n: number): number {
  return esquema.reduce((s, e) => s + (e.anio <= n ? Number(e.pct) || 0 : 0), 0)
}

/** Fraccion [0..1] devengada a `hoy`: 0 antes del cliff; despues, el acumulado
 *  del esquema hasta el ultimo anio cumplido. */
export function fraccionDevengada(
  g: Pick<GrantParams, 'fechaOtorgamiento' | 'cliffAnios' | 'periodoAnios' | 'esquema'>,
  hoy: Date,
): number {
  const anios = aniosCompletos(g.fechaOtorgamiento, hoy)
  if (anios < g.cliffAnios) return 0
  return Math.min(1, pctAcumulado(g.esquema, Math.min(anios, g.periodoAnios)) / 100)
}

export interface PaqueteCalculado {
  /** Valor del paquete al ingreso: sueldo mensual x multiplo (USD) */
  base: number
  /** Porcentaje de la empresa que representa el paquete completo */
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
  return { base, fraccionEmpresa, valorActualPaquete, diferenciaTotal, fraccionDevengada: fd, diferenciaDevengada: diferenciaTotal * fd }
}

export interface FilaAnio {
  anio: number
  fecha: string // aniversario que cierra el anio
  pct: number // % del paquete que devenga ese anio
  pctAcumulado: number
  /** % de la empresa que le corresponde acumulado a ese anio */
  fraccionEmpresaAcum: number
  /** lo que gana ESE anio (diferenciaTotal x pct); null sin valuacion */
  ganaEnElAnio: number | null
  /** acumulado cobrable al cierre de ese anio (0 si el anio es pre-cliff) */
  acumuladoCobrable: number | null
  /** true = el % de este anio recien se cobra al cumplirse el cliff */
  preCliff: boolean
  cumplido: boolean
}

/** Tabla anio por anio para el panel: que devenga, que % de la empresa le
 *  corresponde y que va ganando en cada anio. */
export function filasPorAnio(g: GrantParams, valuacionActualUsd: number | null, hoy: Date): FilaAnio[] {
  const c = calcularPaquete(g, valuacionActualUsd, hoy)
  const anios = aniosCompletos(g.fechaOtorgamiento, hoy)
  const filas: FilaAnio[] = []
  for (let n = 1; n <= g.periodoAnios; n++) {
    const pct = Number(g.esquema.find(e => e.anio === n)?.pct) || 0
    const acum = pctAcumulado(g.esquema, n)
    const preCliff = n < g.cliffAnios
    filas.push({
      anio: n,
      fecha: fechaAniversario(g.fechaOtorgamiento, n),
      pct,
      pctAcumulado: acum,
      fraccionEmpresaAcum: c.fraccionEmpresa * (acum / 100),
      ganaEnElAnio: c.diferenciaTotal === null ? null : c.diferenciaTotal * (pct / 100),
      acumuladoCobrable: c.diferenciaTotal === null ? null : (preCliff ? 0 : c.diferenciaTotal * (acum / 100)),
      preCliff,
      cumplido: anios >= n,
    })
  }
  return filas
}

/** Proximo aniversario en que sube lo cobrable, con la fraccion que quedara vigente. */
export function proximoHito(
  g: Pick<GrantParams, 'fechaOtorgamiento' | 'cliffAnios' | 'periodoAnios' | 'esquema'>,
  hoy: Date,
): { fecha: string; fraccion: number } | null {
  const anios = aniosCompletos(g.fechaOtorgamiento, hoy)
  const actual = fraccionDevengada(g, hoy)
  for (let n = anios + 1; n <= g.periodoAnios; n++) {
    const enN = n < g.cliffAnios ? 0 : Math.min(1, pctAcumulado(g.esquema, n) / 100)
    if (enN > actual) return { fecha: fechaAniversario(g.fechaOtorgamiento, n), fraccion: enN }
  }
  return null
}

/** Esquema parejo por default para un periodo (suma exactamente 100). */
export function esquemaParejo(periodoAnios: number): EsquemaAnio[] {
  if (periodoAnios <= 0) return []
  const pct = Math.floor((100 / periodoAnios) * 100) / 100
  const filas = Array.from({ length: periodoAnios }, (_, i) => ({ anio: i + 1, pct }))
  filas[filas.length - 1].pct = Math.round((100 - pct * (periodoAnios - 1)) * 100) / 100
  return filas
}

/** null si el esquema es valido; mensaje de error si no. */
export function validarEsquema(esquema: EsquemaAnio[], periodoAnios: number): string | null {
  if (esquema.length !== periodoAnios) return `El esquema debe tener ${periodoAnios} anios`
  for (let n = 1; n <= periodoAnios; n++) {
    const e = esquema.find(x => x.anio === n)
    if (!e) return `Falta el anio ${n} en el esquema`
    if (!(Number(e.pct) >= 0)) return `El % del anio ${n} es invalido`
  }
  const suma = esquema.reduce((s, e) => s + Number(e.pct), 0)
  if (Math.abs(suma - 100) > 0.01) return `Los porcentajes suman ${suma.toFixed(2)}% — tienen que sumar 100%`
  return null
}

/** Fecha efectiva de calculo del devengamiento: el cierre congela el reloj. */
export function fechaCalculo(row: Pick<StockOptionRow, 'cierre_fecha'>, hoy: Date): Date {
  if (!row.cierre_fecha) return hoy
  const corte = new Date(`${row.cierre_fecha}T00:00:00Z`)
  return corte < hoy ? corte : hoy
}

export interface Indicadores {
  /** Fraccion de la empresa comprometida en stock options vigentes + conservadas */
  comprometido: number
  /** De lo comprometido, lo ya devengado */
  devengado: number
  /** De lo comprometido, lo que falta devengar (solo grants vigentes) */
  porDevengar: number
  /** USD pagados en recompras (congelado por cierre) */
  gastoRecompras: number
}

// Reglas (decision de Emiliano 25/11):
// - vigente: compromete TODO su % (devengado + por devengar)
// - conserva: compromete solo lo devengado al cierre (lo no devengado vuelve)
// - recompra: no compromete nada (la empresa recupero el %) y suma al gasto
export function indicadores(rows: StockOptionRow[], hoy: Date): Indicadores {
  let comprometido = 0, devengado = 0, gastoRecompras = 0
  for (const r of rows) {
    const g = rowToGrant(r)
    const fe = g.valuacionIngresoUsd > 0 ? (g.sueldoMensualUsd * g.multiplo) / g.valuacionIngresoUsd : 0
    if (r.cierre_tipo === 'recompra') {
      gastoRecompras += Number(r.cierre_monto_usd) || 0
      continue
    }
    const fd = fraccionDevengada(g, fechaCalculo(r, hoy))
    if (r.cierre_tipo === 'conserva') {
      comprometido += fe * fd
      devengado += fe * fd
    } else {
      comprometido += fe
      devengado += fe * fd
    }
  }
  return { comprometido, devengado, porDevengar: Math.max(0, comprometido - devengado), gastoRecompras }
}

export interface ProfitPersona {
  nombre: string
  /** 'liquidado' = recompra (cobro y salio) · 'acumulado' = vigente o conserva */
  tipo: 'liquidado' | 'acumulado'
  monto: number
}

/** Datos del grafico: profit liquidado (recompras, congelado) vs acumulado
 *  (vigentes/conservadas: diferencia devengada a valuacion actual). */
export function profitPorPersona(rows: StockOptionRow[], valuacionActualUsd: number | null, hoy: Date): ProfitPersona[] {
  return rows.map(r => {
    if (r.cierre_tipo === 'recompra') {
      return { nombre: r.nombre, tipo: 'liquidado' as const, monto: Number(r.cierre_monto_usd) || 0 }
    }
    const c = calcularPaquete(rowToGrant(r), valuacionActualUsd, fechaCalculo(r, hoy))
    return { nombre: r.nombre, tipo: 'acumulado' as const, monto: c.diferenciaDevengada ?? 0 }
  })
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
    cliffAnios: Number(r.cliff_anios),
    periodoAnios: Number(r.periodo_anios),
    esquema: Array.isArray(r.esquema) ? r.esquema : [],
  }
}
