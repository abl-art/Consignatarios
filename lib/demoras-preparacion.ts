// Demoras de PREPARACIÓN: órdenes confirmadas (order_delivered_at) que
// después de 48 horas HÁBILES siguen sin número de seguimiento. Es una cola
// autolimpiante y sin acciones: cuando GOcelular genera el tracking, la orden
// desaparece sola. Las razones se detectan de los datos para saber a quién
// reclamar. Las horas hábiles cuentan solo lunes a viernes, en hora ART
// (pedido de Emiliano: que el lunes no amanezca inflado por el finde).

export const HORAS_DEMORA_PREPARACION = 48

const MS_HORA = 36e5
const MS_DIA = 24 * MS_HORA
const OFFSET_ART_MS = 3 * MS_HORA // ART = UTC-3, sin DST

/** Horas hábiles (lunes a viernes, ART) entre dos instantes ISO. */
export function horasHabilesEntre(desdeISO: string, hastaISO: string): number {
  const desde = new Date(desdeISO).getTime() - OFFSET_ART_MS
  const hasta = new Date(hastaISO).getTime() - OFFSET_ART_MS
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return 0

  let horas = 0
  // Recorre día calendario ART por día calendario y suma el solapamiento con [desde, hasta]
  let dia = Math.floor(desde / MS_DIA) * MS_DIA
  while (dia < hasta) {
    const diaSemana = new Date(dia).getUTCDay() // 0 dom … 6 sáb (ya corrido a ART)
    if (diaSemana !== 0 && diaSemana !== 6) {
      const inicio = Math.max(dia, desde)
      const fin = Math.min(dia + MS_DIA, hasta)
      if (fin > inicio) horas += (fin - inicio) / MS_HORA
    }
    dia += MS_DIA
  }
  return horas
}

export type RazonDemoraPreparacion = 'Rechazado por Andreani' | 'Sin stock' | 'GOcelular nunca envió' | 'SIN MOTIVO'

export interface OrdenPreparacion {
  orderNumber: string
  cliente: string
  dni: string
  producto: string
  confirmadaAt: string
  tracking: string | null
  whPedido: { estado: string | null; error: string | null } | null
  stockDisponible: number | null
  arrepPendiente: boolean
}

export type DemoraPreparacion<T extends OrdenPreparacion = OrdenPreparacion> = T & {
  horasHabiles: number
  razon: RazonDemoraPreparacion
}

function razonDe(o: OrdenPreparacion): RazonDemoraPreparacion {
  if (o.whPedido && (o.whPedido.estado === 'requires_attention' || o.whPedido.error)) {
    return 'Rechazado por Andreani'
  }
  if (o.stockDisponible === 0) return 'Sin stock'
  if (!o.whPedido) return 'GOcelular nunca envió'
  return 'SIN MOTIVO'
}

/**
 * Filtra y ordena las demoras de preparación. Afuera: con tracking (ya salió),
 * menos de 48h hábiles, arrepentimiento pendiente (retenida a propósito) y
 * pedido warehouse cancelado (ya gestionado). Orden: mayor demora primero.
 */
export function armarDemorasPreparacion<T extends OrdenPreparacion>(ordenes: T[], ahoraISO: string): DemoraPreparacion<T>[] {
  const filas: DemoraPreparacion<T>[] = []
  for (const o of ordenes) {
    if (o.tracking) continue
    if (o.arrepPendiente) continue
    // cancelled y cancel_requested ya están gestionados (anulación en curso).
    // expedido = la preparación TERMINÓ alguna vez: si hoy no tiene tracking es
    // porque el envío se canceló después (rescate/arrepentimiento), no una demora
    // de preparación (caso real: orden 20466792, rescate por arrepentimiento)
    if (o.whPedido?.estado === 'cancelled' || o.whPedido?.estado === 'cancel_requested' || o.whPedido?.estado === 'expedido') continue
    const horasHabiles = horasHabilesEntre(o.confirmadaAt, ahoraISO)
    if (horasHabiles < HORAS_DEMORA_PREPARACION) continue
    filas.push({ ...o, horasHabiles, razon: razonDe(o) })
  }
  return filas.sort((a, b) => b.horasHabiles - a.horasHabiles)
}
