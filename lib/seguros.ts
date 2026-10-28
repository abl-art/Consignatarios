import { normalizarModelo } from '@/lib/inventario-indicadores'

// Seguro por robo: emisión de certificados a partir de las ventas vinculadas (link
// GOcelular↔GOcuotas) y novedades de ciclo de vida (cambio de IMEI, anulación por
// descarte o contracargo, siniestro). Lógica pura; Task 4 persiste lo que estas
// funciones devuelven contra seguros_certificados (scripts/seguros.sql).

/** Suma asegurada = costo sin IVA + este margen fijo. */
const MARGEN_SUMA_ASEGURADA = 0.1

/** Meses de vigencia de la póliza desde la fecha de alta del pedido. */
const MESES_VIGENCIA = 9

export type VentaAsegurable = {
  gocuotasOrderId: string
  storeOrderId: string
  pedidoNumero: string
  linkedAt: string
  orderCreatedAt: string
  imei: string
  dni: string | null
  cliente: string | null
  shippingStreet: string | null
  shippingNumber: string | null
  shippingFloor: string | null
  shippingApartment: string | null
  branchAddress: string | null
  cp: string | null
  localidad: string | null
  articulo: string
}

export type CertificadoNuevo = {
  gocuotasOrderId: string
  storeOrderId: string
  pedidoNumero: string
  dni: string | null
  cliente: string | null
  domicilio: string | null
  cp: string | null
  localidad: string | null
  articulo: string
  imei: string
  costoSinIva: number | null
  sumaAsegurada: number | null
  costoFuente: 'lista' | 'inventario' | null
  inicioVig: string
  finVig: string
  estado: 'emitido' | 'pendiente'
}

/** Solo dígitos, sin ceros a la izquierda (conserva al menos un dígito). */
export function normalizarDni(dni: string): string {
  const soloDigitos = dni.replace(/\D/g, '')
  return soloDigitos.replace(/^0+(?=\d)/, '')
}

/** Redondeo estándar a 2 decimales, evitando el drift de punto flotante. */
function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Suma meses a una fecha ISO (acepta fecha sola o timestamp completo, usa solo
 * la parte de fecha). Si el día de origen no existe en el mes destino (ej. 31 de
 * mayo + 9 meses → "28 de febrero"), clampea al último día de ese mes en vez de
 * desbordar al mes siguiente.
 */
export function sumarMeses(fechaISO: string, meses: number): string {
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number)
  const indiceMes = (m - 1) + meses
  const anioDestino = y + Math.floor(indiceMes / 12)
  const mesDestino = ((indiceMes % 12) + 12) % 12
  const ultimoDiaMesDestino = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate()
  const dia = Math.min(d, ultimoDiaMesDestino)
  return new Date(Date.UTC(anioDestino, mesDestino, dia)).toISOString().slice(0, 10)
}

/** Domicilio de envío (calle + número, con piso/depto si hay) o la sucursal de retiro. */
export function armarDomicilio(v: VentaAsegurable): string | null {
  if (!v.shippingStreet) return v.branchAddress
  const base = v.shippingNumber ? `${v.shippingStreet} ${v.shippingNumber}` : v.shippingStreet
  const extras: string[] = []
  if (v.shippingFloor) extras.push(`Piso ${v.shippingFloor}`)
  if (v.shippingApartment) extras.push(`Depto ${v.shippingApartment}`)
  return extras.length > 0 ? `${base}, ${extras.join(', ')}` : base
}

type CostoResuelto = { costoSinIva: number; costoFuente: 'lista' | 'inventario' } | { costoSinIva: null; costoFuente: null }

function resolverCosto(
  v: VentaAsegurable,
  costosPorClave: Map<string, number>,
  costoPorImei: Map<string, number>,
): CostoResuelto {
  const porClave = costosPorClave.get(normalizarModelo(v.articulo))
  if (porClave !== undefined) return { costoSinIva: porClave, costoFuente: 'lista' }
  const porImei = costoPorImei.get(v.imei)
  if (porImei !== undefined) return { costoSinIva: porImei, costoFuente: 'inventario' }
  return { costoSinIva: null, costoFuente: null }
}

/**
 * Timestamp con separador espacio ("2026-10-22 18:25:58.527+00", formato nativo
 * de pg — así vienen linkedAt/orderCreatedAt desde lib/gocelular.ts) u 'T' ISO
 * ("2026-10-28T12:00:00+00:00", formato de PostgREST/Supabase — así viene
 * activadoAt), con o sin fracción de segundos y con offset "+00"/"+00:00"/"Z".
 * Parseo manual (no delega en el parser nativo de Date, cuyo soporte de
 * "T"+offset sin colon es inconsistente) para poder comparar dos timestamps de
 * fuentes distintas de forma numérica y no por orden lexicográfico de string:
 * con comparación de string, ' ' (0x20) < 'T' (0x54) hace que CUALQUIER
 * linkedAt del mismo día que la activación compare como "anterior" para
 * siempre, perdiendo certificados en silencio.
 */
const TS_REGEX = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{0,2})?$/

export function aEpocaMs(timestamp: string): number {
  const m = TS_REGEX.exec(timestamp.trim())
  if (!m) return new Date(timestamp).getTime() // fallback defensivo, no debería pasar con los formatos esperados
  const [, y, mo, d, h, mi, s, fracRaw, offRaw] = m
  const ms = fracRaw ? Math.round(Number(`0.${fracRaw}`) * 1000) : 0
  let offsetMin = 0
  if (offRaw && offRaw !== 'Z') {
    const signo = offRaw[0] === '-' ? -1 : 1
    const digitos = offRaw.slice(1).replace(':', '')
    const offH = Number(digitos.slice(0, 2))
    const offM = Number(digitos.slice(2, 4) || '0')
    offsetMin = signo * (offH * 60 + offM)
  }
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms)
  return utcMs - offsetMin * 60000
}

/**
 * Prepara los certificados a emitir para las ventas vinculadas nuevas: filtra las
 * que ya tienen certificado (idempotencia) y las vinculadas antes de activar el
 * seguro, resuelve costo/suma asegurada y calcula la vigencia (9 meses desde el
 * alta del pedido, clampeada a fin de mes).
 */
export function prepararCertificados(
  ventas: VentaAsegurable[],
  ordenesExistentes: Set<string>,
  costosPorClave: Map<string, number>,
  costoPorImei: Map<string, number>,
  activadoAt: string,
): CertificadoNuevo[] {
  return ventas
    .filter(v => !ordenesExistentes.has(v.gocuotasOrderId))
    .filter(v => aEpocaMs(v.linkedAt) >= aEpocaMs(activadoAt))
    .map(v => {
      const { costoSinIva, costoFuente } = resolverCosto(v, costosPorClave, costoPorImei)
      const sumaAsegurada = costoSinIva !== null ? redondear2(costoSinIva * (1 + MARGEN_SUMA_ASEGURADA)) : null
      return {
        gocuotasOrderId: v.gocuotasOrderId,
        storeOrderId: v.storeOrderId,
        pedidoNumero: v.pedidoNumero,
        dni: v.dni !== null ? normalizarDni(v.dni) : null,
        cliente: v.cliente,
        domicilio: armarDomicilio(v),
        cp: v.cp,
        localidad: v.localidad,
        articulo: v.articulo,
        imei: v.imei,
        costoSinIva,
        sumaAsegurada,
        costoFuente,
        inicioVig: v.orderCreatedAt.slice(0, 10),
        finVig: sumarMeses(v.orderCreatedAt, MESES_VIGENCIA),
        estado: sumaAsegurada !== null ? 'emitido' : 'pendiente',
      }
    })
}

export type CertActual = {
  id: string
  gocuotasOrderId: string
  imei: string
  fechaAnula: string | null
  fechaSiniestro: string | null
}

export type NovedadCertificado = {
  id: string
  imei?: string
  fechaAnula?: string
  motivoAnula?: 'descartada' | 'contracargo'
}

/**
 * Novedades de ciclo de vida para certificados ya emitidos: cambio de IMEI (reemplazo
 * de equipo en la orden) y anulación por descarte o contracargo. Un certificado que
 * ya tiene fechaAnula o fechaSiniestro nunca se toca de nuevo. Si una orden quedó
 * descartada y además tiene contracargo, gana el motivo con la fecha más temprana.
 */
export function novedadesDeCertificados(
  certs: CertActual[],
  imeiActualPorOrden: Map<string, string>,
  discardedPorOrden: Map<string, string>,
  contracargoPorOrden: Map<string, string>,
): NovedadCertificado[] {
  const novedades: NovedadCertificado[] = []

  for (const c of certs) {
    if (c.fechaAnula !== null || c.fechaSiniestro !== null) continue

    const novedad: NovedadCertificado = { id: c.id }
    let hayCambio = false

    const imeiActual = imeiActualPorOrden.get(c.gocuotasOrderId)
    if (imeiActual !== undefined && imeiActual !== c.imei) {
      novedad.imei = imeiActual
      hayCambio = true
    }

    const fechaDescartada = discardedPorOrden.get(c.gocuotasOrderId)
    const fechaContracargo = contracargoPorOrden.get(c.gocuotasOrderId)
    if (fechaDescartada !== undefined || fechaContracargo !== undefined) {
      const usarContracargo =
        fechaContracargo !== undefined && (fechaDescartada === undefined || fechaContracargo < fechaDescartada)
      novedad.fechaAnula = usarContracargo ? fechaContracargo! : fechaDescartada!
      novedad.motivoAnula = usarContracargo ? 'contracargo' : 'descartada'
      hayCambio = true
    }

    if (hayCambio) novedades.push(novedad)
  }

  return novedades
}
