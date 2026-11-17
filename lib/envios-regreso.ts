// Pestaña "Pendiente de regreso": clasificación del estado real de un envío
// outbound según el timeline de la API pública de Andreani. El caso que caza:
// dos visitas fallidas + no retirado en sucursal → Andreani lo devuelve por
// proceso, sin que exista rescate ni devolución pedida de nuestro lado.

import type { TimelineAndreani } from '@/lib/devoluciones'

// 'regresado' = auto-resuelto: el IMEI del envío fallido re-apareció en un envío
// posterior o volvió como disponible al inventario — el equipo ya está de vuelta
export type EstadoRegreso = 'entregado' | 'pendiente_regreso' | 'en_viaje' | 'sin_despacho' | 'regresado'

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Señales de que el envío está volviendo (o ya volvió) al remitente
const SENALES_REGRESO = ['no entregado', 'en devolucion', 'devuelto', 'rehusado', 'rechazado']

/**
 * Clasifica un outbound por su estado actual en Andreani. Prioridad:
 * entregado/retirado (terminal feliz) > señal de regreso > en viaje.
 * Sin estadoActual se mira el último evento del timeline.
 */
export function clasificarRegreso(t: Pick<TimelineAndreani, 'estadoActual' | 'eventos'>): EstadoRegreso {
  const actual = t.estadoActual ? norm(t.estadoActual) : null
  const ultimo = t.eventos.length > 0 ? norm(t.eventos[t.eventos.length - 1].estado) : null
  const estado = actual ?? ultimo

  if (estado === null) return 'en_viaje'
  // "Retirado" en un outbound con retiro en sucursal = el cliente lo tiene
  if (estado === 'entregado' || estado === 'retirado') return 'entregado'
  if (SENALES_REGRESO.some(s => estado.includes(s))) return 'pendiente_regreso'
  // Etiqueta creada que nunca entró a Andreani (visto en el barrido inicial:
  // outbound de 5+ días clavados ahí = órdenes muertas/canceladas). Terminal:
  // no es un regreso y no vale la pena re-consultarlo cada semana.
  if (estado === 'pendiente de ingreso') return 'sin_despacho'
  return 'en_viaje'
}

export interface ConsultaPrevia {
  tracking: string
  estado: EstadoRegreso
  consultadoAt: string
  recibidoAt: string | null
}

const SIETE_DIAS_MS = 7 * 24 * 3600 * 1000

/**
 * Qué trackings consultar en esta corrida, con presupuesto fijo: primero los
 * nunca consultados (más viejos primero: son los que más cerca están de volver),
 * después los "en viaje" cuya última consulta tiene 7+ días. Los terminales
 * (entregado / pendiente_regreso / recibido) no se consultan nunca más.
 */
export function elegirConsultas(
  candidatos: string[],
  previas: ConsultaPrevia[],
  max: number,
  ahora: Date,
): string[] {
  const porTracking = new Map(previas.map(p => [p.tracking, p]))
  const nuevos: string[] = []
  const recheck: { tracking: string; consultadoAt: string }[] = []
  for (const t of candidatos) {
    const prev = porTracking.get(t)
    if (!prev) {
      nuevos.push(t)
    } else if (
      prev.estado === 'en_viaje' &&
      prev.recibidoAt === null &&
      ahora.getTime() - new Date(prev.consultadoAt).getTime() >= SIETE_DIAS_MS
    ) {
      recheck.push({ tracking: t, consultadoAt: prev.consultadoAt })
    }
  }
  recheck.sort((a, b) => a.consultadoAt.localeCompare(b.consultadoAt))
  return [...nuevos, ...recheck.map(r => r.tracking)].slice(0, Math.max(0, max))
}
