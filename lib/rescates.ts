// Pestaña "Rescates" de /compras/envios: seguimiento de envíos outbound cuyo
// rescate se pidió a Andreani (el paquete no se entregó y se solicita que
// vuelva al depósito). Todo sale de shipments.traces:
//   SolicitudDeRescate                → se pidió el rescate
//   Rescate (ciclo Drop)              → Andreani lo rescató en sucursal
//   Consolidado/Expedición/Despachado → viaja de vuelta al depósito
//   EnvioRendido                      → rendido al remitente: equipo de vuelta
//   EnvioEntregado post-solicitud     → el rescate llegó tarde, se entregó igual

export interface TraceEvento {
  evento: string
  fecha: string
  ciclo?: string
  descripcion?: string
}

export interface RescateRaw {
  orderNumber: string
  clienteNombre: string | null
  clienteDni: string | null
  clienteTelefono: string | null
  producto: string | null
  ciudad: string | null
  provincia: string | null
  tracking: string | null
  traces: TraceEvento[]
}

export type EstadoRescate = 'solicitado' | 'rescatado' | 'en_viaje' | 'rendido' | 'entregado'

export interface Rescate {
  orderNumber: string
  cliente: string
  dni: string | null
  telefono: string | null
  producto: string | null
  destino: string
  tracking: string | null
  estado: EstadoRescate
  solicitadoAt: string
  ultimoEvento: string
  ultimoEventoAt: string
  /** Para estados terminales, días de solicitud a resolución; para activos, días corriendo */
  dias: number
}

export const ESTADOS_RESCATE: { estado: EstadoRescate; emoji: string; label: string; descripcion: string; terminal: boolean }[] = [
  { estado: 'solicitado', emoji: '🕐', label: 'Solicitados', descripcion: 'Rescate pedido, Andreani aún no lo ejecutó', terminal: false },
  { estado: 'rescatado', emoji: '⏸️', label: 'En sucursal', descripcion: 'Rescatado en sucursal, sin despacho de vuelta todavía', terminal: false },
  { estado: 'en_viaje', emoji: '🚚', label: 'En viaje de vuelta', descripcion: 'Rescatado y viajando de regreso al depósito', terminal: false },
  { estado: 'rendido', emoji: '✅', label: 'Rendidos', descripcion: 'Equipo de vuelta en el depósito', terminal: true },
  { estado: 'entregado', emoji: '❌', label: 'Entregados igual', descripcion: 'El rescate llegó tarde: Andreani lo entregó al cliente', terminal: true },
]

const META_POR_ESTADO = new Map(ESTADOS_RESCATE.map(e => [e.estado, e]))

export function metaEstado(estado: EstadoRescate) {
  return META_POR_ESTADO.get(estado)!
}

const DIA_MS = 24 * 60 * 60 * 1000
const EVENTOS_VIAJE = new Set(['EnvioConsolidado', 'ExpedicionHojaDeRutaCabecera', 'ExpedicionHojaDeRutaDeViaje', 'EnvioDespachado'])

function clasificar(eventos: TraceEvento[], solicitadoAt: string): EstadoRescate {
  const post = eventos.filter(e => e.fecha >= solicitadoAt)
  if (post.some(e => e.evento === 'EnvioEntregado')) return 'entregado'
  if (post.some(e => e.evento === 'EnvioRendido')) return 'rendido'
  const rescate = post.find(e => e.evento === 'Rescate')
  if (!rescate) return 'solicitado'
  if (post.some(e => e.fecha > rescate.fecha && EVENTOS_VIAJE.has(e.evento))) return 'en_viaje'
  return 'rescatado'
}

export function armarRescates(rows: RescateRaw[], ahora: Date): Rescate[] {
  const rescates: Rescate[] = []
  for (const r of rows) {
    const eventos = [...(r.traces ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const solicitud = eventos.find(e => e.evento === 'SolicitudDeRescate')
    if (!solicitud) continue
    const estado = clasificar(eventos, solicitud.fecha)
    const ultimo = eventos[eventos.length - 1]
    const hasta = metaEstado(estado).terminal ? new Date(ultimo.fecha) : ahora
    rescates.push({
      orderNumber: r.orderNumber,
      cliente: (r.clienteNombre ?? '').replace(/\s+/g, ' ').trim(),
      dni: r.clienteDni,
      telefono: r.clienteTelefono,
      producto: r.producto,
      destino: [r.ciudad, r.provincia].filter(Boolean).join(', '),
      tracking: r.tracking,
      estado,
      solicitadoAt: solicitud.fecha,
      ultimoEvento: [ultimo.evento, ultimo.descripcion].filter(Boolean).join(' — '),
      ultimoEventoAt: ultimo.fecha,
      dias: Math.max(0, Math.floor((hasta.getTime() - new Date(solicitud.fecha).getTime()) / DIA_MS)),
    })
  }
  const orden = new Map(ESTADOS_RESCATE.map((e, i) => [e.estado, i]))
  return rescates.sort((a, b) => (orden.get(a.estado)! - orden.get(b.estado)!) || b.dias - a.dias)
}

/**
 * Filtra por fecha de solicitud del rescate (día local de Andreani, -03:00).
 * desde/hasta en formato YYYY-MM-DD, inclusive; vacíos = sin límite.
 */
export function filtrarRescatesPorFecha(rescates: Rescate[], desde: string, hasta: string): Rescate[] {
  return rescates.filter(r => {
    const dia = r.solicitadoAt.slice(0, 10)
    if (desde && dia < desde) return false
    if (hasta && dia > hasta) return false
    return true
  })
}

export function contarPorEstado(rescates: Rescate[]): { estado: EstadoRescate; cantidad: number; pct: number }[] {
  const total = rescates.length
  return ESTADOS_RESCATE.map(({ estado }) => {
    const cantidad = rescates.filter(r => r.estado === estado).length
    return { estado, cantidad, pct: total > 0 ? Math.round((cantidad / total) * 100) : 0 }
  })
}
