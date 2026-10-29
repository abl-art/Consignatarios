import crypto from 'crypto'
import type { FilaDevolucion } from '@/lib/actions/devoluciones'

// Seguimiento de envíos Andreani (entrega y devolución) por consulta en vivo a la
// API pública de tracking. El número viaja cifrado en un parámetro `payload`
// (AES-256-CBC con clave e IV públicos del front de Andreani). Replicamos ese
// cifrado server-side para consultar nuestros propios envíos sin navegador.

// El plaintext es un JSON fijo; solo cambia el número.
export function payloadAndreani(numero: string, key: string, iv: string): string {
  const plaintext = JSON.stringify({
    idReceptor: 1,
    idSistema: 1,
    userData: '{"mail":""}',
    numeroAndreani: String(numero),
  })
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'))
  return Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64')
}

// Un evento del seguimiento, ya aplanado y normalizado.
export interface EventoAndreani {
  estado: string
  orden: number
  fecha: string
  texto: string
  sucursal: string | null
}

export interface TimelineAndreani {
  numero: string | null
  estadoActual: string | null
  fechaUltimoEvento: string | null
  eventos: EventoAndreani[]
}

function limpiarHtml(s: unknown): string {
  if (typeof s !== 'string') return ''
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([:.,;])/g, '$1') // quitar espacio antes de puntuación (dejado por los tags)
    .trim()
}

// Shape crudo (parcial) de la respuesta de api/v3/Tracking.
interface AndreaniTraduccionRaw {
  fechaEvento?: unknown
  traduccion?: unknown
  sucursal?: { nombre?: unknown } | null
}
interface AndreaniTimelineRaw {
  titulo?: unknown
  orden?: unknown
  traducciones?: AndreaniTraduccionRaw[]
}
interface AndreaniTrackingRaw {
  numeroAndreani?: unknown
  procesoActual?: { titulo?: unknown; fechaUltimoEvento?: unknown } | null
  timelines?: AndreaniTimelineRaw[]
}

// Normaliza la respuesta cruda de api/v3/Tracking. Aplana las traducciones de cada
// estado en una lista de eventos ordenada por fecha, limpiando el HTML de los textos.
export function parseTimelineAndreani(raw: unknown): TimelineAndreani {
  const vacio: TimelineAndreani = { numero: null, estadoActual: null, fechaUltimoEvento: null, eventos: [] }
  if (!raw || typeof raw !== 'object') return vacio
  const j = raw as AndreaniTrackingRaw

  const eventos: EventoAndreani[] = []
  for (const tl of Array.isArray(j.timelines) ? j.timelines : []) {
    const estado = typeof tl?.titulo === 'string' ? tl.titulo : ''
    const orden = typeof tl?.orden === 'number' ? tl.orden : 0
    for (const tr of Array.isArray(tl?.traducciones) ? tl.traducciones : []) {
      if (!tr?.fechaEvento) continue
      eventos.push({
        estado,
        orden,
        fecha: String(tr.fechaEvento),
        texto: limpiarHtml(tr.traduccion),
        sucursal: typeof tr.sucursal?.nombre === 'string' ? tr.sucursal.nombre : null,
      })
    }
  }
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha))

  const titulo = j.procesoActual?.titulo
  const fechaUlt = j.procesoActual?.fechaUltimoEvento
  return {
    numero: j.numeroAndreani != null ? String(j.numeroAndreani) : null,
    estadoActual: typeof titulo === 'string' ? titulo : null,
    fechaUltimoEvento: typeof fechaUlt === 'string' ? fechaUlt : null,
    eventos,
  }
}

// Andreani manda las fechas en hora de Argentina (UTC-3) sin marcador de zona.
// Les añadimos el offset para obtener el instante absoluto correcto.
function aMs(fecha: string): number {
  const tieneTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(fecha)
  return new Date(tieneTz ? fecha : `${fecha}-03:00`).getTime()
}

// Cuánto tiempo estuvo el envío en cada estado. Un tramo va desde que entra a un
// estado hasta que entra al siguiente; el último queda "en curso" hasta ahora.
export interface TramoEstado {
  estado: string
  desde: string
  hasta: string | null
  horas: number
  enCurso: boolean
}

export function duracionesPorEstado(
  eventos: EventoAndreani[],
  ahora: Date,
  terminales: string[] = [],
): TramoEstado[] {
  if (eventos.length === 0) return []

  // Colapsar sub-eventos consecutivos del mismo estado en un único hito.
  const hitos: { estado: string; desde: string }[] = []
  for (const e of eventos) {
    const prev = hitos[hitos.length - 1]
    if (!prev || prev.estado !== e.estado) hitos.push({ estado: e.estado, desde: e.fecha })
  }

  return hitos.map((h, i) => {
    const sig = hitos[i + 1]
    // El último estado sigue "en curso" solo si no es terminal: un estado terminal
    // (Entregado/Devuelto) es el punto final del circuito, no un intervalo abierto.
    const enCurso = !sig && !terminales.includes(h.estado)
    if (!sig && !enCurso) {
      return { estado: h.estado, desde: h.desde, hasta: h.desde, horas: 0, enCurso: false }
    }
    const finMs = sig ? aMs(sig.desde) : ahora.getTime()
    const horas = Math.max(0, (finMs - aMs(h.desde)) / 3_600_000)
    return { estado: h.estado, desde: h.desde, hasta: sig ? sig.desde : null, horas, enCurso }
  })
}

// Duración punta a punta del circuito. Si el último estado es terminal, mide del
// primer evento al último; si sigue en curso, mide hasta ahora.
export function duracionTotalHoras(eventos: EventoAndreani[], ahora: Date, terminales: string[]): number {
  if (eventos.length === 0) return 0
  const primero = aMs(eventos[0].fecha)
  const ultimo = eventos[eventos.length - 1]
  const finalizado = terminales.includes(ultimo.estado)
  const fin = finalizado ? aMs(ultimo.fecha) : ahora.getTime()
  return Math.max(0, (fin - primero) / 3_600_000)
}

export function formatearDuracion(horas: number): string {
  if (horas < 1) return `${Math.round(horas * 60)} min`
  if (horas < 24) return `${Math.floor(horas)} h`
  const dias = Math.floor(horas / 24)
  const h = Math.floor(horas % 24)
  return h > 0 ? `${dias} d ${h} h` : `${dias} d`
}

// Señales de inconsistencia entre el estado de la devolución y el del equipo/orden.
export interface DatosBanderas {
  entregaEstado: string | null
  inventarioStatus: string | null
  trustonicObservado: string | null
  ordenAnulada: boolean
  devolucionEventos: number
}

// Estado terminal del circuito de devolución: el equipo llegó de vuelta al origen.
export const ESTADOS_DEVOLUCION_FINAL = ['Devuelto']

// Una devolución está "finalizada" (caso cerrado, se puede ocultar) solo si el
// equipo ya volvió Y no arrastra ninguna alerta. Cualquier cosa en viaje, trabada,
// sin movimiento o con banderas sigue siendo gestión pendiente y queda visible.
export function esDevolucionFinalizada(estadoDevolucion: string | null, banderas: string[]): boolean {
  if (banderas.length > 0) return false
  return estadoDevolucion !== null && ESTADOS_DEVOLUCION_FINAL.includes(estadoDevolucion)
}

// Separa las filas de la pestaña Devoluciones en pendientes/resueltas según el
// tilde manual resueltoAt — NUNCA según el estado de Andreani. Una devolución
// puede estar "Devuelto" en Andreani y seguir pendiente si nadie la cerró a
// mano (nada se archiva solo); reemplaza el split que antes hacía
// esDevolucionFinalizada.
export function separarResueltos(
  filas: FilaDevolucion[],
): { pendientes: FilaDevolucion[]; resueltas: FilaDevolucion[] } {
  const pendientes: FilaDevolucion[] = []
  const resueltas: FilaDevolucion[] = []
  for (const fila of filas) {
    if (fila.resueltoAt != null) resueltas.push(fila)
    else pendientes.push(fila)
  }
  return { pendientes, resueltas }
}

export function banderasDevolucion(d: DatosBanderas): string[] {
  const banderas: string[] = []
  if (d.entregaEstado === 'Entregado' && d.inventarioStatus === 'available') {
    banderas.push('stock_sin_retorno')
  }
  if (d.ordenAnulada && d.trustonicObservado === 'active') {
    banderas.push('trustonic_activo_anulada')
  }
  if (d.devolucionEventos === 0) {
    banderas.push('devolucion_sin_movimiento')
  }
  return banderas
}

export interface DevolucionPedidaRef {
  orderNumber: string
  tracking: string | null
}

/**
 * Devoluciones pedidas por el webhook (devoluciones_pedidas) que todavía no
 * tienen su shipment type='return' en la réplica → se muestran como fila
 * sintética "devolución pedida" hasta que el envío inverso aparece. Cubierta =
 * ya existe un return para esa orden o para ese tracking.
 */
export function devolucionesPedidasSinShipment<T extends DevolucionPedidaRef>(
  pedidas: T[],
  returns: { orderNumber: string; tracking: string | null }[],
): T[] {
  const ordenes = new Set(returns.map(r => r.orderNumber))
  const trackings = new Set(returns.map(r => r.tracking).filter((t): t is string => t !== null))
  return pedidas.filter(p => !ordenes.has(p.orderNumber) && !(p.tracking !== null && trackings.has(p.tracking)))
}
