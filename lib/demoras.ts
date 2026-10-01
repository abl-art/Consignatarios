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
  metodo: MetodoEntrega
  confirmadaAt: string
  diasDemora: number
  ultimoEvento: string
  ultimoEventoAt: string | null
  diasSinMovimiento: number | null
}

const DIA_MS = 24 * 60 * 60 * 1000

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
    const eventos = [...(r.traces ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha))
    if (eventos.some(e => e.evento === 'EnvioEntregado' || e.evento === 'SolicitudDeRescate')) continue
    const metodo = r.metodo
    const diasDemora = diasEntre(r.confirmadaAt, ahora)
    if (diasDemora <= umbralDias(metodo)) continue
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
      metodo,
      confirmadaAt: r.confirmadaAt,
      diasDemora,
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
