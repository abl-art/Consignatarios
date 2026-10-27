// Lógica pura de la ingesta de arrepentimientos (mails del botón de n8n).
// El cron (app/api/cron/arrepentimientos) y las actions orquestan IO; acá
// viven el parser del asunto, las firmas del botón y la decisión de dedupe.
// Spec: docs/superpowers/specs/2026-10-05-arrepentimientos-design.md

export const REMITENTE_BOTON = 'gocelulares@gocuotas.com'
export const MARCA_BOTON = 'GOcelular Botón de Arrepentimiento'
export const MOTIVOS_DESCARTE_ARREPENTIMIENTO = [
  'Anulada antes del despacho',
  'Gestionado por otro canal',
  'Otro',
] as const
export type MotivoDescarteArrepentimiento = (typeof MOTIVOS_DESCARTE_ARREPENTIMIENTO)[number]

// Formato real de n8n: "Arrepentimiento —  Nombre Apellido (DNI 12345678)"
// (dobles espacios y espacios antes del paréntesis vistos en mails reales)
const RE_ASUNTO = /^Arrepentimiento\s*—\s*(.+?)\s*\(DNI\s*(\d{6,9})\)\s*$/

export function parsearAsuntoArrepentimiento(asunto: string | null): { nombre: string; dni: string } | null {
  const m = (asunto ?? '').trim().match(RE_ASUNTO)
  if (!m) return null
  return { nombre: m[1].replace(/\s+/g, ' ').trim(), dni: m[2] }
}

// Las TRES firmas a la vez: remitente exacto + asunto con formato estricto +
// marca del workflow de n8n en el cuerpo. Un mail escrito a mano falla todas.
export function esMailDelBoton(m: { from: string | null; asunto: string | null; texto: string | null }): boolean {
  if ((m.from ?? '').toLowerCase() !== REMITENTE_BOTON) return false
  if (!parsearAsuntoArrepentimiento(m.asunto)) return false
  // El texto plano del mail viene con wrap a ~72 columnas y puede cortar la
  // marca con un salto de línea — normalizar espacios antes de buscar
  return (m.texto ?? '').replace(/\s+/g, ' ').includes(MARCA_BOTON)
}

export interface OrdenDeDni {
  orderNumber: string | null
  gocuotasOrderId: string | null
  gocuotasStatus: string | null // order_status de GOcuotas (approved/discarded/…)
  deliveredAt: string | null // order_delivered_at = confirmación de la compra
  producto: string | null
  tracking: string | null
  otrasOrdenes: number
  whEstado: string | null // andreani_wh_pedidos.estado (queued/sent/expedido/…)
  pickeado: boolean // equipo ya asignado (shipment con IMEI o unidad assigned)
}

// Etiqueta operativa del pipeline de fulfillment (estados de la pestaña
// Warehouse Andreani, pedido de Emiliano 5/10): si ya fue ENVIADO a Andreani
// no alcanza con anular la orden — hay que pedir que no lo pickeen; si ya
// está PICKEADO, frenar la expedición es urgente.
export function etiquetaFulfillment(f: { whEstado: string | null; pickeado: boolean }): string | null {
  if (f.whEstado === 'expedido') return 'expedido'
  if (f.pickeado) return 'pickeado'
  if (f.whEstado === 'sent') return 'enviado a Andreani'
  if (f.whEstado === 'queued') return 'en cola'
  if (f.whEstado === 'cancelled') return 'cancelado'
  // cancel_requested = la cancelación fue PEDIDA pero Andreani aún no la
  // confirmó (contrato de Pedro 27/10: "cancelacion_pedida significa
  // pendiente de Andreani, no cancelado") — todavía NO se puede anular la orden
  if (f.whEstado === 'cancel_requested') return 'cancelación pedida'
  return f.whEstado
}

export const DIAS_VENTANA_ARREPENTIMIENTO = 10

export type VentanaArrepentimiento = 'vigente' | 'vencida' | 'no_aprobada'

// Regla de Emiliano (7/10): order_delivered_at de gocuotas_orders es la fecha
// de confirmación de la compra. Sin delivered_at la compra nunca se aprobó →
// no corresponde arrepentimiento. Pasados los 10 días corridos desde la
// confirmación (contados contra la fecha del mail, no contra el momento de
// procesarlo) → se gestiona por otro canal. En ambos casos el cron inserta
// la solicitud ya descartada: no aparece en pendientes pero queda la traza.
export function evaluarVentanaArrepentimiento(
  deliveredAt: string | null,
  fechaMail: string
): VentanaArrepentimiento {
  if (!deliveredAt) return 'no_aprobada'
  const limite = new Date(deliveredAt).getTime() + DIAS_VENTANA_ARREPENTIMIENTO * 24 * 60 * 60 * 1000
  return new Date(fechaMail).getTime() <= limite ? 'vigente' : 'vencida'
}

export type AccionMail =
  | { tipo: 'insistencia'; solicitudId: string }
  | { tipo: 'ya_solicitado' }
  | { tipo: 'nueva' }

// Dedupe por DNI + ORDEN (no por DNI solo): el mismo cliente puede comprar
// de nuevo más adelante y arrepentirse de la orden nueva — eso es una
// solicitud nueva. `existentes` = solicitudes previas del MISMO dni.
export function decidirAccionMail(args: {
  orden: OrdenDeDni | null
  existentes: { id: string; gocuotasOrderId: string | null }[]
  rescateYaSolicitado: boolean
}): AccionMail {
  const idOrden = args.orden?.gocuotasOrderId ?? null
  const previa = args.existentes.find(e => e.gocuotasOrderId === idOrden)
  if (previa) return { tipo: 'insistencia', solicitudId: previa.id }
  if (args.rescateYaSolicitado) return { tipo: 'ya_solicitado' }
  return { tipo: 'nueva' }
}

export interface EstadisticaDemoraArrepentimiento {
  casos: number
  medianaHoras: number | null
  menos24h: number
  de24a72h: number
  de72a240h: number
  mas240h: number
}

/**
 * Cuánto tardó el cliente en arrepentirse desde la confirmación de la orden
 * (order_delivered_at = confirmación de compra, no entrega física), solo para
 * solicitudes cuyo pedido ya estaba EXPEDIDO: son las que llegan tarde para
 * frenar el picking. confirmadaPor: order_number → fecha de confirmación ISO.
 */
export function estadisticaDemoraArrepentimiento(
  solicitudes: { emailFecha: string; orderNumber: string | null; fulfillment: string | null }[],
  confirmadaPor: Record<string, string>,
): EstadisticaDemoraArrepentimiento {
  const horas: number[] = []
  for (const s of solicitudes) {
    if (s.fulfillment !== 'expedido' || !s.orderNumber) continue
    const confirmada = confirmadaPor[s.orderNumber]
    if (!confirmada) continue
    const h = (new Date(s.emailFecha).getTime() - new Date(confirmada).getTime()) / 36e5
    if (!Number.isFinite(h)) continue
    horas.push(h)
  }
  horas.sort((a, b) => a - b)
  const mediana =
    horas.length === 0
      ? null
      : horas.length % 2 === 1
        ? horas[(horas.length - 1) / 2]
        : (horas[horas.length / 2 - 1] + horas[horas.length / 2]) / 2
  return {
    casos: horas.length,
    medianaHoras: mediana,
    menos24h: horas.filter((h) => h < 24).length,
    de24a72h: horas.filter((h) => h >= 24 && h < 72).length,
    de72a240h: horas.filter((h) => h >= 72 && h < 240).length,
    mas240h: horas.filter((h) => h >= 240).length,
  }
}

// ── Anulación de orden por API (v2, botones de Yamila) ──────────────────────

/** Estados de GOcuotas que cuentan como orden vigente (mismo criterio que el chip "activa"). */
const STATUS_ORDEN_ACTIVA = ['approved', 'paid', 'collected']

/**
 * Guard del botón "Anular orden": solo solicitudes pendientes, con orden de
 * GOcuotas identificada y vigente, y cuyo pedido NO salió del depósito (un
 * expedido se gestiona por rescate — reembolsar ahí dejaría el equipo en la
 * calle con la orden anulada).
 */
export function puedeAnularOrden(s: {
  estado: string
  gocuotasOrderId: string | null
  gocuotasStatus: string | null
  fulfillment: string | null
}): { ok: true } | { ok: false; error: string } {
  if (s.estado !== 'pendiente') return { ok: false, error: 'La solicitud ya fue resuelta' }
  if (!s.gocuotasOrderId) return { ok: false, error: 'Sin orden de GOcuotas identificada' }
  if (!s.gocuotasStatus || !STATUS_ORDEN_ACTIVA.includes(s.gocuotasStatus)) {
    return { ok: false, error: `La orden no está activa (estado: ${s.gocuotasStatus ?? 'desconocido'})` }
  }
  if (s.fulfillment === 'expedido') {
    return { ok: false, error: 'El pedido ya fue expedido: corresponde rescate, no reembolso' }
  }
  if (s.fulfillment === 'cancelación pedida') {
    return { ok: false, error: 'La cancelación del envío está pendiente de confirmación de Andreani — esperá el resultado antes de reembolsar' }
  }
  return { ok: true }
}
