// Pestaña "Demoras de entrega" de /compras/envios: envíos outbound despachados
// cuya orden confirmada (paid_at de GOcelular) lleva más días sin el evento
// EnvioEntregado de Andreani que el umbral de su método de entrega.
// Quedan afuera los que ya se gestionan en otra pestaña: rescates (solicitud en
// traces o carga manual en rescates_seguimiento) y siniestros.

import { esOrdenActiva, type RescateRaw, type TraceEvento } from '@/lib/rescates'

export const UMBRAL_DOMICILIO_DIAS = 7
export const UMBRAL_SUCURSAL_DIAS = 14

export type MetodoEntrega = 'domicilio' | 'sucursal'

export interface DemoraRaw extends Omit<RescateRaw, 'traces'> {
  metodo: string | null
  confirmadaAt: string | null // store_orders.paid_at
  envioCreadoAt: string | null // shipments.created_at (fallback si no hay traces)
  trustonicStatus: string | null // devices.trustonic_status vía IMEI del envío
  trustonicUpdatedAt: string | null // frescura del dato: réplica, puede estar vieja
  traces: TraceEvento[]
}

export interface DemoraEntrega {
  orderNumber: string
  cliente: string
  dni: string | null
  telefono: string | null
  producto: string | null
  destino: string
  tracking: string | null
  gocuotasOrderId: string | null
  gocuotasStatus: string | null
  ordenActiva: boolean | null
  trustonicStatus: string | null
  trustonicUpdatedAt: string | null
  metodo: MetodoEntrega
  confirmadaAt: string
  /** Creación del tracking en Andreani (primer evento del trace) */
  trackingCreadoAt: string
  /** Días desde la creación del tracking sin entrega — la demora DE ENTREGA */
  diasDemora: number
  /** Días entre la confirmación de la orden y la creación del tracking — demora de picking */
  diasPicking: number
  ultimoEvento: string
  ultimoEventoAt: string | null
  diasSinMovimiento: number | null
}

const DIA_MS = 24 * 60 * 60 * 1000

// Andreani no siempre emite EnvioEntregado: hay entregas registradas solo en la
// descripción de una Visita ("Entregado", "Entregado por Mostrador"). Ojo con
// "No entregado", que es lo contrario.
function descripcionDiceEntregado(descripcion: string | undefined): boolean {
  if (!descripcion) return false
  return /entregado/i.test(descripcion) && !/no entregado/i.test(descripcion)
}

// Envíos en ciclo de rendición: el paquete está volviendo (o volvió) al
// depósito — ya no es una entrega demorada a gestionar.
const EVENTOS_RENDICION = new Set(['EnvioRendido', 'InicioCicloDeRendicion', 'EnvioEnInformeDeRendicion'])

export function envioResuelto(eventos: TraceEvento[]): boolean {
  return eventos.some(
    e =>
      e.evento === 'EnvioEntregado' ||
      e.evento === 'SolicitudDeRescate' ||
      EVENTOS_RENDICION.has(e.evento) ||
      descripcionDiceEntregado(e.descripcion)
  )
}

export function umbralDias(metodo: MetodoEntrega): number {
  return metodo === 'sucursal' ? UMBRAL_SUCURSAL_DIAS : UMBRAL_DOMICILIO_DIAS
}

function diasEntre(desde: string, hasta: Date): number {
  return Math.max(0, Math.floor((hasta.getTime() - new Date(desde).getTime()) / DIA_MS))
}

/**
 * Arma las demoras a partir de las filas crudas. `excluirTrackings` son los
 * trackings ya gestionados en Rescates (incluye los cargados a mano).
 */
export function armarDemoras(
  rows: DemoraRaw[],
  ahora: Date,
  excluirTrackings: Set<string> = new Set()
): DemoraEntrega[] {
  const demoras: DemoraEntrega[] = []
  for (const r of rows) {
    if (!r.confirmadaAt) continue
    if (r.metodo !== 'domicilio' && r.metodo !== 'sucursal') continue
    if (r.tracking && excluirTrackings.has(r.tracking)) continue
    // Orden anulada: si se descartó después del picking, el envío nunca va a
    // ingresar a distribución — no es una demora, es una orden muerta
    if (esOrdenActiva(r) === false) continue
    const eventos = [...(r.traces ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha))
    if (envioResuelto(eventos)) continue
    const metodo = r.metodo
    // La demora de entrega corre desde que EXISTE el tracking en Andreani
    // (primer evento del trace); lo anterior es demora de picking, no de envío
    const trackingCreadoAt = eventos[0]?.fecha ?? r.envioCreadoAt
    if (!trackingCreadoAt) continue
    const diasDemora = diasEntre(trackingCreadoAt, ahora)
    if (diasDemora <= umbralDias(metodo)) continue
    const diasPicking = Math.max(0, diasEntre(r.confirmadaAt, new Date(trackingCreadoAt)))
    const ultimo = eventos[eventos.length - 1]
    demoras.push({
      orderNumber: r.orderNumber,
      cliente: (r.clienteNombre ?? '').replace(/\s+/g, ' ').trim(),
      dni: r.clienteDni,
      telefono: r.clienteTelefono,
      producto: r.producto,
      destino: [r.ciudad, r.provincia].filter(Boolean).join(', '),
      tracking: r.tracking,
      gocuotasOrderId: r.gocuotasOrderId,
      gocuotasStatus: r.gocuotasStatus,
      ordenActiva: esOrdenActiva(r),
      trustonicStatus: r.trustonicStatus,
      trustonicUpdatedAt: r.trustonicUpdatedAt,
      metodo,
      confirmadaAt: r.confirmadaAt,
      trackingCreadoAt,
      diasDemora,
      diasPicking,
      ultimoEvento: ultimo ? [ultimo.evento, ultimo.descripcion].filter(Boolean).join(' — ') : 'Sin eventos de Andreani',
      ultimoEventoAt: ultimo?.fecha ?? null,
      diasSinMovimiento: ultimo ? diasEntre(ultimo.fecha, ahora) : null,
    })
  }
  return demoras.sort((a, b) => b.diasDemora - a.diasDemora)
}

export interface ResumenDemoras {
  total: number
  domicilio: number
  sucursal: number
  criticos: number // más de 21 días desde la confirmación
}

export function resumenDemoras(demoras: DemoraEntrega[]): ResumenDemoras {
  return {
    total: demoras.length,
    domicilio: demoras.filter(d => d.metodo === 'domicilio').length,
    sucursal: demoras.filter(d => d.metodo === 'sucursal').length,
    criticos: demoras.filter(d => d.diasDemora > 21).length,
  }
}
