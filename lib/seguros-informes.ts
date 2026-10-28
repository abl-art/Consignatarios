// Seguro por robo: informes de devengo mensual (prima/ingreso/resultado) y
// siniestralidad sobre los certificados ya emitidos (lib/seguros.ts). Lógica
// pura: recibe certificados y parámetros de tasa, no toca la base.

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

/** Porcentaje vigente para un mes dado: el parámetro con mayor vigenteDesde <= ese mes. Lista de entrada puede venir sin ordenar. */
function pctVigente(params: ParametroPct[], mes: string): number {
  let mejor: ParametroPct | null = null
  for (const p of params) {
    const desde = aMes(p.vigenteDesde)
    if (compararMeses(desde, mes) <= 0 && (mejor === null || compararMeses(desde, aMes(mejor.vigenteDesde)) > 0)) {
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
