// Buscador transversal de /compras/envios: con un DNI, tracking de Andreani,
// número de orden o IMEI encuentra la fila en Alertas, Demoras,
// Arrepentimientos, Rescates, Siniestros Distribución y Siniestros Warehouse.
// Lógica pura: el page arma las fuentes con los datos ya fetcheados y el
// componente cliente ejecuta las acciones con las server actions existentes.

import { metaEstado, type EstadoRescate } from '@/lib/rescates'

// Campos mínimos que necesita la búsqueda de cada pestaña (subset estructural
// de los tipos reales — las tablas pasan sus objetos completos sin adaptar)
export interface AlertaBusqueda {
  orderNumber: string
  cliente: string
  dni: string | null
  tracking: string | null
  producto: string | null
  razon: string | null
  diasPendiente: number
}
export interface DemoraBusqueda {
  orderNumber: string
  cliente: string
  dni: string | null
  tracking: string | null
  producto: string | null
  metodo: 'domicilio' | 'sucursal'
  diasDemora: number
}
export interface ArrepentimientoBusqueda {
  id: string
  nombre: string
  dni: string
  orderNumber: string | null
  tracking: string | null
  producto: string | null
  estado: 'pendiente' | 'confirmada' | 'descartada'
  fulfillment: string | null
}
export interface RescateBusqueda {
  orderNumber: string
  cliente: string
  dni: string | null
  tracking: string | null
  producto: string | null
  estado: EstadoRescate
  motivo: string | null
}
export interface SiniestroBusqueda {
  orderNumber: string
  cliente: string
  dni: string | null
  tracking: string | null
  producto: string | null
  notaCredito: boolean
  dias: number
}
export interface SiniestroWhBusqueda {
  id: string
  producto: string
  imei: string | null
  tipo: string
  estado: 'abierto' | 'resuelto'
  notaCredito: boolean
}

export interface FuentesBusqueda {
  alertas: AlertaBusqueda[]
  demoras: DemoraBusqueda[]
  arrepentimientos: ArrepentimientoBusqueda[]
  rescates: RescateBusqueda[]
  siniestros: SiniestroBusqueda[]
  siniestrosWh: SiniestroWhBusqueda[]
}

export type TabBusqueda =
  | 'alertas'
  | 'demoras'
  | 'arrepentimientos'
  | 'rescates'
  | 'siniestros'
  | 'siniestros-warehouse'

export const LABEL_TAB: Record<TabBusqueda, string> = {
  alertas: 'Alertas',
  demoras: 'Demoras de entrega',
  arrepentimientos: 'Arrepentimientos',
  rescates: 'Rescates',
  siniestros: 'Siniestros Distribución',
  'siniestros-warehouse': 'Siniestros Warehouse',
}

export type AccionBusqueda =
  | { tipo: 'arrepentimiento'; id: string; tracking: string | null }
  | { tipo: 'demora'; tracking: string }
  | { tipo: 'siniestro-nc'; tracking: string; notaCredito: boolean }
  | { tipo: 'siniestro-wh'; id: string }

export interface ResultadoBusqueda {
  tab: TabBusqueda
  titulo: string
  orden: string | null
  dni: string | null
  tracking: string | null
  producto: string | null
  estado: string
  accion: AccionBusqueda | null
}

const MIN_QUERY = 4

function normalizar(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[.\s-]/g, '')
}

function coincide(q: string, ...campos: (string | null | undefined)[]): boolean {
  return campos.some(c => {
    const n = normalizar(c)
    return n.length > 0 && n.includes(q)
  })
}

export function buscarEnvios(query: string, fuentes: FuentesBusqueda): ResultadoBusqueda[] {
  const q = normalizar(query)
  if (q.length < MIN_QUERY) return []

  const resultados: ResultadoBusqueda[] = []

  for (const a of fuentes.alertas) {
    if (!coincide(q, a.dni, a.tracking, a.orderNumber)) continue
    resultados.push({
      tab: 'alertas',
      titulo: a.cliente,
      orden: a.orderNumber,
      dni: a.dni,
      tracking: a.tracking,
      producto: a.producto,
      estado: `${a.razon ?? 'requiere atención'} · ${a.diasPendiente}d`,
      accion: null,
    })
  }

  for (const d of fuentes.demoras) {
    if (!coincide(q, d.dni, d.tracking, d.orderNumber)) continue
    resultados.push({
      tab: 'demoras',
      titulo: d.cliente,
      orden: d.orderNumber,
      dni: d.dni,
      tracking: d.tracking,
      producto: d.producto,
      estado: `${d.diasDemora}d sin entrega (${d.metodo})`,
      accion: d.tracking ? { tipo: 'demora', tracking: d.tracking } : null,
    })
  }

  for (const s of fuentes.arrepentimientos) {
    if (!coincide(q, s.dni, s.tracking, s.orderNumber)) continue
    const estado = s.estado === 'pendiente' && s.fulfillment ? `pendiente · ${s.fulfillment}` : s.estado
    resultados.push({
      tab: 'arrepentimientos',
      titulo: s.nombre,
      orden: s.orderNumber,
      dni: s.dni,
      tracking: s.tracking,
      producto: s.producto,
      estado,
      accion: s.estado === 'pendiente' ? { tipo: 'arrepentimiento', id: s.id, tracking: s.tracking } : null,
    })
  }

  for (const r of fuentes.rescates) {
    if (!coincide(q, r.dni, r.tracking, r.orderNumber)) continue
    const meta = metaEstado(r.estado)
    resultados.push({
      tab: 'rescates',
      titulo: r.cliente,
      orden: r.orderNumber,
      dni: r.dni,
      tracking: r.tracking,
      producto: r.producto,
      estado: `${meta.emoji} ${meta.label}${r.motivo ? ` · ${r.motivo}` : ''}`,
      accion: null,
    })
  }

  for (const s of fuentes.siniestros) {
    if (!coincide(q, s.dni, s.tracking, s.orderNumber)) continue
    resultados.push({
      tab: 'siniestros',
      titulo: s.cliente,
      orden: s.orderNumber,
      dni: s.dni,
      tracking: s.tracking,
      producto: s.producto,
      estado: `siniestro hace ${s.dias}d · NC ${s.notaCredito ? 'emitida' : 'pendiente'}`,
      accion: s.tracking ? { tipo: 'siniestro-nc', tracking: s.tracking, notaCredito: s.notaCredito } : null,
    })
  }

  for (const w of fuentes.siniestrosWh) {
    if (!coincide(q, w.imei)) continue
    resultados.push({
      tab: 'siniestros-warehouse',
      titulo: w.producto,
      orden: null,
      dni: null,
      tracking: null,
      producto: w.producto,
      estado: `${w.tipo} · ${w.estado}${w.notaCredito ? ' · NC emitida' : ''}`,
      accion: w.estado === 'abierto' ? { tipo: 'siniestro-wh', id: w.id } : null,
    })
  }

  return resultados
}
