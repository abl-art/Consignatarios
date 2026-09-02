// Pestaña "Siniestros" de /compras/envios: envíos que Andreani declaró
// siniestrados/extraviados (evento Siniestro o descripción con
// "Siniestrado / Extravío" en shipments.traces). Son equipos perdidos por el
// correo: hay que reclamar la indemnización y verificar el bloqueo del equipo.
// CierreDeEntidad con esa descripción = Andreani cerró el caso.

import { esOrdenActiva, type TraceEvento } from './rescates'

export interface SiniestroRaw {
  orderNumber: string
  clienteNombre: string | null
  clienteDni: string | null
  clienteTelefono: string | null
  producto: string | null
  ciudad: string | null
  provincia: string | null
  tracking: string | null
  imei: string | null
  gocuotasOrderId: string | null
  gocuotasStatus: string | null
  gocuotasDiscardedAt: string | null
  traces: TraceEvento[]
}

export interface Siniestro {
  orderNumber: string
  cliente: string
  dni: string | null
  telefono: string | null
  producto: string | null
  destino: string
  tracking: string | null
  imei: string | null
  gocuotasOrderId: string | null
  gocuotasStatus: string | null
  ordenActiva: boolean | null
  siniestroAt: string
  cerradoAt: string | null
  /** true si Andreani había marcado EnvioEntregado antes de declararlo siniestrado */
  entregadoAntes: boolean
  dias: number
}

const DIA_MS = 24 * 60 * 60 * 1000
const RE_SINIESTRO = /siniestr|extrav/i

export function esEventoSiniestro(e: TraceEvento): boolean {
  return RE_SINIESTRO.test(e.evento) || RE_SINIESTRO.test(e.descripcion ?? '')
}

export function armarSiniestros(rows: SiniestroRaw[], ahora: Date): Siniestro[] {
  const siniestros: Siniestro[] = []
  for (const r of rows) {
    const eventos = [...(r.traces ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const siniestro = eventos.find(esEventoSiniestro)
    if (!siniestro) continue
    const cierre = eventos.find(e => e.evento === 'CierreDeEntidad' && e.fecha >= siniestro.fecha)
    siniestros.push({
      orderNumber: r.orderNumber,
      cliente: (r.clienteNombre ?? '').replace(/\s+/g, ' ').trim(),
      dni: r.clienteDni,
      telefono: r.clienteTelefono,
      producto: r.producto,
      destino: [r.ciudad, r.provincia].filter(Boolean).join(', '),
      tracking: r.tracking,
      imei: r.imei,
      gocuotasOrderId: r.gocuotasOrderId,
      gocuotasStatus: r.gocuotasStatus,
      ordenActiva: esOrdenActiva(r),
      siniestroAt: siniestro.fecha,
      cerradoAt: cierre?.fecha ?? null,
      entregadoAntes: eventos.some(e => e.evento === 'EnvioEntregado' && e.fecha < siniestro.fecha),
      dias: Math.max(0, Math.floor((ahora.getTime() - new Date(siniestro.fecha).getTime()) / DIA_MS)),
    })
  }
  return siniestros.sort((a, b) => b.siniestroAt.localeCompare(a.siniestroAt))
}
