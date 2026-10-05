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
  producto: string | null
  tracking: string | null
  otrasOrdenes: number
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
