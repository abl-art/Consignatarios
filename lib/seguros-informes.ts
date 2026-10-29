// Seguro por robo: informes de devengo mensual (prima/ingreso/resultado) y
// siniestralidad sobre los certificados ya emitidos (lib/seguros.ts), más el
// export de las 19 columnas que consume el broker. Lógica pura: recibe
// certificados y parámetros de tasa, no toca la base.

import type { CertificadoRow } from '@/lib/actions/seguros'

/** Redondeo estándar a 2 decimales, evitando el drift de punto flotante. */
function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export type CertDevengo = {
  costoSinIva: number
  sumaAsegurada: number
  inicioVig: string
  finVig: string
  fechaAnula: string | null
  fechaSiniestro: string | null
  estado: string
}

export type ParametroPct = { porcentaje: number; vigenteDesde: string }

export type MesDevengo = {
  mes: string
  certificados: number
  sumaVigente: number
  prima: number
  ingreso: number
  resultado: number
}

/** 'YYYY-MM-DD' (o 'YYYY-MM') → 'YYYY-MM'. */
function aMes(fecha: string): string {
  return fecha.slice(0, 7)
}

/** Compara dos 'YYYY-MM': el formato con ancho fijo hace que el orden lexicográfico coincida con el cronológico. */
function compararMeses(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Suma (o resta) meses a un 'YYYY-MM'. */
function sumarMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const indice = (m - 1) + delta
  const anio = y + Math.floor(indice / 12)
  const mesDestino = ((indice % 12) + 12) % 12
  return `${anio}-${String(mesDestino + 1).padStart(2, '0')}`
}

/** Fin efectivo de vigencia: el más temprano entre finVig, fechaAnula y fechaSiniestro. */
function finEfectivo(c: CertDevengo): string {
  const candidatas = [c.finVig, c.fechaAnula, c.fechaSiniestro].filter(
    (d): d is string => d !== null,
  )
  return candidatas.reduce((min, d) => (d < min ? d : min))
}

/**
 * Porcentaje vigente para un mes dado: entre los parámetros cuyo mes de
 * vigencia (aMes(vigenteDesde)) es <= ese mes, gana el de mayor vigenteDesde
 * COMPLETO (comparación de string 'YYYY-MM-DD', no solo el mes). El % sigue
 * rigiendo para todo el mes calendario de su vigenteDesde — un tramo que
 * arranca a mitad de mes aplica igual desde el día 1 de ese mes; eso no
 * cambia. Lo que sí importa es el desempate entre dos tramos del MISMO mes
 * calendario (ej. una corrección de un % tipeado mal, cargada unos días
 * después con una vigenteDesde distinta pero el mismo mes): antes el
 * desempate era por mes (`aMes`), así que el tramo más viejo ganaba para
 * siempre y la corrección nunca se aplicaba aunque ambos chips se vieran en
 * la UI. Ahora gana el de vigenteDesde completo más reciente. Empate en
 * vigenteDesde completo idéntico: gana el último de la lista de entrada
 * (last-written wins) — lista de entrada puede venir sin ordenar. Si el mes
 * es anterior a TODOS los tramos (gap de configuración, ej. no se cargó la
 * tasa vigente al momento de la emisión), devuelve 0% a propósito — "sin
 * tramo cargado" nunca debe trabar el informe ni inflar un monto; simplemente
 * no devenga nada ese mes.
 */
function pctVigente(params: ParametroPct[], mes: string): number {
  let mejor: ParametroPct | null = null
  for (const p of params) {
    if (compararMeses(aMes(p.vigenteDesde), mes) > 0) continue
    if (mejor === null || p.vigenteDesde >= mejor.vigenteDesde) {
      mejor = p
    }
  }
  return mejor ? mejor.porcentaje : 0
}

/**
 * Devengo mensual de prima e ingreso para una cartera de certificados, mes a mes
 * desde el primer mes en que algún certificado estuvo vigente hasta hastaMes
 * inclusive. Un certificado devenga en todo mes calendario en que estuvo vigente
 * al menos un día (fin efectivo = min(finVig, fechaAnula, fechaSiniestro)); los
 * certificados en estado 'pendiente' no devengan nunca. Los meses sin ningún
 * certificado vigente dentro del rango se incluyen igual, con todo en cero (más
 * simple de consumir y mejor para graficar que omitirlos).
 */
export function devengoMensual(
  certs: CertDevengo[],
  primas: ParametroPct[],
  ingresos: ParametroPct[],
  hastaMes: string,
): MesDevengo[] {
  const activos = certs
    .filter(c => c.estado !== 'pendiente')
    .map(c => ({ cert: c, inicio: aMes(c.inicioVig), fin: aMes(finEfectivo(c)) }))

  if (activos.length === 0) return []

  const primerMes = activos.reduce(
    (min, r) => (compararMeses(r.inicio, min) < 0 ? r.inicio : min),
    activos[0].inicio,
  )

  const meses: string[] = []
  for (let mes = primerMes; compararMeses(mes, hastaMes) <= 0; mes = sumarMes(mes, 1)) {
    meses.push(mes)
  }

  return meses.map(mes => {
    let certificados = 0
    let sumaVigente = 0
    let prima = 0
    let ingreso = 0

    for (const r of activos) {
      if (compararMeses(mes, r.inicio) >= 0 && compararMeses(mes, r.fin) <= 0) {
        certificados += 1
        sumaVigente += r.cert.sumaAsegurada
        prima += r.cert.sumaAsegurada * (pctVigente(primas, mes) / 100)
        ingreso += r.cert.costoSinIva * (pctVigente(ingresos, mes) / 100)
      }
    }

    const primaRed = redondear2(prima)
    const ingresoRed = redondear2(ingreso)

    return {
      mes,
      certificados,
      sumaVigente: redondear2(sumaVigente),
      prima: primaRed,
      ingreso: ingresoRed,
      resultado: redondear2(ingresoRed - primaRed),
    }
  })
}

/**
 * Tasa de siniestralidad sobre los certificados emitidos (excluye 'pendiente',
 * que todavía no es una póliza vigente): cuántos de los emitidos tienen
 * fechaSiniestro.
 */
export function tasaSiniestralidad(
  certs: { fechaSiniestro: string | null; estado: string }[],
): { emitidos: number; siniestrados: number; tasaPct: number } {
  const emitidos = certs.filter(c => c.estado !== 'pendiente')
  const siniestrados = emitidos.filter(c => c.fechaSiniestro !== null).length
  const tasaPct = emitidos.length === 0 ? 0 : redondear2((siniestrados / emitidos.length) * 100)
  return { emitidos: emitidos.length, siniestrados, tasaPct }
}

// ---------------------------------------------------------------------------
// Export Excel del broker
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' → 'DD/MM/YYYY': reordenamiento de string puro, sin pasar por Date. */
function aFechaDDMMYYYY(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

const TIPO_DOCUMENTO = 'DNI'
const TIPO_COMPROBANTE = 'Factura B'

/** Encabezado exacto (19 columnas, en este orden) que espera el broker del seguro por robo. */
export const COLUMNAS_BROKER: string[] = [
  'N° certificado ',
  'Tipo ',
  'Nº Documento',
  'Cliente (Apellido y Nombre)',
  'Domicilio',
  'Codigo Postal',
  'Localidad',
  'Articulo (Descripcion, marca, modelo)',
  'IMEI',
  'SUMA ASEGURADA',
  'Fecha Factura',
  'Fecha Anula',
  'Inicio Vig',
  'Fin Vig',
  'Tipo de comprobante (fac A/B - NC A/B)',
  'Nº Factura',
  'Fecha Siniestro',
  'N° Orden GOcuotas',
  'N° Pedido GOcelular',
]

// ---------------------------------------------------------------------------
// Cierre mensual (snapshot congelado por lib/actions/seguros.ts::congelarCierre)
// ---------------------------------------------------------------------------

export type ResumenCierre = {
  mes: string
  certificados: number
  vigentes: number
  anulados: number
  siniestrados: number
  pendientes: number
  sumaVigente: number
  prima: number
  ingreso: number
  resultado: number
}

/**
 * ¿`mes` es un mes válido para congelar un cierre? Formato estricto 'YYYY-MM'
 * y estrictamente ANTERIOR a `mesActual` (el mes en curso no cerró todavía;
 * un mes futuro congelaría un cierre falso que además bloquearía al cron real
 * por el on-conflict). Con formato libre, un string no comparable ('garbage')
 * colgaría el loop de devengoMensual — por eso se valida antes de computar.
 */
export function esMesCierreValido(mes: string, mesActual: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes < mesActual
}

/** Último día (inclusive) de un 'YYYY-MM', como 'YYYY-MM-DD'. */
function ultimoDiaMes(mes: string): string {
  const [anio, mesNum] = mes.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(anio, mesNum, 0)).getUTCDate()
  return `${mes}-${String(ultimoDia).padStart(2, '0')}`
}

/**
 * Arma el cierre congelado de un mes: el resumen de devengo (delegado a
 * devengoMensual, sin reimplementar la matemática) más los conteos por
 * estado y las filas del Excel del broker (delegadas a filasBroker).
 *
 * Conteo por estado — relativo al MES PEDIDO, no al estado actual del
 * certificado (un cierre de un mes pasado no se entera de novedades
 * posteriores a ese mes):
 *  - 'pendiente': por el campo `estado` (nunca devenga, ver devengoMensual).
 *  - 'anulado': fechaAnula <= último día del mes pedido.
 *  - 'siniestrado': fechaSiniestro <= último día del mes pedido.
 *  - si un certificado tiene AMBAS fechas dentro del mes pedido, gana la más
 *    temprana (el evento que realmente ocurrió primero).
 *  - 'vigente': el resto — incluye certificados cuya fechaAnula/fechaSiniestro
 *    es POSTERIOR al mes pedido: el cierre de octubre no sabe de una
 *    anulación de noviembre, así que ese certificado era vigente en octubre
 *    y devengó normalmente ese mes.
 *
 * `resumen.certificados` es el total de certificados pasados (vigentes +
 * anulados + siniestrados + pendientes), no el conteo de devengoMensual para
 * ese mes (que excluye pendientes). sumaVigente/prima/ingreso/resultado SÍ
 * salen literal de la fila `mes` de devengoMensual (0 si ese mes no aparece,
 * ej. no hay ningún certificado emitido todavía).
 */
export function armarCierre(
  certs: CertificadoRow[],
  facturas: Map<string, { numero: string; fecha: string }>,
  primas: ParametroPct[],
  ingresos: ParametroPct[],
  mes: string,
): { resumen: ResumenCierre; filas: (string | number | null)[][] } {
  const finMesPedido = ultimoDiaMes(mes)

  let vigentes = 0
  let anulados = 0
  let siniestrados = 0
  let pendientes = 0

  for (const c of certs) {
    if (c.estado === 'pendiente') {
      pendientes += 1
      continue
    }
    const anuladoEnMes = c.fechaAnula !== null && c.fechaAnula <= finMesPedido
    const siniestradoEnMes = c.fechaSiniestro !== null && c.fechaSiniestro <= finMesPedido

    if (anuladoEnMes && siniestradoEnMes) {
      // Ambas fechas caen dentro del mes pedido: gana la más temprana.
      if (c.fechaSiniestro! <= c.fechaAnula!) siniestrados += 1
      else anulados += 1
    } else if (siniestradoEnMes) {
      siniestrados += 1
    } else if (anuladoEnMes) {
      anulados += 1
    } else {
      vigentes += 1
    }
  }

  const certsDevengo: CertDevengo[] = certs
    .filter(c => c.estado !== 'pendiente')
    .map(c => ({
      costoSinIva: c.costoSinIva ?? 0,
      sumaAsegurada: c.sumaAsegurada ?? 0,
      inicioVig: c.inicioVig,
      finVig: c.finVig,
      fechaAnula: c.fechaAnula,
      fechaSiniestro: c.fechaSiniestro,
      estado: c.estado,
    }))

  const filaMes = devengoMensual(certsDevengo, primas, ingresos, mes).find(m => m.mes === mes)

  const resumen: ResumenCierre = {
    mes,
    certificados: certs.length,
    vigentes,
    anulados,
    siniestrados,
    pendientes,
    sumaVigente: filaMes?.sumaVigente ?? 0,
    prima: filaMes?.prima ?? 0,
    ingreso: filaMes?.ingreso ?? 0,
    resultado: filaMes?.resultado ?? 0,
  }

  return { resumen, filas: filasBroker(certs, facturas) }
}

/**
 * Filas del export del broker: un certificado por fila, en las 19 columnas de
 * COLUMNAS_BROKER. Los certificados 'pendiente' (sin póliza emitida todavía)
 * se excluyen; los anulados se incluyen con su Fecha Anula. `facturas` mapea
 * gocuotas_order_id → factura B autorizada (ver fetchFacturasBPorOrden); si un
 * certificado no tiene factura, Fecha Factura y Nº Factura van en null. Las
 * filas salen ordenadas por número de certificado ascendente.
 */
export function filasBroker(
  certs: CertificadoRow[],
  facturas: Map<string, { numero: string; fecha: string }>,
): (string | number | null)[][] {
  return certs
    .filter(c => c.estado !== 'pendiente')
    .slice()
    .sort((a, b) => (a.numero ?? Infinity) - (b.numero ?? Infinity))
    .map(c => {
      const factura = facturas.get(c.gocuotasOrderId) ?? null
      return [
        c.numero,
        TIPO_DOCUMENTO,
        c.dni,
        c.cliente,
        c.domicilio,
        c.cp,
        c.localidad,
        c.articulo,
        c.imei,
        c.sumaAsegurada,
        factura ? aFechaDDMMYYYY(factura.fecha) : null,
        c.fechaAnula ? aFechaDDMMYYYY(c.fechaAnula) : null,
        aFechaDDMMYYYY(c.inicioVig),
        aFechaDDMMYYYY(c.finVig),
        TIPO_COMPROBANTE,
        factura ? factura.numero : null,
        c.fechaSiniestro ? aFechaDDMMYYYY(c.fechaSiniestro) : null,
        c.gocuotasOrderId,
        c.pedidoNumero,
      ]
    })
}
