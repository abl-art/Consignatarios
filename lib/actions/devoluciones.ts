'use server'

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  payloadAndreani,
  parseTimelineAndreani,
  duracionesPorEstado,
  duracionTotalHoras,
  banderasDevolucion,
  type TramoEstado,
} from '@/lib/devoluciones'
import { getCancelacionEstado } from '@/lib/gocelular-webhook'
import { banderaDiscrepancia } from '@/lib/estados-andreani'

// Clave e IV públicos del front de seguimiento de Andreani (expuestos en
// www.andreani.com/__ENV.js: NEXT_PUBLIC_API_KEY / NEXT_PUBLIC_API_KEY_IV).
// No son secretos nuestros — los usa el navegador de cualquiera que mire un
// envío. Override por env por si Andreani los rota.
const ANDREANI_KEY = process.env.ANDREANI_TRACKING_KEY || '12345678901234567890123456789012'
const ANDREANI_IV = process.env.ANDREANI_TRACKING_IV || '1234567890123456'
const ANDREANI_URL = 'https://tracking-api.andreani.com/api/v3/Tracking'

// Estados terminales del circuito de devolución (equipo de vuelta en origen).
const ESTADOS_TERMINALES = ['Devuelto', 'Entregado']

export interface SeguimientoAndreani {
  tracking: string | null
  estadoActual: string | null
  tramos: TramoEstado[]
  totalHoras: number
  consultado: boolean // false si Andreani no respondió
}

export interface FilaDevolucion {
  orderNumber: string
  gocuotasOrderId: string | null
  cliente: string
  dni: string | null
  producto: string
  imei: string | null
  ciudad: string | null
  provincia: string | null
  returnCreadoAt: string
  ordenAnulada: boolean
  inventarioStatus: string | null
  trustonicObservado: string | null
  entrega: SeguimientoAndreani
  devolucion: SeguimientoAndreani
  banderas: string[]
  /** Tilde manual: el equipo entró físicamente al depósito de GOcuotas */
  recibidoWhGo: boolean
  /** Cierre manual del caso (botón Resolver). null = pendiente de gestión. */
  resueltoAt: string | null
  /** Estado crudo reportado por Pedro (webhook de GOcelular) para esta orden, o null si no se pudo consultar */
  pedroEstado: string | null
  /** Mensaje de discrepancia entre Andreani y Pedro, o null si no aplica */
  banderaPedro: string | null
}

interface ReturnRaw {
  ret_tracking: string
  ret_creado: string
  order_number: string
  gocuotas_order_id: string | null
  cliente: string
  dni: string | null
  producto: string
  ciudad: string | null
  provincia: string | null
  go_status: string | null
  out_tracking: string | null
  out_imei: string | null
  inv_status: string | null
  tru_obs: string | null
}

async function consultarAndreani(tracking: string | null, ahora: Date): Promise<SeguimientoAndreani> {
  if (!tracking) {
    return { tracking: null, estadoActual: null, tramos: [], totalHoras: 0, consultado: false }
  }
  try {
    const payload = encodeURIComponent(payloadAndreani(tracking, ANDREANI_KEY, ANDREANI_IV))
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(`${ANDREANI_URL}?payload=${payload}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Origin: 'https://www.andreani.com', Referer: 'https://www.andreani.com/' },
      signal: ctrl.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(t))
    if (res.status !== 200) {
      return { tracking, estadoActual: null, tramos: [], totalHoras: 0, consultado: false }
    }
    const timeline = parseTimelineAndreani(await res.json())
    const tramos = duracionesPorEstado(timeline.eventos, ahora, ESTADOS_TERMINALES)
    return {
      tracking,
      estadoActual: timeline.estadoActual,
      tramos,
      totalHoras: duracionTotalHoras(timeline.eventos, ahora, ESTADOS_TERMINALES),
      consultado: true,
    }
  } catch {
    return { tracking, estadoActual: null, tramos: [], totalHoras: 0, consultado: false }
  }
}

// Segunda fuente (control): estado crudo que reportó Pedro para esta orden,
// vía el webhook de cancelaciones/estado de GOcelular. No bloquea la fila —
// si la consulta falla o no hay dato, queda null (igual que Andreani).
async function consultarPedro(orderNumber: string): Promise<string | null> {
  try {
    const { body } = await getCancelacionEstado({ order_number: orderNumber })
    return body?.estado ?? null
  } catch {
    return null
  }
}

interface SeguimientoDevolucion {
  recibidoWhGo: boolean
  resueltoAt: string | null
}

// Tildes manuales de devoluciones_seguimiento en Supabase, por tracking del
// retorno: "Recibido WH GO" y el cierre manual (resuelto_at). Si la query
// falla, nadie aparece tildado ni resuelto (no bloquea la pestaña).
async function getSeguimientoDevoluciones(): Promise<Map<string, SeguimientoDevolucion>> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('devoluciones_seguimiento')
      .select('tracking, recibido_wh, resuelto_at')
    const map = new Map<string, SeguimientoDevolucion>()
    for (const r of data ?? []) {
      map.set(r.tracking, { recibidoWhGo: !!r.recibido_wh, resueltoAt: r.resuelto_at ?? null })
    }
    return map
  } catch {
    return new Map()
  }
}

/**
 * Marca/desmarca que el equipo de una devolución se recibió físicamente en el
 * depósito de GOcuotas. Clave = tracking del envío de retorno.
 */
export async function setRecibidoWhGo(tracking: string, recibido: boolean): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('devoluciones_seguimiento')
    .upsert(
      { tracking, recibido_wh: recibido, recibido_wh_at: recibido ? new Date().toISOString() : null },
      { onConflict: 'tracking' }
    )
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}

/**
 * Marca (o desmarca) una devolución como resuelta, por tracking del retorno.
 * Ninguna devolución se archiva sola por su estado de Andreani — Yami la
 * cierra a mano con el botón Resolver. El upsert crea la fila de seguimiento
 * si todavía no existía.
 */
export async function setDevolucionResuelta(tracking: string, resuelto: boolean): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('devoluciones_seguimiento')
    .upsert(
      { tracking, resuelto_at: resuelto ? new Date().toISOString() : null },
      { onConflict: 'tracking' }
    )
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}

// Lista de devoluciones (shipments type='return') con el contexto de la orden y el
// equipo, más los dos seguimientos de Andreani (entrega + devolución) consultados
// en vivo. Lo único persistido nuestro es el tilde Recibido WH GO: el estado real
// del envío sale siempre de la API del momento.
export async function getDevoluciones(): Promise<FilaDevolucion[]> {
  const pool = getPool()
  if (!pool) return []

  const { rows } = await pool.query<ReturnRaw>(
    `SELECT s.tracking_number AS ret_tracking, s.created_at AS ret_creado,
            so.order_number, so.gocuotas_order_id,
            COALESCE(NULLIF(TRIM(so.customer_name), ''), '—') AS cliente,
            so.customer_dni AS dni, so.product_name AS producto,
            so.shipping_city AS ciudad, so.shipping_province AS provincia,
            go.order_status AS go_status,
            ob.tracking_number AS out_tracking, ob.imei AS out_imei,
            ii.status AS inv_status, d.trustonic_observed_state AS tru_obs
     FROM shipments s
     LEFT JOIN store_orders so ON so.id = s.store_order_id
     LEFT JOIN gocuotas_orders go ON go.order_id::text = so.gocuotas_order_id::text
     LEFT JOIN LATERAL (
       SELECT tracking_number, imei FROM shipments o
       WHERE o.store_order_id = s.store_order_id AND o.type = 'outbound'
       ORDER BY o.created_at DESC LIMIT 1
     ) ob ON true
     LEFT JOIN inventory_items ii ON ii.imei = ob.imei
     LEFT JOIN devices d ON d.imei = ob.imei
     WHERE s.type = 'return'
     ORDER BY s.created_at DESC`,
  )

  const ahora = new Date()
  const seguimientos = await getSeguimientoDevoluciones()
  return Promise.all(
    rows.map(async (r): Promise<FilaDevolucion> => {
      const [entrega, devolucion, pedroEstado] = await Promise.all([
        consultarAndreani(r.out_tracking, ahora),
        consultarAndreani(r.ret_tracking, ahora),
        consultarPedro(r.order_number),
      ])
      const ordenAnulada = r.go_status === 'discarded'
      const seguimiento = seguimientos.get(r.ret_tracking)
      return {
        orderNumber: r.order_number,
        gocuotasOrderId: r.gocuotas_order_id,
        cliente: r.cliente,
        dni: r.dni,
        producto: r.producto,
        imei: r.out_imei,
        ciudad: r.ciudad,
        provincia: r.provincia,
        returnCreadoAt: r.ret_creado,
        ordenAnulada,
        inventarioStatus: r.inv_status,
        trustonicObservado: r.tru_obs,
        entrega,
        devolucion,
        recibidoWhGo: seguimiento?.recibidoWhGo ?? false,
        resueltoAt: seguimiento?.resueltoAt ?? null,
        pedroEstado,
        banderaPedro: banderaDiscrepancia(devolucion.estadoActual, pedroEstado),
        banderas: banderasDevolucion({
          entregaEstado: entrega.estadoActual,
          inventarioStatus: r.inv_status,
          trustonicObservado: r.tru_obs,
          ordenAnulada,
          devolucionEventos: devolucion.tramos.length,
        }),
      }
    }),
  )
}
