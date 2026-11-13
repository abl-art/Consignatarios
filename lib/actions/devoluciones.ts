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
  devolucionesPedidasSinShipment,
  sucursalDespacho,
  rendicionFallida,
  type TramoEstado,
  type RendicionFallida,
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

// Estados terminales de los circuitos: 'Entregado' cierra el outbound y
// 'Retirado'/'Devuelto' la devolución — "Retirado" es la RENDICIÓN en nuestra
// oficina (el equipo ya está en nuestro poder), no un retiro al cliente.
const ESTADOS_TERMINALES = ['Devuelto', 'Entregado', 'Retirado']

export interface SeguimientoAndreani {
  tracking: string | null
  estadoActual: string | null
  tramos: TramoEstado[]
  totalHoras: number
  consultado: boolean // false si Andreani no respondió
  /** Sucursal donde el cliente despachó el paquete (evento Ingresado) — solo tiene sentido en devoluciones */
  sucursalDespacho: string | null
  /** Intento de rendición en nuestra oficina fallido y sin resolver, con su motivo */
  rendicionFallida: RendicionFallida | null
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
  /** order_status crudo de GOcuotas (réplica) — input del guard de Anular orden */
  gocuotasStatus: string | null
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
  /** Devolución pedida por el webhook del 360 (devoluciones_pedidas); null si la fila nació de un shipment return */
  pedidaWebhook: { modalidad: string; estado: string | null } | null
  /** true = el tracking vigente salió de devoluciones_retracking (carga MANUAL
   * en andreani.com porque la generación por el circuito falló) — el de la
   * réplica está muerto y no se usa */
  trackingManual: boolean
  /** true = fila cargada a mano con el botón "Cargar devolución" (devolución
   * generada por fuera de GOcelular, p. ej. del lado GOcuotas) */
  origenManual: boolean
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

const SIN_SEGUIMIENTO: Omit<SeguimientoAndreani, 'tracking'> = {
  estadoActual: null,
  tramos: [],
  totalHoras: 0,
  consultado: false,
  sucursalDespacho: null,
  rendicionFallida: null,
}

async function consultarAndreani(tracking: string | null, ahora: Date): Promise<SeguimientoAndreani> {
  if (!tracking) {
    return { tracking: null, ...SIN_SEGUIMIENTO }
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
      return { tracking, ...SIN_SEGUIMIENTO }
    }
    const timeline = parseTimelineAndreani(await res.json())
    const tramos = duracionesPorEstado(timeline.eventos, ahora, ESTADOS_TERMINALES)
    return {
      tracking,
      estadoActual: timeline.estadoActual,
      tramos,
      totalHoras: duracionTotalHoras(timeline.eventos, ahora, ESTADOS_TERMINALES),
      consultado: true,
      sucursalDespacho: sucursalDespacho(timeline.eventos),
      rendicionFallida: rendicionFallida(timeline.eventos),
    }
  } catch {
    return { tracking, ...SIN_SEGUIMIENTO }
  }
}

// Segunda fuente (control): estado de la DEVOLUCIÓN que reportó Pedro para
// esta orden — el bloque devolucion del GET, no el estado top-level (que para
// órdenes sin devolución es vocabulario de pedido: cancelado, no_cancelable_*).
// No bloquea la fila: timeout corto y si falla o no hay dato, queda null.
async function consultarPedro(orderNumber: string): Promise<string | null> {
  try {
    const { body } = await getCancelacionEstado({ order_number: orderNumber }, { timeoutMs: 5000 })
    return body?.devolucion?.estado ?? null
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

interface DevolucionPedidaRow {
  orderNumber: string
  tracking: string | null
  modalidad: string
  estado: string | null
  createdAt: string
}

// Devoluciones pedidas desde el 360 por el webhook (solicitar_devolucion):
// origen de la fila sintética hasta que la réplica refleje el shipment return.
async function getDevolucionesPedidas(): Promise<DevolucionPedidaRow[]> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('devoluciones_pedidas')
      .select('order_number, tracking, modalidad, estado, created_at')
    return (data ?? []).map(r => ({
      orderNumber: r.order_number,
      tracking: r.tracking ?? null,
      modalidad: r.modalidad,
      estado: r.estado ?? null,
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}

interface RetrackingRow {
  tracking: string
  createdAt: string
}

// Trackings vigentes de devoluciones recargadas A MANO en andreani.com
// (devoluciones_retracking, por orden): cuando la generación por el circuito
// de Pedro falla, Andreani crea los envíos con tracking nuevo y el del
// shipment return de la réplica queda muerto. Si la query falla, la pestaña
// sigue con los trackings de la réplica.
async function getRetracking(): Promise<Map<string, RetrackingRow>> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('devoluciones_retracking')
      .select('order_number, tracking, created_at')
    const map = new Map<string, RetrackingRow>()
    for (const r of data ?? []) {
      map.set(r.order_number, { tracking: r.tracking, createdAt: r.created_at })
    }
    return map
  } catch {
    return new Map()
  }
}

interface DevolucionManualRow {
  tracking: string
  orderNumber: string
  createdAt: string
}

// Devoluciones cargadas a mano con el botón "Cargar devolución": generadas por
// fuera de GOcelular (lado GOcuotas/Pedro), sin shipment return en la réplica.
// Solo se persiste pedido ↔ tracking; el resto se cruza en vivo.
async function getDevolucionesManuales(): Promise<DevolucionManualRow[]> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('devoluciones_manuales')
      .select('tracking, order_number, created_at')
    return (data ?? []).map(r => ({
      tracking: r.tracking,
      orderNumber: r.order_number,
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}

/**
 * Carga a mano una devolución generada por fuera de GOcelular. Recibe el pedido
 * (SO-XXXXXX de la tienda o nro de orden GOcuotas) y el tracking de la
 * devolución; valida que el pedido exista y que Andreani reconozca el tracking,
 * y guarda solo ese vínculo — el resto de la fila se cruza en vivo al leer.
 */
export async function cargarDevolucionManual(
  pedidoInput: string,
  trackingInput: string,
): Promise<{ ok?: true; orderNumber?: string; error?: string }> {
  const tracking = trackingInput.replace(/\D/g, '')
  if (!/^\d{9,20}$/.test(tracking)) {
    return { error: 'El tracking de Andreani debe ser un número (ej. 360003148232650).' }
  }
  const pedido = pedidoInput.trim().toUpperCase()
  if (!pedido) return { error: 'Falta el pedido (SO-XXXXXX o nro de orden GOcuotas).' }

  // Resolver el pedido contra la réplica: SO de la tienda o nro GOcuotas.
  const pool = getPool()
  if (!pool) return { error: 'La base de GOcelular no está disponible.' }
  let orderNumber: string | null = null
  if (/^SO-/.test(pedido)) {
    const { rows } = await pool.query(`SELECT order_number FROM store_orders WHERE order_number = $1`, [pedido])
    orderNumber = rows[0]?.order_number ?? null
    if (!orderNumber) return { error: `No existe el pedido ${pedido} en la tienda.` }
  } else if (/^\d+$/.test(pedido)) {
    // Si la orden GOcuotas tiene pedido de tienda, se guarda el SO (fila más rica)
    const { rows } = await pool.query(
      `SELECT so.order_number FROM store_orders so WHERE so.gocuotas_order_id::text = $1`,
      [pedido],
    )
    orderNumber = rows[0]?.order_number ?? null
    if (!orderNumber) {
      const { rows: go } = await pool.query(`SELECT order_id FROM gocuotas_orders WHERE order_id::text = $1`, [pedido])
      if (go.length === 0) return { error: `No existe la orden GOcuotas ${pedido}.` }
      orderNumber = pedido
    }
  } else {
    return { error: 'El pedido debe ser un SO-XXXXXX de la tienda o un nro de orden GOcuotas.' }
  }

  // El tracking no debe existir ya en ninguna fuente de la pestaña.
  const { rows: dup } = await pool.query(
    `SELECT 1 FROM shipments WHERE tracking_number = $1 AND type = 'return'`,
    [tracking],
  )
  if (dup.length > 0) return { error: `El tracking ${tracking} ya figura como devolución en la réplica — la fila ya está en la pestaña.` }
  const supabase = createAdminClient()
  const [enManuales, enRetracking, enPedidas] = await Promise.all([
    supabase.from('devoluciones_manuales').select('tracking').eq('tracking', tracking).maybeSingle(),
    supabase.from('devoluciones_retracking').select('tracking').eq('tracking', tracking).maybeSingle(),
    supabase.from('devoluciones_pedidas').select('tracking').eq('tracking', tracking).maybeSingle(),
  ])
  if (enManuales.data) return { error: `El tracking ${tracking} ya está cargado a mano.` }
  if (enRetracking.data || enPedidas.data) return { error: `El tracking ${tracking} ya está registrado (recarga manual o devolución pedida).` }

  // Andreani tiene que reconocer el número (para números desconocidos responde
  // 200 con body null → timeline vacío).
  const seguimiento = await consultarAndreani(tracking, new Date())
  if (!seguimiento.consultado) {
    return { error: 'Andreani no respondió — probá de nuevo en un rato.' }
  }
  if (!seguimiento.estadoActual && seguimiento.tramos.length === 0) {
    return { error: `Andreani no reconoce el tracking ${tracking} — verificá el número.` }
  }

  const { error } = await supabase
    .from('devoluciones_manuales')
    .insert({ tracking, order_number: orderNumber })
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true, orderNumber }
}

/** Quita una devolución cargada a mano (p. ej. por un error de tipeo). */
export async function eliminarDevolucionManual(tracking: string): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('devoluciones_manuales').delete().eq('tracking', tracking)
  if (error) return { error: error.message }
  revalidatePath('/compras/envios')
  return { ok: true }
}

// Mismo contexto de orden/equipo que la query principal, pero arrancando de la
// orden (la devolución pedida por webhook todavía no tiene shipment return).
async function contextoPorOrden(orderNumbers: string[]): Promise<Map<string, Omit<ReturnRaw, 'ret_tracking' | 'ret_creado'>>> {
  const pool = getPool()
  const map = new Map<string, Omit<ReturnRaw, 'ret_tracking' | 'ret_creado'>>()
  if (!pool || orderNumbers.length === 0) return map
  const { rows } = await pool.query(
    `SELECT so.order_number, so.gocuotas_order_id,
            COALESCE(NULLIF(TRIM(so.customer_name), ''), '—') AS cliente,
            so.customer_dni AS dni, so.product_name AS producto,
            so.shipping_city AS ciudad, so.shipping_province AS provincia,
            go.order_status AS go_status,
            ob.tracking_number AS out_tracking, ob.imei AS out_imei,
            ii.status AS inv_status, d.trustonic_observed_state AS tru_obs
     FROM store_orders so
     LEFT JOIN gocuotas_orders go ON go.order_id::text = so.gocuotas_order_id::text
     LEFT JOIN LATERAL (
       SELECT tracking_number, imei FROM shipments o
       WHERE o.store_order_id = so.id AND o.type = 'outbound'
       ORDER BY o.created_at DESC LIMIT 1
     ) ob ON true
     LEFT JOIN inventory_items ii ON ii.imei = ob.imei
     LEFT JOIN devices d ON d.imei = ob.imei
     WHERE so.order_number = ANY($1)`,
    [orderNumbers],
  )
  for (const r of rows) map.set(r.order_number, r)
  return map
}

// Contexto para devoluciones manuales de órdenes GOcuotas SIN pedido de tienda
// (ventas de otros canales): cliente y estado desde gocuotas_orders, equipo por
// el cancelled_device_imei y envío de ida por ese IMEI.
async function contextoPorGocuotas(orderIds: string[]): Promise<Map<string, Omit<ReturnRaw, 'ret_tracking' | 'ret_creado'>>> {
  const pool = getPool()
  const map = new Map<string, Omit<ReturnRaw, 'ret_tracking' | 'ret_creado'>>()
  if (!pool || orderIds.length === 0) return map
  const { rows } = await pool.query(
    `SELECT go.order_id::text AS order_id, go.order_id::text AS gocuotas_order_id,
            COALESCE(NULLIF(TRIM(go.user_name), ''), '—') AS cliente,
            go.user_dni::text AS dni,
            COALESCE(d.model, '—') AS producto,
            NULL AS ciudad, NULL AS provincia,
            go.order_status AS go_status,
            ob.tracking_number AS out_tracking,
            go.cancelled_device_imei AS out_imei,
            ii.status AS inv_status, d.trustonic_observed_state AS tru_obs
     FROM gocuotas_orders go
     LEFT JOIN devices d ON d.imei = go.cancelled_device_imei
     LEFT JOIN inventory_items ii ON ii.imei = go.cancelled_device_imei
     LEFT JOIN LATERAL (
       SELECT tracking_number FROM shipments o
       WHERE o.imei = go.cancelled_device_imei AND o.type = 'outbound'
       ORDER BY o.created_at DESC LIMIT 1
     ) ob ON true
     WHERE go.order_id::text = ANY($1)`,
    [orderIds],
  )
  for (const r of rows) map.set(r.order_id, { ...r, order_number: r.order_id })
  return map
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
  const [seguimientos, pedidas, retracking, cargadas] = await Promise.all([
    getSeguimientoDevoluciones(),
    getDevolucionesPedidas(),
    getRetracking(),
    getDevolucionesManuales(),
  ])

  // Pedidas por webhook sin shipment return en la réplica todavía → fila sintética
  const sinShipment = devolucionesPedidasSinShipment(
    pedidas,
    rows.map(r => ({ orderNumber: r.order_number, tracking: r.ret_tracking ?? null })),
  )
  // Recargas manuales de Andreani sin fila propia (ni shipment ni pedida):
  // también fila sintética, con el tracking manual como devolución vigente
  const ordenesConFila = new Set([...rows.map(r => r.order_number), ...sinShipment.map(p => p.orderNumber)])
  const retrackingSinFila = [...retracking.entries()].filter(([orden]) => !ordenesConFila.has(orden))
  // Cargadas a mano con el botón "Cargar devolución": fila propia salvo que el
  // tracking ya exista en otra fuente (shipment return, pedida o retracking)
  const trackingsConFila = new Set<string>([
    ...rows.map(r => r.ret_tracking).filter(Boolean),
    ...pedidas.map(p => p.tracking).filter((t): t is string => t !== null),
    ...[...retracking.values()].map(r => r.tracking),
  ])
  const cargadasNuevas = cargadas.filter(c => !trackingsConFila.has(c.tracking))
  const cargadasSo = cargadasNuevas.filter(c => /^SO-/.test(c.orderNumber))
  const cargadasGocuotas = cargadasNuevas.filter(c => !/^SO-/.test(c.orderNumber))
  const [contextos, contextosGocuotas] = await Promise.all([
    contextoPorOrden([
      ...sinShipment.map(p => p.orderNumber),
      ...retrackingSinFila.map(([orden]) => orden),
      ...cargadasSo.map(c => c.orderNumber),
    ]),
    contextoPorGocuotas(cargadasGocuotas.map(c => c.orderNumber)),
  ])
  const sinteticas = Promise.all(
    sinShipment.map(async (p): Promise<FilaDevolucion> => {
      const c = contextos.get(p.orderNumber)
      // El retracking manual pisa al tracking de la pedida (si Andreani la
      // recargó a mano, el de la pedida quedó muerto)
      const manual = retracking.get(p.orderNumber)
      const trackingVigente = manual?.tracking ?? p.tracking
      const seguimiento = trackingVigente ? seguimientos.get(trackingVigente) : undefined
      const [entrega, devolucion, pedroEstado] = await Promise.all([
        consultarAndreani(c?.out_tracking ?? null, ahora),
        consultarAndreani(trackingVigente, ahora),
        // Resueltas no gastan requests a Pedro (mismo criterio que Rescates)
        seguimiento?.resueltoAt ? Promise.resolve(null) : consultarPedro(p.orderNumber),
      ])
      const ordenAnulada = c?.go_status === 'discarded'
      return {
        orderNumber: p.orderNumber,
        gocuotasOrderId: c?.gocuotas_order_id ?? null,
        cliente: c?.cliente ?? '—',
        dni: c?.dni ?? null,
        producto: c?.producto ?? '—',
        imei: c?.out_imei ?? null,
        ciudad: c?.ciudad ?? null,
        provincia: c?.provincia ?? null,
        returnCreadoAt: p.createdAt,
        ordenAnulada,
        gocuotasStatus: c?.go_status ?? null,
        inventarioStatus: c?.inv_status ?? null,
        trustonicObservado: c?.tru_obs ?? null,
        entrega,
        devolucion,
        recibidoWhGo: seguimiento?.recibidoWhGo ?? false,
        resueltoAt: seguimiento?.resueltoAt ?? null,
        pedroEstado,
        banderaPedro: banderaDiscrepancia(devolucion.estadoActual, pedroEstado),
        pedidaWebhook: { modalidad: p.modalidad, estado: p.estado },
        trackingManual: !!manual,
        origenManual: false,
        banderas: banderasDevolucion({
          entregaEstado: entrega.estadoActual,
          inventarioStatus: c?.inv_status ?? null,
          trustonicObservado: c?.tru_obs ?? null,
          ordenAnulada,
          devolucionEventos: devolucion.tramos.length,
          rendicionFallida: !!devolucion.rendicionFallida,
        }),
      }
    }),
  )

  // Recargas manuales sin ninguna otra fila → sintética con el tracking manual
  const manuales = Promise.all(
    retrackingSinFila.map(async ([orden, manual]): Promise<FilaDevolucion> => {
      const c = contextos.get(orden)
      const seguimiento = seguimientos.get(manual.tracking)
      const [entrega, devolucion, pedroEstado] = await Promise.all([
        consultarAndreani(c?.out_tracking ?? null, ahora),
        consultarAndreani(manual.tracking, ahora),
        seguimiento?.resueltoAt ? Promise.resolve(null) : consultarPedro(orden),
      ])
      const ordenAnulada = c?.go_status === 'discarded'
      return {
        orderNumber: orden,
        gocuotasOrderId: c?.gocuotas_order_id ?? null,
        cliente: c?.cliente ?? '—',
        dni: c?.dni ?? null,
        producto: c?.producto ?? '—',
        imei: c?.out_imei ?? null,
        ciudad: c?.ciudad ?? null,
        provincia: c?.provincia ?? null,
        returnCreadoAt: manual.createdAt,
        ordenAnulada,
        gocuotasStatus: c?.go_status ?? null,
        inventarioStatus: c?.inv_status ?? null,
        trustonicObservado: c?.tru_obs ?? null,
        entrega,
        devolucion,
        recibidoWhGo: seguimiento?.recibidoWhGo ?? false,
        resueltoAt: seguimiento?.resueltoAt ?? null,
        pedroEstado,
        banderaPedro: banderaDiscrepancia(devolucion.estadoActual, pedroEstado),
        pedidaWebhook: null,
        trackingManual: true,
        origenManual: false,
        banderas: banderasDevolucion({
          entregaEstado: entrega.estadoActual,
          inventarioStatus: c?.inv_status ?? null,
          trustonicObservado: c?.tru_obs ?? null,
          ordenAnulada,
          devolucionEventos: devolucion.tramos.length,
          rendicionFallida: !!devolucion.rendicionFallida,
        }),
      }
    }),
  )

  // Cargadas a mano (botón "Cargar devolución"): el contexto sale del pedido de
  // tienda si existe, o de la orden GOcuotas directa (ventas de otros canales)
  const cargadasFilas = Promise.all(
    cargadasNuevas.map(async (m): Promise<FilaDevolucion> => {
      const esSo = /^SO-/.test(m.orderNumber)
      const c = esSo ? contextos.get(m.orderNumber) : contextosGocuotas.get(m.orderNumber)
      const seguimiento = seguimientos.get(m.tracking)
      const [entrega, devolucion, pedroEstado] = await Promise.all([
        consultarAndreani(c?.out_tracking ?? null, ahora),
        consultarAndreani(m.tracking, ahora),
        // El GET de Pedro va por order_number de la tienda; para órdenes
        // GOcuotas sin pedido no hay consulta posible
        !esSo || seguimiento?.resueltoAt ? Promise.resolve(null) : consultarPedro(m.orderNumber),
      ])
      const ordenAnulada = c?.go_status === 'discarded'
      return {
        orderNumber: m.orderNumber,
        gocuotasOrderId: c?.gocuotas_order_id ?? (esSo ? null : m.orderNumber),
        cliente: c?.cliente ?? '—',
        dni: c?.dni ?? null,
        producto: c?.producto ?? '—',
        imei: c?.out_imei ?? null,
        ciudad: c?.ciudad ?? null,
        provincia: c?.provincia ?? null,
        returnCreadoAt: m.createdAt,
        ordenAnulada,
        gocuotasStatus: c?.go_status ?? null,
        inventarioStatus: c?.inv_status ?? null,
        trustonicObservado: c?.tru_obs ?? null,
        entrega,
        devolucion,
        recibidoWhGo: seguimiento?.recibidoWhGo ?? false,
        resueltoAt: seguimiento?.resueltoAt ?? null,
        pedroEstado,
        banderaPedro: banderaDiscrepancia(devolucion.estadoActual, pedroEstado),
        pedidaWebhook: null,
        trackingManual: false,
        origenManual: true,
        banderas: banderasDevolucion({
          entregaEstado: entrega.estadoActual,
          inventarioStatus: c?.inv_status ?? null,
          trustonicObservado: c?.tru_obs ?? null,
          ordenAnulada,
          devolucionEventos: devolucion.tramos.length,
          rendicionFallida: !!devolucion.rendicionFallida,
        }),
      }
    }),
  )

  const deShipments = Promise.all(
    rows.map(async (r): Promise<FilaDevolucion> => {
      // Recarga manual en andreani.com → el tracking de la réplica está muerto:
      // se consulta y muestra el manual (tildes incluidos, por el tracking vigente)
      const manual = retracking.get(r.order_number)
      const retTracking = manual?.tracking ?? r.ret_tracking
      const seguimiento = seguimientos.get(retTracking)
      const [entrega, devolucion, pedroEstado] = await Promise.all([
        consultarAndreani(r.out_tracking, ahora),
        consultarAndreani(retTracking, ahora),
        // Resueltas no gastan requests a Pedro (mismo criterio que Rescates)
        seguimiento?.resueltoAt ? Promise.resolve(null) : consultarPedro(r.order_number),
      ])
      const ordenAnulada = r.go_status === 'discarded'
      return {
        orderNumber: r.order_number,
        gocuotasOrderId: r.gocuotas_order_id,
        cliente: r.cliente,
        dni: r.dni,
        producto: r.producto,
        imei: r.out_imei,
        ciudad: r.ciudad,
        provincia: r.provincia,
        returnCreadoAt: manual ? manual.createdAt : r.ret_creado,
        ordenAnulada,
        gocuotasStatus: r.go_status,
        inventarioStatus: r.inv_status,
        trustonicObservado: r.tru_obs,
        entrega,
        devolucion,
        recibidoWhGo: seguimiento?.recibidoWhGo ?? false,
        resueltoAt: seguimiento?.resueltoAt ?? null,
        pedroEstado,
        banderaPedro: banderaDiscrepancia(devolucion.estadoActual, pedroEstado),
        // Si la devolución nació del webhook del 360 y ya tiene shipment, el
        // chip de modalidad se conserva (estado sigue saliendo del GET en vivo)
        pedidaWebhook: (() => {
          const pedida = pedidas.find(p => p.orderNumber === r.order_number || (p.tracking !== null && p.tracking === r.ret_tracking))
          return pedida ? { modalidad: pedida.modalidad, estado: null } : null
        })(),
        trackingManual: !!manual,
        origenManual: false,
        banderas: banderasDevolucion({
          entregaEstado: entrega.estadoActual,
          inventarioStatus: r.inv_status,
          trustonicObservado: r.tru_obs,
          ordenAnulada,
          devolucionEventos: devolucion.tramos.length,
          rendicionFallida: !!devolucion.rendicionFallida,
        }),
      }
    }),
  )

  const [a, b, c, d] = await Promise.all([sinteticas, manuales, cargadasFilas, deShipments])
  return [...a, ...b, ...c, ...d]
}
