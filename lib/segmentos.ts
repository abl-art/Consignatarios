// Segmentación de clientes A1–D4 del ecosistema GO (doc "Estructura de Crédito").
// Letra = límite general medido en tickets promedio: A >4.8 · B 2–4.8 · C 1–2 · D <1.
// Número = antigüedad desde la activación (primera orden BNPL entregada en GO,
// EXCLUYENDO las órdenes de la plataforma GOcelular — regla de Emiliano 21/9:
// si el celular fue su primera compra del ecosistema, es un "4", ahí empieza
// su historial): 1 = +12 meses · 2 = 4–12 · 3 = <4 · 4 = sin historial previo.
// Ticket promedio = $ ventas GOcuotas BNPL últimos 30 días / Q ventas,
// excluyendo las operaciones de GOcelular (clientes propios).
//
// La réplica de GOcelular es solo lectura, así que las tablas derivadas
// (segmentos_clientes + resumen segmentos_mix) viven en el Supabase propio,
// como control_stock_cortes. Las recalcula a diario /api/cron/sync-segmentos
// leyendo el universo de compradores de la réplica y límites/activación de
// Databricks. El filtro por segmento en PD/DPD/Vintage inyecta los user_ids
// del segmento (whitelisted) en las queries de la réplica.

import { getPool, getSupabasePool } from '@/lib/db-pool'
import { databricksQuery, dbNum } from '@/lib/databricks'
import { CLIENT_IDS_PROPIOS } from '@/lib/client-ids'

const BATCH_DATABRICKS = 5000
const BATCH_UPSERT = 1000

export const SEGMENTOS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4'] as const

export interface ResultadoSync {
  usuarios: number
  conSegmento: number
  sinLimite: number
  ticketPromedio: number
  segundos: number
}

function calcularLetra(limite: number, ticketPromedio: number): string {
  const tp = limite / ticketPromedio
  if (tp > 4.8) return 'A'
  if (tp >= 2) return 'B'
  if (tp >= 1) return 'C'
  return 'D'
}

export interface CompradorCanal {
  user_id: string
  compro_propia: boolean
  compro_terceros: boolean
}

// Agrupa compradores por segmento y canal. Un cliente que compró en ambos
// canales cuenta en ambos; en total, una sola vez. Sin segmento → 'S/D'.
export function armarMixSegmentos(
  compradores: CompradorCanal[],
  segmentoPorUser: Map<string, string | null>,
): Map<string, { propia: number; terceros: number; total: number }> {
  const mix = new Map<string, { propia: number; terceros: number; total: number }>()
  for (const u of compradores) {
    const seg = segmentoPorUser.get(u.user_id) ?? 'S/D'
    const m = mix.get(seg) ?? { propia: 0, terceros: 0, total: 0 }
    if (u.compro_propia) m.propia++
    if (u.compro_terceros) m.terceros++
    m.total++
    mix.set(seg, m)
  }
  return mix
}

function calcularNumero(primeraOrden: string | null): number {
  if (!primeraOrden) return 4
  const meses = (Date.now() - new Date(primeraOrden).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  if (meses > 12) return 1
  if (meses >= 4) return 2
  return 3
}

export async function sincronizarSegmentos(): Promise<ResultadoSync> {
  const inicio = Date.now()
  const replica = getPool()
  const propia = getSupabasePool()
  if (!replica) throw new Error('Falta GOCELULAR_DB_URL')
  if (!propia) throw new Error('Falta SUPABASE_DB_URL')

  const db = await propia.connect()
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS segmentos_clientes (
        user_id text PRIMARY KEY,
        segmento text,
        letra text,
        numero int,
        limite numeric,
        limite_en_tickets numeric,
        antiguedad_meses numeric,
        limit_system text,
        ticket_promedio numeric,
        calculado_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await db.query(`CREATE INDEX IF NOT EXISTS segmentos_clientes_segmento_idx ON segmentos_clientes (segmento)`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS segmentos_mix (
        segmento text PRIMARY KEY,
        propia int NOT NULL,
        terceros int NOT NULL,
        total int NOT NULL,
        actualizado_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // Universo + canal por comprador, desde la réplica (solo lectura)
    const propiosSql = CLIENT_IDS_PROPIOS.map(id => `'${id}'`).join(',')
    const resUsuarios = await replica.query<{ user_id: string; compro_propia: boolean; compro_terceros: boolean }>(`
      SELECT user_id::text AS user_id,
        BOOL_OR(client_id::text IN (${propiosSql})) AS compro_propia,
        BOOL_OR(client_id::text NOT IN (${propiosSql})) AS compro_terceros
      FROM gocuotas_orders
      WHERE user_id IS NOT NULL AND order_delivered_at IS NOT NULL AND order_discarded_at IS NULL
      GROUP BY 1
    `)
    const usuarios = resUsuarios.rows.filter(r => /^\d+$/.test(r.user_id))
    const userIds = usuarios.map(r => r.user_id)

    // Órdenes de la plataforma GOcelular por usuario: se excluyen al calcular
    // la activación, así la antigüedad mide solo el historial BNPL previo/ajeno
    const resOrdenes = await replica.query<{ user_id: string; order_id: string }>(
      `SELECT user_id::text AS user_id, order_id::text AS order_id FROM gocuotas_orders WHERE user_id IS NOT NULL`
    )
    const ordenesPlataforma = new Map<string, string[]>()
    for (const r of resOrdenes.rows) {
      if (!/^\d+$/.test(r.order_id)) continue
      const arr = ordenesPlataforma.get(r.user_id) ?? []
      arr.push(r.order_id)
      ordenesPlataforma.set(r.user_id, arr)
    }

    // Ticket promedio global (30 días, BNPL, sin operaciones GOcelular)
    const tpRows = await databricksQuery(`
      SELECT SUM(go_cuotas_order_amount) / COUNT(*) AS tp
      FROM prd.gold_dw.fact_go_cuotas_orders
      WHERE delivered_at >= DATEADD(DAY, -30, CURRENT_DATE())
        AND discarded_at IS NULL
        AND user_commerce_id NOT IN (${propiosSql})
    `)
    const ticketPromedio = dbNum(tpRows[0]?.tp)
    if (ticketPromedio <= 0) throw new Error('Ticket promedio inválido')

    const segmentoPorUser = new Map<string, string | null>()
    let conSegmento = 0
    let sinLimite = 0

    for (let i = 0; i < userIds.length; i += BATCH_DATABRICKS) {
      const batch = userIds.slice(i, i + BATCH_DATABRICKS)
      const inList = batch.join(',')
      const ordenesExcluidas = batch.flatMap(id => ordenesPlataforma.get(id) ?? [])
      const notInOrdenes = ordenesExcluidas.length > 0
        ? `AND go_cuotas_order_id NOT IN (${ordenesExcluidas.map(o => `'${o}'`).join(',')})`
        : ''
      const rows = await databricksQuery(`
        WITH camp AS (
          SELECT user_customer_id,
                 go_cuotas_provider_campaign_max_loan_amount AS limite,
                 go_cuotas_provider_campaign_limit_system AS sistema,
                 ROW_NUMBER() OVER (PARTITION BY user_customer_id ORDER BY valid_at DESC) AS rn
          FROM prd.gold_dw.fact_go_cuotas_provider_campaigns
          WHERE user_customer_id IN (${inList})
        ),
        act AS (
          SELECT user_customer_id, MIN(delivered_at) AS primera_orden
          FROM prd.gold_dw.fact_go_cuotas_orders
          WHERE user_customer_id IN (${inList})
            AND delivered_at IS NOT NULL AND discarded_at IS NULL
            ${notInOrdenes}
          GROUP BY user_customer_id
        )
        SELECT COALESCE(c.user_customer_id, a.user_customer_id) AS user_id,
               c.limite, c.sistema, a.primera_orden
        FROM (SELECT * FROM camp WHERE rn = 1) c
        FULL OUTER JOIN act a ON a.user_customer_id = c.user_customer_id
      `)

      const valores: (string | number | null)[][] = []
      for (const r of rows) {
        const userId = r.user_id
        if (!userId) continue
        const numero = calcularNumero(r.primera_orden)
        const antiguedad = r.primera_orden
          ? Math.round(((Date.now() - new Date(r.primera_orden).getTime()) / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10
          : null
        if (r.limite == null) {
          sinLimite++
          segmentoPorUser.set(userId, null)
          valores.push([userId, null, null, numero, null, null, antiguedad, r.sistema, ticketPromedio])
        } else {
          const limite = dbNum(r.limite)
          const letra = calcularLetra(limite, ticketPromedio)
          const segmento = `${letra}${numero}`
          conSegmento++
          segmentoPorUser.set(userId, segmento)
          valores.push([
            userId,
            segmento,
            letra,
            numero,
            Math.round(limite),
            Math.round((limite / ticketPromedio) * 100) / 100,
            antiguedad,
            r.sistema,
            ticketPromedio,
          ])
        }
      }

      for (let j = 0; j < valores.length; j += BATCH_UPSERT) {
        const chunk = valores.slice(j, j + BATCH_UPSERT)
        const params: (string | number | null)[] = []
        const placeholders = chunk
          .map((v, k) => {
            params.push(...v)
            const base = k * 9
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, now())`
          })
          .join(',')
        await db.query(
          `INSERT INTO segmentos_clientes
             (user_id, segmento, letra, numero, limite, limite_en_tickets, antiguedad_meses, limit_system, ticket_promedio, calculado_at)
           VALUES ${placeholders}
           ON CONFLICT (user_id) DO UPDATE SET
             segmento = EXCLUDED.segmento,
             letra = EXCLUDED.letra,
             numero = EXCLUDED.numero,
             limite = EXCLUDED.limite,
             limite_en_tickets = EXCLUDED.limite_en_tickets,
             antiguedad_meses = EXCLUDED.antiguedad_meses,
             limit_system = EXCLUDED.limit_system,
             ticket_promedio = EXCLUDED.ticket_promedio,
             calculado_at = now()`,
          params
        )
      }
    }

    // Resumen para el Dashboard360: clientes por segmento y canal.
    const mix = armarMixSegmentos(usuarios, segmentoPorUser)
    await db.query('BEGIN')
    try {
      await db.query('DELETE FROM segmentos_mix')
      for (const [seg, m] of mix) {
        await db.query(
          `INSERT INTO segmentos_mix (segmento, propia, terceros, total, actualizado_at) VALUES ($1, $2, $3, $4, now())`,
          [seg, m.propia, m.terceros, m.total]
        )
      }
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }

    return {
      usuarios: userIds.length,
      conSegmento,
      sinLimite,
      ticketPromedio: Math.round(ticketPromedio),
      segundos: Math.round((Date.now() - inicio) / 1000),
    }
  } finally {
    db.release()
  }
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export interface MixSegmento {
  segmento: string // 'A1'..'D4' o 'S/D' (sin límite conocido)
  propia: number
  terceros: number
  total: number
}

export interface MixSegmentos {
  filas: MixSegmento[]
  totalPropia: number
  totalTerceros: number
  totalClientes: number
  actualizadoAt: string | null
}

export async function fetchMixSegmentos(): Promise<MixSegmentos> {
  const vacio: MixSegmentos = { filas: [], totalPropia: 0, totalTerceros: 0, totalClientes: 0, actualizadoAt: null }
  const pool = getSupabasePool()
  if (!pool) return vacio

  const res = await pool.query<{ segmento: string; propia: number; terceros: number; total: number; actualizado_at: string }>(
    `SELECT segmento, propia, terceros, total, actualizado_at::text AS actualizado_at FROM segmentos_mix`
  )
  if (res.rows.length === 0) return vacio

  const filas = res.rows
    .map(r => ({ segmento: r.segmento, propia: Number(r.propia), terceros: Number(r.terceros), total: Number(r.total) }))
    .sort((a, b) => (a.segmento === 'S/D' ? 1 : b.segmento === 'S/D' ? -1 : a.segmento.localeCompare(b.segmento)))

  return {
    filas,
    totalPropia: filas.reduce((s, f) => s + f.propia, 0),
    totalTerceros: filas.reduce((s, f) => s + f.terceros, 0),
    totalClientes: filas.reduce((s, f) => s + f.total, 0),
    actualizadoAt: res.rows[0]?.actualizado_at ?? null,
  }
}

// Ordena las filas del mix alfabéticamente con S/D al final
export function ordenarFilasMix(filas: MixSegmento[]): MixSegmento[] {
  return [...filas].sort((a, b) => (a.segmento === 'S/D' ? 1 : b.segmento === 'S/D' ? -1 : a.segmento.localeCompare(b.segmento)))
}

export interface FiltroMixSegmentos {
  desde?: string // YYYY-MM-DD, viene junto con hasta
  hasta?: string
  clientId?: string // client_id de un merchant tercero
  storeId?: string // gocuotas store_id (orders.store_id en la réplica)
}

/**
 * Cláusulas WHERE extra + params posicionales para el universo de compradores
 * del mix filtrado (fechas de compra, merchant tercero y/o store). Devuelve
 * null si no hay ningún filtro o si alguno viene inválido: fechas malformadas
 * o incoherentes, ids no numéricos, o un clientId propio (el filtro por
 * merchant es solo para terceros).
 */
export function condicionesMixSegmentos(f: FiltroMixSegmentos): { where: string; params: string[] } | null {
  const condiciones: string[] = []
  const params: string[] = []
  if (f.desde || f.hasta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.desde ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(f.hasta ?? '') || f.desde! > f.hasta!) return null
    params.push(f.desde!, f.hasta!)
    condiciones.push(`order_delivered_at >= $1::date AND order_delivered_at < $2::date + 1`)
  }
  if (f.clientId) {
    if (!/^\d+$/.test(f.clientId) || (CLIENT_IDS_PROPIOS as readonly string[]).includes(f.clientId)) return null
    params.push(f.clientId)
    condiciones.push(`client_id::text = $${params.length}`)
  }
  if (f.storeId) {
    if (!/^\d+$/.test(f.storeId)) return null
    params.push(f.storeId)
    condiciones.push(`store_id::text = $${params.length}`)
  }
  if (condiciones.length === 0) return null
  return { where: condiciones.join(' AND '), params }
}

/**
 * Mix de segmentos filtrado: compradores con al menos una orden entregada
 * (no descartada) que cumpla los filtros — rango de fechas de compra,
 * merchant tercero (client_id) y/o store. El segmento de cada cliente es el
 * ACTUAL de segmentos_clientes (el sync diario lo recalcula), no el que tenía
 * al momento de comprar; compradores posteriores al último sync caen en S/D.
 */
export async function fetchMixSegmentosFiltrado(filtro: FiltroMixSegmentos): Promise<MixSegmentos> {
  const vacio: MixSegmentos = { filas: [], totalPropia: 0, totalTerceros: 0, totalClientes: 0, actualizadoAt: null }
  const extra = condicionesMixSegmentos(filtro)
  if (!extra) return vacio
  const replica = getPool()
  const propia = getSupabasePool()
  if (!replica || !propia) return vacio

  const propiosSql = CLIENT_IDS_PROPIOS.map(id => `'${id}'`).join(',')
  const resUsuarios = await replica.query<{ user_id: string; compro_propia: boolean; compro_terceros: boolean }>(
    `SELECT user_id::text AS user_id,
       BOOL_OR(client_id::text IN (${propiosSql})) AS compro_propia,
       BOOL_OR(client_id::text NOT IN (${propiosSql})) AS compro_terceros
     FROM gocuotas_orders
     WHERE user_id IS NOT NULL AND order_delivered_at IS NOT NULL AND order_discarded_at IS NULL
       AND ${extra.where}
     GROUP BY 1`,
    extra.params
  )
  const usuarios = resUsuarios.rows.filter(r => /^\d+$/.test(r.user_id))
  if (usuarios.length === 0) return vacio

  const resSeg = await propia.query<{ user_id: string; segmento: string | null; calculado_at: string }>(
    `SELECT user_id, segmento, calculado_at::text AS calculado_at
     FROM segmentos_clientes WHERE user_id = ANY($1::text[])`,
    [usuarios.map(u => u.user_id)]
  )
  const segmentoPorUser = new Map(resSeg.rows.map(r => [r.user_id, r.segmento]))
  const actualizadoAt = resSeg.rows.reduce<string | null>((max, r) => (max === null || r.calculado_at > max ? r.calculado_at : max), null)

  const mix = armarMixSegmentos(usuarios, segmentoPorUser)
  const filas = ordenarFilasMix([...mix.entries()].map(([segmento, m]) => ({ segmento, ...m })))
  return {
    filas,
    totalPropia: filas.reduce((s, f) => s + f.propia, 0),
    totalTerceros: filas.reduce((s, f) => s + f.terceros, 0),
    totalClientes: filas.reduce((s, f) => s + f.total, 0),
    actualizadoAt,
  }
}

/**
 * User ids (whitelisted /^\d+$/) que matchean letra y/o número de segmento,
 * para inyectar en las queries de la réplica. Se puede filtrar solo por letra
 * ("todos los A"), solo por número ("todos los 1") o por ambos (A1).
 * Sin filtros válidos o tabla vacía → [].
 */
export async function fetchSegmentoUserIds(letra?: string, numero?: string): Promise<string[]> {
  const letraOk = letra && /^[A-D]$/.test(letra) ? letra : undefined
  const numeroOk = numero && /^[1-4]$/.test(numero) ? Number(numero) : undefined
  if (!letraOk && numeroOk === undefined) return []
  const pool = getSupabasePool()
  if (!pool) return []

  const condiciones: string[] = []
  const params: (string | number)[] = []
  if (letraOk) {
    params.push(letraOk)
    condiciones.push(`letra = $${params.length}`)
  }
  if (numeroOk !== undefined) {
    params.push(numeroOk)
    condiciones.push(`numero = $${params.length}`)
  }
  const res = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM segmentos_clientes WHERE ${condiciones.join(' AND ')}`,
    params
  )
  return res.rows.map(r => r.user_id).filter(id => /^\d+$/.test(id))
}
