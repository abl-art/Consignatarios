// Pestaña "Siniestros" de /compras/envios: envíos que Andreani declaró
// siniestrados/extraviados (evento Siniestro o descripción con
// "Siniestrado / Extravío" en shipments.traces) más los cargados a mano por
// número de envío. Son equipos perdidos por el correo: hay que reclamar la
// nota de crédito a Andreani y verificar el bloqueo Trustonic del equipo.
// CierreDeEntidad con esa descripción = Andreani cerró el caso.
//
// El seguimiento manual vive en Supabase (siniestros_seguimiento, clave =
// tracking): la carga a mano y el tilde de nota de crédito emitida.

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
  trustonicStatus: string | null
  gocuotasOrderId: string | null
  gocuotasStatus: string | null
  gocuotasDiscardedAt: string | null
  envioAt: string | null
  traces: TraceEvento[]
}

/** Fila de siniestros_seguimiento en Supabase */
export interface SeguimientoSiniestro {
  tracking: string
  notaCredito: boolean
  createdAt: string
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
  trustonicStatus: string | null
  gocuotasOrderId: string | null
  gocuotasStatus: string | null
  ordenActiva: boolean | null
  /** null cuando el siniestro se cargó a mano y Andreani aún no lo informó */
  siniestroAt: string | null
  cerradoAt: string | null
  /** true si Andreani había marcado EnvioEntregado antes de declararlo siniestrado */
  entregadoAntes: boolean
  /** Andreani lo declaró siniestrado en el tracking */
  informadoAndreani: boolean
  /** Tilde manual del usuario: la nota de crédito fue emitida */
  notaCredito: boolean
  /** Fecha de carga manual (fila de seguimiento), si existe */
  cargadoAt: string | null
  /** Fecha de creación del envío en GOcelular */
  envioAt: string | null
  /** Días desde el siniestro (o desde la carga manual si Andreani no lo informó) */
  dias: number
}

const DIA_MS = 24 * 60 * 60 * 1000
const RE_SINIESTRO = /siniestr|extrav/i

export function esEventoSiniestro(e: TraceEvento): boolean {
  return RE_SINIESTRO.test(e.evento) || RE_SINIESTRO.test(e.descripcion ?? '')
}

function armarSiniestro(r: SiniestroRaw, seg: SeguimientoSiniestro | undefined, ahora: Date): Siniestro {
  const eventos = [...(r.traces ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const siniestro = eventos.find(esEventoSiniestro)
  const cierre = siniestro
    ? eventos.find(e => e.evento === 'CierreDeEntidad' && e.fecha >= siniestro.fecha)
    : undefined
  const base = siniestro?.fecha ?? seg?.createdAt
  return {
    orderNumber: r.orderNumber,
    cliente: (r.clienteNombre ?? '').replace(/\s+/g, ' ').trim(),
    dni: r.clienteDni,
    telefono: r.clienteTelefono,
    producto: r.producto,
    destino: [r.ciudad, r.provincia].filter(Boolean).join(', '),
    tracking: r.tracking,
    imei: r.imei,
    trustonicStatus: r.trustonicStatus,
    gocuotasOrderId: r.gocuotasOrderId,
    gocuotasStatus: r.gocuotasStatus,
    ordenActiva: esOrdenActiva(r),
    siniestroAt: siniestro?.fecha ?? null,
    cerradoAt: cierre?.fecha ?? null,
    entregadoAntes: siniestro ? eventos.some(e => e.evento === 'EnvioEntregado' && e.fecha < siniestro.fecha) : false,
    informadoAndreani: siniestro !== undefined,
    notaCredito: seg?.notaCredito ?? false,
    cargadoAt: seg?.createdAt ?? null,
    envioAt: r.envioAt,
    dias: base ? Math.max(0, Math.floor((ahora.getTime() - new Date(base).getTime()) / DIA_MS)) : 0,
  }
}

function porTracking(seguimientos: SeguimientoSiniestro[]): Map<string, SeguimientoSiniestro> {
  return new Map(seguimientos.map(s => [s.tracking, s]))
}

/** Siniestros detectados en los traces de Andreani (informadoAndreani = true) */
export function armarSiniestros(
  rows: SiniestroRaw[],
  ahora: Date,
  seguimientos: SeguimientoSiniestro[] = [],
): Siniestro[] {
  const segs = porTracking(seguimientos)
  return ordenarSiniestros(
    rows
      .filter(r => (r.traces ?? []).some(esEventoSiniestro))
      .map(r => armarSiniestro(r, r.tracking ? segs.get(r.tracking) : undefined, ahora))
  )
}

/**
 * Siniestros cargados a mano cuyo envío Andreani todavía no declaró
 * siniestrado en el tracking. excluir = trackings ya listados como automáticos.
 */
export function armarSiniestrosManuales(
  rows: SiniestroRaw[],
  ahora: Date,
  seguimientos: SeguimientoSiniestro[],
  excluir: Set<string> = new Set(),
): Siniestro[] {
  const segs = porTracking(seguimientos)
  return ordenarSiniestros(
    rows
      .filter(r => r.tracking && !excluir.has(r.tracking))
      .map(r => armarSiniestro(r, segs.get(r.tracking!), ahora))
  )
}

/**
 * Más recientes primero, por la fecha real del caso: la del siniestro si
 * Andreani lo declaró, si no la del envío (las cargas masivas comparten la
 * misma fecha de carga y no sirven para ordenar). Desempata por tracking.
 */
export function ordenarSiniestros(siniestros: Siniestro[]): Siniestro[] {
  const ref = (s: Siniestro) => s.siniestroAt ?? s.envioAt ?? s.cargadoAt ?? ''
  return [...siniestros].sort((a, b) =>
    ref(b).localeCompare(ref(a)) || (b.tracking ?? '').localeCompare(a.tracking ?? ''))
}
