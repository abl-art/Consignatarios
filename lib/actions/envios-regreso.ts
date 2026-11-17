'use server'

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { payloadAndreani, parseTimelineAndreani } from '@/lib/devoluciones'
import { clasificarRegreso, elegirConsultas, type ConsultaPrevia, type EstadoRegreso } from '@/lib/envios-regreso'

// Misma clave/IV públicos que usa lib/actions/devoluciones.ts
const ANDREANI_KEY = process.env.ANDREANI_TRACKING_KEY || '12345678901234567890123456789012'
const ANDREANI_IV = process.env.ANDREANI_TRACKING_IV || '1234567890123456'
const ANDREANI_URL = 'https://tracking-api.andreani.com/api/v3/Tracking'

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

interface CandidatoRegreso {
  tracking: string
  orderNumber: string
}

// Outbound de los últimos 60 días sin estado terminal en la réplica, EXCLUYENDO
// lo que ya vive en otra pestaña de /compras/envios: rescates (evento
// SolicitudDeRescate), siniestros (eventos siniestro/extravío) y devoluciones
// (shipment return de la misma orden). Arrepentimientos y cargas manuales se
// excluyen después contra las tablas de Supabase.
async function fetchCandidatosReplica(dias: number): Promise<CandidatoRegreso[]> {
  const pool = getPool()
  if (!pool) return []
  const client = await pool.connect()
  try {
    const res = await client.query<{ tracking: string; order_number: string }>(
      `SELECT s.tracking_number AS tracking, so.order_number
       FROM shipments s
       JOIN store_orders so ON so.id = s.store_order_id
       WHERE s.type = 'outbound'
         -- 'cancelled' TAMBIÉN entra: GOcelular puede cancelar el shipment con el
         -- paquete ya en la calle (caso real SO-WXCWYW: cancelado en la réplica y
         -- "No entregado" en Andreani volviendo por proceso). Si la etiqueta se
         -- canceló antes de despachar, Andreani responde sin datos y queda
         -- sin_despacho — no ensucia la pestaña.
         AND s.status IN ('created', 'in_transit', 'cancelled')
         AND s.tracking_number IS NOT NULL
         -- Solo trackings reales de Andreani (los placeholder tipo API0000170…
         -- no existen en el seguimiento: la API responde body null)
         AND s.tracking_number ~ '^[0-9]{10,}$'
         AND s.created_at >= now() - make_interval(days => $1)
         AND s.created_at < now() - interval '5 days'
         AND NOT COALESCE(s.traces, '[]'::jsonb) @> '[{"evento":"SolicitudDeRescate"}]'
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(s.traces, '[]'::jsonb)) t
           WHERE t->>'evento' ILIKE '%siniestr%'
              OR t->>'descripcion' ILIKE '%siniestr%'
              OR t->>'descripcion' ILIKE '%extrav%')
         AND NOT EXISTS (
           SELECT 1 FROM shipments r
           WHERE r.store_order_id = s.store_order_id AND r.type = 'return')
         -- El equipo ya volvió si su IMEI salió DESPUÉS en otro envío (se
         -- re-vendió) o si el inventario lo tiene de vuelta como disponible
         -- (caso real: IMEI 865289070565562 falló en SO-4XF45C y se entregó
         -- re-vendido en SO-FBBXKL — el regreso pasó silenciosamente)
         AND NOT EXISTS (
           SELECT 1 FROM shipments s3
           WHERE s3.imei = s.imei AND s3.id <> s.id AND s3.type = 'outbound' AND s3.created_at > s.created_at)
         AND NOT EXISTS (
           SELECT 1 FROM inventory_items inv
           WHERE inv.imei = s.imei AND inv.status = 'available')
       ORDER BY s.created_at ASC`,
      [dias]
    )
    return res.rows.map(r => ({ tracking: r.tracking, orderNumber: r.order_number }))
  } finally {
    client.release()
  }
}

// 'desconocido' = Andreani respondió HTTP 206 con body null: el número no existe
// en su seguimiento (etiqueta generada que nunca ingresó físicamente). Es
// terminal — null es solo error de red/timeout y se reintenta.
async function consultarAndreani(tracking: string): Promise<ReturnType<typeof parseTimelineAndreani> | 'desconocido' | null> {
  const payload = encodeURIComponent(payloadAndreani(tracking, ANDREANI_KEY, ANDREANI_IV))
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(`${ANDREANI_URL}?payload=${payload}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Origin: 'https://www.andreani.com', Referer: 'https://www.andreani.com/' },
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = await res.json()
    if (body === null) return 'desconocido'
    return parseTimelineAndreani(body)
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export interface ResumenSyncRegreso {
  candidatos: number
  consultados: number
  entregados: number
  pendientesNuevos: number
  enViaje: number
  sinDespacho: number
  errores: number
  restantes: number
  regresadosAuto: number
}

// Auto-resolución de pendientes: si el IMEI del envío fallido salió después en
// otro envío (re-venta) o volvió como disponible al inventario, el equipo ya
// regresó — pasa a 'regresado' sin intervención manual.
async function resolverRegresados(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data } = await supabase.from('envios_regreso').select('tracking').eq('estado', 'pendiente_regreso')
  const trackings = (data ?? []).map(r => r.tracking)
  if (trackings.length === 0) return 0

  const pool = getPool()
  if (!pool) return 0
  const client = await pool.connect()
  let resueltos: string[] = []
  try {
    const res = await client.query<{ tracking: string }>(
      `SELECT s.tracking_number AS tracking
       FROM shipments s
       WHERE s.tracking_number = ANY($1) AND s.type = 'outbound'
         AND (
           EXISTS (SELECT 1 FROM shipments s3
                   WHERE s3.imei = s.imei AND s3.id <> s.id AND s3.type = 'outbound' AND s3.created_at > s.created_at)
           OR EXISTS (SELECT 1 FROM inventory_items inv
                      WHERE inv.imei = s.imei AND inv.status = 'available')
         )`,
      [trackings]
    )
    resueltos = res.rows.map(r => r.tracking)
  } finally {
    client.release()
  }
  if (resueltos.length === 0) return 0

  const { error } = await supabase
    .from('envios_regreso')
    .update({ estado: 'regresado', consultado_at: new Date().toISOString() })
    .in('tracking', resueltos)
  if (error) {
    console.error('envios-regreso: auto-resolución falló', error.message)
    return 0
  }
  return resueltos.length
}

/**
 * Corrida del cron: consulta la API pública de Andreani con presupuesto fijo
 * (default 80 por corrida, ~250ms entre llamadas) y cachea el resultado en
 * envios_regreso. Los terminales no se vuelven a consultar jamás; los "en
 * viaje" se re-chequean una vez por semana. La página lee SOLO la tabla.
 */
export async function sincronizarEnviosRegreso(max = 80, dias = 60): Promise<ResumenSyncRegreso> {
  const supabase = createAdminClient()

  // envios_regreso crece sin tope y el select de supabase-js corta en 1000
  // filas por default: se pagina (bug real del barrido 17/11 — el cron
  // re-consultaba los mismos trackings porque no los veía como previos)
  const previasData: { tracking: string; estado: string; consultado_at: string; recibido_at: string | null }[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data: pagina } = await supabase
      .from('envios_regreso')
      .select('tracking, estado, consultado_at, recibido_at')
      .range(desde, desde + 999)
    previasData.push(...(pagina ?? []))
    if (!pagina || pagina.length < 1000) break
  }

  const [candidatosReplica, arrep, rescMan, sinMan, devMan, devPedidas] = await Promise.all([
    fetchCandidatosReplica(dias),
    supabase.from('arrepentimientos').select('tracking, order_number'),
    supabase.from('rescates_seguimiento').select('tracking'),
    supabase.from('siniestros_seguimiento').select('tracking'),
    supabase.from('devoluciones_manuales').select('order_number'),
    supabase.from('devoluciones_pedidas').select('order_number'),
  ])

  const trackingsExcluidos = new Set<string>()
  const ordenesExcluidas = new Set<string>()
  for (const r of arrep.data ?? []) {
    if (r.tracking) trackingsExcluidos.add(r.tracking)
    if (r.order_number) ordenesExcluidas.add(r.order_number)
  }
  for (const r of rescMan.data ?? []) if (r.tracking) trackingsExcluidos.add(r.tracking)
  for (const r of sinMan.data ?? []) if (r.tracking) trackingsExcluidos.add(r.tracking)
  for (const r of devMan.data ?? []) if (r.order_number) ordenesExcluidas.add(r.order_number)
  for (const r of devPedidas.data ?? []) if (r.order_number) ordenesExcluidas.add(r.order_number)

  const candidatos = candidatosReplica
    .filter(c => !trackingsExcluidos.has(c.tracking) && !ordenesExcluidas.has(c.orderNumber))
    .map(c => c.tracking)

  const previas: ConsultaPrevia[] = previasData.map(p => ({
    tracking: p.tracking,
    estado: p.estado as EstadoRegreso,
    consultadoAt: p.consultado_at,
    recibidoAt: p.recibido_at,
  }))

  const aConsultar = elegirConsultas(candidatos, previas, max, new Date())
  const previasPorTracking = new Map(previas.map(p => [p.tracking, p]))

  const resumen: ResumenSyncRegreso = {
    candidatos: candidatos.length,
    consultados: 0,
    entregados: 0,
    pendientesNuevos: 0,
    enViaje: 0,
    sinDespacho: 0,
    errores: 0,
    restantes: 0,
    regresadosAuto: 0,
  }

  for (const tracking of aConsultar) {
    const timeline = await consultarAndreani(tracking)
    if (timeline === null) {
      resumen.errores++ // sin fila nueva: se reintenta en la próxima corrida
      await dormir(250)
      continue
    }
    resumen.consultados++
    if (timeline === 'desconocido') {
      resumen.sinDespacho++
      const { error } = await supabase.from('envios_regreso').upsert({
        tracking,
        estado: 'sin_despacho',
        estado_andreani: 'Desconocido en Andreani',
        consultado_at: new Date().toISOString(),
      })
      if (error) console.error(`envios-regreso: upsert falló para ${tracking}`, error.message)
      await dormir(250)
      continue
    }
    const estado = clasificarRegreso(timeline)
    if (estado === 'entregado') resumen.entregados++
    else if (estado === 'pendiente_regreso') {
      if (previasPorTracking.get(tracking)?.estado !== 'pendiente_regreso') resumen.pendientesNuevos++
    } else if (estado === 'sin_despacho') resumen.sinDespacho++
    else resumen.enViaje++

    const { error } = await supabase.from('envios_regreso').upsert({
      tracking,
      estado,
      estado_andreani: timeline.estadoActual,
      fecha_ultimo_evento: timeline.fechaUltimoEvento,
      consultado_at: new Date().toISOString(),
      ...(estado === 'pendiente_regreso' && previasPorTracking.get(tracking)?.estado !== 'pendiente_regreso'
        ? { detectado_at: new Date().toISOString() }
        : {}),
    })
    if (error) console.error(`envios-regreso: upsert falló para ${tracking}`, error.message)
    await dormir(250)
  }

  // Cuántos candidatos quedarían por consultar en próximas corridas
  const consultadosAhora = new Set(aConsultar)
  resumen.restantes = elegirConsultas(
    candidatos.filter(c => !consultadosAhora.has(c)),
    previas,
    Number.MAX_SAFE_INTEGER,
    new Date(),
  ).length

  resumen.regresadosAuto = await resolverRegresados(supabase)

  return resumen
}

export interface FilaRegreso {
  tracking: string
  estadoAndreani: string | null
  fechaUltimoEvento: string | null
  detectadoAt: string | null
  recibidoAt: string | null
  /** true = auto-resuelto: el IMEI se re-vendió o volvió disponible al inventario */
  regresoAuto: boolean
  orderNumber: string | null
  cliente: string | null
  dni: string | null
  producto: string | null
  imei: string | null
  ciudad: string | null
  provincia: string | null
}

/** Filas de la pestaña: solo lee la tabla + cruce en vivo con la réplica (sin tocar Andreani) */
export async function getPendientesRegreso(): Promise<FilaRegreso[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('envios_regreso')
    .select('tracking, estado, estado_andreani, fecha_ultimo_evento, detectado_at, recibido_at')
    .in('estado', ['pendiente_regreso', 'regresado'])
  const filas = data ?? []
  if (filas.length === 0) return []

  const porTracking = new Map<string, { order_number: string; cliente: string; dni: string | null; producto: string; imei: string | null; ciudad: string | null; provincia: string | null }>()
  const pool = getPool()
  if (pool) {
    const client = await pool.connect()
    try {
      const res = await client.query(
        `SELECT s.tracking_number AS tracking, so.order_number, so.customer_name AS cliente,
                so.customer_dni AS dni, so.product_name AS producto, s.imei,
                so.shipping_city AS ciudad, so.shipping_province AS provincia
         FROM shipments s
         JOIN store_orders so ON so.id = s.store_order_id
         WHERE s.type = 'outbound' AND s.tracking_number = ANY($1)`,
        [filas.map(f => f.tracking)]
      )
      for (const r of res.rows) porTracking.set(r.tracking, r)
    } finally {
      client.release()
    }
  }

  return filas
    .map(f => {
      const extra = porTracking.get(f.tracking)
      return {
        tracking: f.tracking,
        estadoAndreani: f.estado_andreani,
        fechaUltimoEvento: f.fecha_ultimo_evento,
        detectadoAt: f.detectado_at,
        recibidoAt: f.recibido_at,
        regresoAuto: f.estado === 'regresado',
        orderNumber: extra?.order_number ?? null,
        cliente: extra?.cliente ?? null,
        dni: extra?.dni ?? null,
        producto: extra?.producto ?? null,
        imei: extra?.imei ?? null,
        ciudad: extra?.ciudad ?? null,
        provincia: extra?.provincia ?? null,
      }
    })
    .sort((a, b) => (a.fechaUltimoEvento ?? '').localeCompare(b.fechaUltimoEvento ?? ''))
}

/** Tilde manual de la pestaña: el equipo volvió físicamente. Reversible. */
export async function marcarRegresoRecibido(tracking: string, recibido: boolean): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('envios_regreso')
    .update({ recibido_at: recibido ? new Date().toISOString() : null })
    .eq('tracking', tracking)
  if (error) return { error: error.message }
  revalidatePath('/compras/envios')
  return { ok: true }
}
