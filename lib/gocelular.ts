import { getPool, getGocuotasPool } from './db-pool'
import { CLIENT_IDS_PROPIOS, SQL_IDS_TODOS, SQL_IDS_PROPIOS } from './client-ids'

export { CLIENT_IDS_PROPIOS }

// ---------------------------------------------------------------------------
// Ventas por geografía (solo ventas propias)
// ---------------------------------------------------------------------------

export interface VentasPorProvincia {
  provincia: string
  ordenes: number
}

export interface VentasPorCiudad {
  ciudad: string
  provincia: string
  ordenes: number
}

export async function fetchVentasGeografia(): Promise<{ provincias: VentasPorProvincia[]; ciudades: VentasPorCiudad[] }> {
  const pool = getPool()
  if (!pool) return { provincias: [], ciudades: [] }

  const client = await pool.connect()
  try {
    const [provRes, cityRes] = await Promise.all([
      client.query<{ provincia: string; ordenes: string }>(
        `SELECT UPPER(TRIM(so.shipping_province)) AS provincia, COUNT(*)::text AS ordenes
         FROM store_orders so
         JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
         WHERE go.order_delivered_at IS NOT NULL AND go.order_discarded_at IS NULL
           AND go.client_id::text IN (${SQL_IDS_PROPIOS})
           AND so.shipping_province IS NOT NULL AND TRIM(so.shipping_province) != ''
         GROUP BY 1 ORDER BY 2 DESC`
      ),
      client.query<{ ciudad: string; provincia: string; ordenes: string }>(
        `SELECT UPPER(TRIM(so.shipping_city)) AS ciudad, UPPER(TRIM(so.shipping_province)) AS provincia, COUNT(*)::text AS ordenes
         FROM store_orders so
         JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
         WHERE go.order_delivered_at IS NOT NULL AND go.order_discarded_at IS NULL
           AND go.client_id::text IN (${SQL_IDS_PROPIOS})
           AND so.shipping_city IS NOT NULL AND TRIM(so.shipping_city) != ''
         GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10`
      ),
    ])
    return {
      provincias: provRes.rows.map(r => ({ provincia: r.provincia, ordenes: Number(r.ordenes) })),
      ciudades: cityRes.rows.map(r => ({ ciudad: r.ciudad, provincia: r.provincia, ordenes: Number(r.ordenes) })),
    }
  } finally {
    client.release()
  }
}

export interface VentaDiaria {
  store_name: string
  client_id: string
  ventas: number
  monto: number
}

/**
 * Ventas de hoy agrupadas por store_name (para el dashboard admin).
 */
export async function fetchVentasHoy(): Promise<VentaDiaria[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{ store_name: string; client_id: string; ventas: string; monto: string }>(
      `SELECT go.store_name, go.client_id::text, COUNT(*)::text AS ventas, COALESCE(SUM(CASE WHEN go.total_order_amount > 5000000 THEN go.total_order_amount / 100.0 ELSE go.total_order_amount END), 0)::text AS monto
       FROM gocuotas_orders go
       WHERE go.order_discarded_at IS NULL
         AND go.created_at::date = CURRENT_DATE
       GROUP BY go.store_name, go.client_id
       ORDER BY ventas DESC`
    )
    return res.rows.map((r) => ({
      store_name: r.store_name,
      client_id: r.client_id,
      ventas: Number(r.ventas),
      monto: Number(r.monto),
    }))
  } finally {
    client.release()
  }
}

/**
 * Dado un array de order_ids ya sincronizados, devuelve los que fueron
 * anulados en GOcelular (order_discarded_at IS NOT NULL).
 */
export async function fetchAnuladas(orderIds: string[]): Promise<string[]> {
  const pool = getPool()
  if (!pool || orderIds.length === 0) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{ order_id: string }>(
      `SELECT order_id FROM gocuotas_orders
       WHERE order_id = ANY($1) AND order_discarded_at IS NOT NULL`,
      [orderIds]
    )
    return res.rows.map((r) => r.order_id)
  } finally {
    client.release()
  }
}

export interface GocelularSale {
  imei: string
  price: number | null
  default_price: number | null
  total_order_amount: number | null
  assigned_at: string
  assigned_to_order_id: string
  store_name: string
  order_created_at: string
}

/**
 * Busca ventas en GOcelular para los IMEIs que tenemos en consignacion-app.
 *
 * GOcelular registra la relación pedido → IMEI en dos tablas:
 *   1. `inventory_items` (stock propio de GOcelular para ecommerce)
 *   2. `devices` (ventas de consignatarios — IMEIs cargados al momento de vender)
 *
 * Esta query hace UNION de ambas fuentes para no perder ventas.
 */
export async function fetchNewSales(params: {
  ourImeis: string[]
  alreadySyncedSaleIds: string[]
}): Promise<GocelularSale[]> {
  const pool = getPool()
  if (!pool) throw new Error('GOCELULAR_DB_URL no configurada')

  if (params.ourImeis.length === 0) return []

  const client = await pool.connect()
  try {
    const exclude = params.alreadySyncedSaleIds.length > 0
      ? 'AND go.order_id != ALL($2)'
      : ''

    const sql = `
      SELECT * FROM (
        -- Fuente 1: inventory_items (ecommerce / stock propio)
        SELECT ii.imei,
               ii.price,
               dm.default_price,
               go.total_order_amount AS total_order_amount,
               COALESCE(ii.assigned_at, go.order_delivered_at, go.created_at)::text AS assigned_at,
               go.order_id AS assigned_to_order_id,
               go.store_name,
               COALESCE(go.order_created_at, go.created_at)::text AS order_created_at
        FROM inventory_items ii
        JOIN gocuotas_orders go ON go.order_id = ii.assigned_to_order_id
        LEFT JOIN device_models dm ON dm.model_code = ii.model_code
        WHERE ii.status = 'assigned'
          AND go.order_discarded_at IS NULL
          AND ii.imei = ANY($1)
          ${exclude}

        UNION

        -- Fuente 2: devices (consignación — el IMEI se linkea al order en esta tabla)
        SELECT d.imei,
               NULL::numeric AS price,
               NULL::numeric AS default_price,
               go.total_order_amount AS total_order_amount,
               COALESCE(d.enrollment_date, d.created_at, go.order_delivered_at, go.created_at)::text AS assigned_at,
               go.order_id AS assigned_to_order_id,
               go.store_name,
               COALESCE(go.order_created_at, go.created_at)::text AS order_created_at
        FROM devices d
        JOIN gocuotas_orders go ON go.order_id = d.order_id
        WHERE go.order_discarded_at IS NULL
          AND d.imei = ANY($1)
          ${exclude}
      ) AS ventas
    `

    const values = params.alreadySyncedSaleIds.length > 0
      ? [params.ourImeis, params.alreadySyncedSaleIds]
      : [params.ourImeis]

    const res = await client.query<GocelularSale>(sql, values)
    return res.rows
  } finally {
    client.release()
  }
}

export interface ContracargosData {
  monto_contracargos: number
  monto_total_ventas: number
  porcentaje: number
  cantidad: number
}

export async function fetchContracargos(): Promise<ContracargosData> {
  const pool = getPool()
  if (!pool) return { monto_contracargos: 0, monto_total_ventas: 0, porcentaje: 0, cantidad: 0 }

  const client = await pool.connect()
  try {
    const res = await client.query<{
      monto_contracargos: string
      monto_total: string
      cantidad: string
    }>(`
      SELECT
        COALESCE(SUM(CASE WHEN i.installment_number = 1 AND i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND i.installment_due_at::date < CURRENT_DATE
          THEN i.installment_amount ELSE 0 END), 0) AS monto_contracargos,
        COALESCE(SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE
          THEN i.installment_amount ELSE 0 END), 0) AS monto_total,
        COUNT(*) FILTER (WHERE i.installment_number = 1 AND i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND i.installment_due_at::date < CURRENT_DATE) AS cantidad
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.client_id::text IN (${SQL_IDS_TODOS})
    `)
    const r = res.rows[0]
    const contracargos = Number(r.monto_contracargos)
    const total = Number(r.monto_total)
    return {
      monto_contracargos: contracargos,
      monto_total_ventas: total,
      porcentaje: total > 0 ? Math.round((contracargos / total) * 10000) / 100 : 0,
      cantidad: Number(r.cantidad),
    }
  } finally {
    client.release()
  }
}

export interface VentaHistorica {
  fecha: string // YYYY-MM-DD
  store_name: string
  client_id: string
  ventas: number
  monto: number
}

/**
 * Ventas historicas agrupadas por fecha y store_name.
 * Devuelve store_name crudo para que el consumidor clasifique por canal.
 */
export async function fetchVentasHistoricas(): Promise<VentaHistorica[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{
      fecha: Date
      store_name: string
      client_id: string
      ventas: number
      monto: string
    }>(
      `SELECT
        o.order_created_at::date AS fecha,
        o.store_name,
        o.client_id::text,
        COUNT(*)::int AS ventas,
        COALESCE(SUM(CASE WHEN o.total_order_amount > 5000000 THEN o.total_order_amount / 100.0 ELSE o.total_order_amount END), 0) AS monto
      FROM gocuotas_orders o
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
      GROUP BY 1, 2, 3
      ORDER BY 1`
    )
    return res.rows.map((r) => ({
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha),
      store_name: r.store_name,
      client_id: r.client_id,
      ventas: r.ventas,
      monto: Number(r.monto),
    }))
  } finally {
    client.release()
  }
}

export interface InventoryItem {
  imei: string
  model_code: string
  brand: string
  model_name: string
  precio_costo: number
}

export async function fetchInventarioDisponible(): Promise<InventoryItem[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{
      imei: string
      model_code: string
      brand: string
      model_name: string
      precio_costo: string
    }>(
      `SELECT ii.imei, ii.model_code, COALESCE(dm.brand, 'Desconocido') AS brand, COALESCE(dm.name, ii.model_code) AS model_name, COALESCE(dm.default_price, 0) AS precio_costo
       FROM inventory_items ii
       LEFT JOIN device_models dm ON dm.model_code = ii.model_code
       WHERE ii.status = 'available'
       ORDER BY dm.brand, dm.name, ii.imei`
    )
    return res.rows.map((r) => ({
      imei: r.imei,
      model_code: r.model_code,
      brand: r.brand,
      model_name: r.model_name,
      precio_costo: Number(r.precio_costo),
    }))
  } finally {
    client.release()
  }
}

export async function fetchStockPropioDetalle(): Promise<{model_name: string; qty: number}[]> {
  const pool = getPool()
  if (!pool) return []
  const client = await pool.connect()
  try {
    const res = await client.query<{model_name: string; qty: string}>(
      `SELECT COALESCE(dm.name, ii.model_code) AS model_name, COUNT(*)::text AS qty
       FROM inventory_items ii
       LEFT JOIN device_models dm ON dm.model_code = ii.model_code
       WHERE ii.status = 'available'
       GROUP BY model_name`
    )
    return res.rows.map(r => ({ model_name: r.model_name, qty: Number(r.qty) }))
  } finally {
    client.release()
  }
}

export async function fetchStockPropio(): Promise<number> {
  const pool = getPool()
  if (!pool) return 0

  const client = await pool.connect()
  try {
    const [dispRes, pendRes] = await Promise.all([
      client.query<{ qty: string }>(`SELECT COUNT(*)::text AS qty FROM inventory_items WHERE status = 'available'`),
      client.query<{ qty: string }>(`
        SELECT COUNT(*)::text AS qty
        FROM store_orders so
        JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
        WHERE go.order_status = 'approved'
          AND go.order_discarded_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.order_id = go.order_id)
      `),
    ])
    const disponibles = Number(dispRes.rows[0].qty)
    const pendientes = Number(pendRes.rows[0].qty)
    return Math.max(0, disponibles - pendientes)
  } finally {
    client.release()
  }
}

export interface VentaPorModelo {
  fecha: string // YYYY-MM-DD
  store_name: string
  modelo: string // this will be the store_name from the order which contains the model name
  ventas: number
}

/**
 * Ventas agrupadas por fecha, store_name y modelo.
 * Intenta obtener el modelo desde inventory_items/device_models (ecommerce)
 * o desde devices (consignación). Si no se encuentra, usa 'Desconocido'.
 */
export async function fetchVentasPorModelo(): Promise<VentaPorModelo[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{
      fecha: Date
      store_name: string
      modelo: string
      ventas: number
    }>(
      `SELECT
        o.order_created_at::date AS fecha,
        o.store_name,
        COALESCE(so.product_name, 'Desconocido') AS modelo,
        COUNT(*)::int AS ventas
      FROM gocuotas_orders o
      LEFT JOIN store_orders so ON so.id::text = o.store_order_id
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.client_id::text IN (${SQL_IDS_TODOS})
        AND o.order_created_at >= '2026-03-23'
      GROUP BY 1, 2, 3
      ORDER BY 1`
    )
    return res.rows.map((r) => ({
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha),
      store_name: r.store_name,
      modelo: r.modelo,
      ventas: r.ventas,
    }))
  } finally {
    client.release()
  }
}

export interface VentaTercero {
  store_name: string
  client_id: string
  fecha: string // YYYY-MM-DD
  ventas: number
  monto: number
}

/**
 * Ventas de todas las tiendas, agrupadas por día y store.
 * El filtrado por "terceros" se hace en el consumidor.
 */
export async function fetchVentasTerceros(): Promise<VentaTercero[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{ store_name: string; client_id: string; fecha: Date; ventas: string; monto: string }>(
      `SELECT o.store_name,
              o.client_id::text,
              o.order_created_at::date AS fecha,
              COUNT(*)::text AS ventas,
              COALESCE(SUM(CASE WHEN o.total_order_amount > 5000000 THEN o.total_order_amount / 100.0 ELSE o.total_order_amount END), 0)::text AS monto
       FROM gocuotas_orders o
       WHERE o.order_delivered_at IS NOT NULL
         AND o.order_discarded_at IS NULL
       GROUP BY o.store_name, o.client_id, fecha
       ORDER BY fecha DESC`
    )
    return res.rows.map(r => ({
      store_name: r.store_name,
      client_id: r.client_id,
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha),
      ventas: Number(r.ventas),
      monto: Number(r.monto),
    }))
  } finally {
    client.release()
  }
}

export interface TrustonicStats {
  bloqueados: number
  activos: number
  total: number
  pctBloqueados: number
  tasaActivacion: number
  tiempoPromActivacionDias: number
}

export async function fetchTrustonicStats(): Promise<TrustonicStats> {
  const pool = getPool()
  if (!pool) return { bloqueados: 0, activos: 0, total: 0, pctBloqueados: 0, tasaActivacion: 0, tiempoPromActivacionDias: 0 }

  const client = await pool.connect()
  try {
    const res = await client.query<{ bloqueados: string; activos: string; total: string; total_sin_idle: string; mediana_dias: string }>(
      `WITH stats AS (
        SELECT
          COUNT(*) FILTER (WHERE trustonic_status::text = 'locked') AS bloqueados,
          COUNT(*) FILTER (WHERE trustonic_status::text = 'active') AS activos,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE trustonic_status::text != 'idle') AS total_sin_idle
        FROM devices
        WHERE is_test_device = false OR is_test_device IS NULL
      ),
      dias AS (
        SELECT EXTRACT(EPOCH FROM (last_action_date - created_at)) / 86400 AS d
        FROM devices
        WHERE (is_test_device = false OR is_test_device IS NULL)
          AND trustonic_status::text IN ('active', 'locked')
          AND last_action_date IS NOT NULL
          AND last_action_date > created_at
          AND EXTRACT(EPOCH FROM (last_action_date - created_at)) / 86400 <= 40
      )
      SELECT
        s.bloqueados::text, s.activos::text, s.total::text, s.total_sin_idle::text,
        COALESCE(ROUND((SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY d.d) FROM dias d)::numeric, 1), 0)::text AS mediana_dias
      FROM stats s`
    )
    const r = res.rows[0]
    const bloqueados = Number(r.bloqueados)
    const activos = Number(r.activos)
    const activados = activos + bloqueados
    const total = Number(r.total)
    const totalSinIdle = Number(r.total_sin_idle)
    return {
      bloqueados,
      activos,
      total,
      pctBloqueados: activados > 0 ? Math.round((bloqueados / activados) * 10000) / 100 : 0,
      tasaActivacion: totalSinIdle > 0 ? Math.round((activados / totalSinIdle) * 1000) / 10 : 0,
      tiempoPromActivacionDias: Number(r.mediana_dias),
    }
  } finally {
    client.release()
  }
}

export interface KnoxGuardDevice {
  imei: string
  brand: string
  model: string
  user_name: string
  user_dni: string
  store_name: string
  cuotas_vencidas: number
  monto_adeudado: number
  max_dias_atraso: number
  debe_bloquear: boolean
}

/**
 * Dispositivos sin Trustonic con cuotas vencidas no cobradas y >3 días de atraso.
 */
export async function fetchKnoxGuardDevices(): Promise<KnoxGuardDevice[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{
      imei: string
      brand: string
      model: string
      user_name: string
      user_dni: string
      store_name: string
      cuotas_vencidas: string
      monto_adeudado: string
      max_dias_atraso: string
    }>(
      `SELECT d.imei, d.brand, d.model,
              o.user_name, o.user_dni::text,
              o.store_name,
              COUNT(i.installment_id)::text AS cuotas_vencidas,
              COALESCE(SUM(i.installment_amount), 0)::text AS monto_adeudado,
              MAX(EXTRACT(DAY FROM NOW() - i.installment_due_at))::text AS max_dias_atraso
       FROM devices d
       JOIN gocuotas_orders o ON o.order_id = d.order_id
       JOIN gocuotas_installments i ON i.order_id::text = o.order_id
       WHERE (d.trustonic_excluded = true OR d.trustonic_status::text = 'NOT_ENROLLED')
         AND i.installment_due_at < NOW()
         AND i.installment_collected_at IS NULL
         AND i.installment_discarded_at IS NULL
         AND o.order_discarded_at IS NULL
       GROUP BY d.imei, d.brand, d.model, o.user_name, o.user_dni, o.store_name
       HAVING MAX(EXTRACT(DAY FROM NOW() - i.installment_due_at)) >= 3
       ORDER BY max_dias_atraso DESC`
    )
    return res.rows.map(r => ({
      imei: r.imei,
      brand: r.brand,
      model: r.model,
      user_name: r.user_name || '—',
      user_dni: r.user_dni || '—',
      store_name: r.store_name || '—',
      cuotas_vencidas: Number(r.cuotas_vencidas),
      monto_adeudado: Number(r.monto_adeudado),
      max_dias_atraso: Math.round(Number(r.max_dias_atraso)),
      debe_bloquear: true,
    }))
  } finally {
    client.release()
  }
}

export interface ConversionDiaria {
  fecha: string // YYYY-MM-DD
  total: number
  delivered: number
  pct: number
}

/**
 * Porcentaje de conversión (delivered_at IS NOT NULL / total) por día
 * desde la tabla `orders` de GOcuotas directamente.
 */
export async function fetchConversionGocuotas(): Promise<ConversionDiaria[]> {
  const pool = getGocuotasPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{ fecha: Date; total: string; delivered: string; pct: string }>(
      `SELECT
        created_at::date AS fecha,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
        ROUND(100.0 * COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS pct
      FROM orders
      WHERE client_id::text IN (${SQL_IDS_PROPIOS})
        AND discarded_at IS NULL
        AND created_at >= '2026-01-01'
      GROUP BY 1
      ORDER BY 1`
    )
    return res.rows.map(r => ({
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
      total: Number(r.total),
      delivered: Number(r.delivered),
      pct: Number(r.pct),
    }))
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Addon / Accesorios stock (store_products con is_addon = true)
// ---------------------------------------------------------------------------

export interface AddonStock {
  id: string
  displayName: string
  stock: number
  price: number // en pesos (centavos / 100)
}

export async function fetchAddonStock(): Promise<AddonStock[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{ id: string; display_name: string; stock: string; price: string }>(
      `SELECT id, display_name, COALESCE(stock, 0)::text AS stock, price
       FROM store_products
       WHERE is_addon = true
         AND display_name NOT ILIKE '%E2E%'
         AND status = 'active'
       ORDER BY display_name`
    )
    return res.rows.map(r => ({
      id: r.id,
      displayName: r.display_name,
      stock: Number(r.stock),
      price: Number(r.price) / 100, // centavos → pesos
    }))
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Tasa de activación por mes de originación / merchant / tienda
// ---------------------------------------------------------------------------

export interface ActivacionRow {
  mesOriginacion: string
  storeName: string
  clientId: string
  asignados: number
  activos: number
  ready: number
  bloqueados: number
  devueltos: number
  tasaActivacion: number
  promDias: number
}

export async function fetchActivacionPorMes(): Promise<ActivacionRow[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{
      mes_originacion: string
      store_name: string
      client_id: string
      asignados: string
      activos: string
      ready: string
      bloqueados: string
      devueltos: string
      tasa_activacion: string
      prom_dias: string
    }>(
      `SELECT
        TO_CHAR(go.order_created_at, 'YYYY-MM') AS mes_originacion,
        go.store_name,
        go.client_id::text AS client_id,
        COUNT(*) FILTER (WHERE d.trustonic_status::text != 'idle')::text AS asignados,
        COUNT(*) FILTER (WHERE d.trustonic_status::text = 'active')::text AS activos,
        COUNT(*) FILTER (WHERE d.trustonic_status::text = 'ready_for_use')::text AS ready,
        COUNT(*) FILTER (WHERE d.trustonic_status::text = 'locked')::text AS bloqueados,
        COUNT(*) FILTER (WHERE d.trustonic_status::text = 'returned')::text AS devueltos,
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE d.trustonic_status::text IN ('active', 'locked')) /
          NULLIF(COUNT(*) FILTER (WHERE d.trustonic_status::text != 'idle'), 0), 1), 0)::text AS tasa_activacion,
        COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY CASE
            WHEN d.trustonic_status::text IN ('active', 'locked')
              AND d.last_action_date IS NOT NULL
              AND d.last_action_date > d.created_at
              AND EXTRACT(EPOCH FROM (d.last_action_date - d.created_at)) / 86400 <= 40
            THEN EXTRACT(EPOCH FROM (d.last_action_date - d.created_at)) / 86400
            ELSE NULL END
        )::numeric, 1), 0)::text AS prom_dias
      FROM devices d
      JOIN gocuotas_orders go ON go.order_id = d.order_id
      WHERE (d.is_test_device = false OR d.is_test_device IS NULL)
        AND d.trustonic_status::text != 'idle'
      GROUP BY mes_originacion, go.store_name, go.client_id
      ORDER BY mes_originacion DESC, asignados DESC`
    )
    return res.rows.filter(r => r.mes_originacion !== null).map(r => ({
      mesOriginacion: r.mes_originacion,
      storeName: r.store_name,
      clientId: r.client_id,
      asignados: Number(r.asignados),
      activos: Number(r.activos),
      ready: Number(r.ready),
      bloqueados: Number(r.bloqueados),
      devueltos: Number(r.devueltos),
      tasaActivacion: Number(r.tasa_activacion),
      promDias: Number(r.prom_dias),
    }))
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// PD Hard cuota 2 por mes de originación / merchant / tienda
// ---------------------------------------------------------------------------

export interface PDHardRow {
  mes: string
  storeName: string
  clientId: string
  denHard: number
  numHard: number
  pdHard: number
}

export async function fetchPDHardCuota2(): Promise<PDHardRow[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{
      mes: string; store_name: string; client_id: string; den_hard: string; num_hard: string
    }>(
      `SELECT
        to_char(o.order_delivered_at, 'YYYY-MM') AS mes,
        o.store_name,
        o.client_id::text AS client_id,
        SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE THEN i.installment_amount ELSE 0 END)::text AS den_hard,
        SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE
          AND (
            (i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL)
            OR i.installment_collected_at::date > i.installment_due_at::date + 1
          ) THEN i.installment_amount ELSE 0 END)::text AS num_hard
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND i.installment_number = 2
      GROUP BY 1, 2, 3
      ORDER BY 1 DESC`
    )
    return res.rows.filter(r => r.mes !== null).map(r => {
      const den = Number(r.den_hard)
      const num = Number(r.num_hard)
      return {
        mes: r.mes,
        storeName: r.store_name,
        clientId: r.client_id,
        denHard: den,
        numHard: num,
        pdHard: den > 0 ? Math.round((num / den) * 1000) / 10 : 0,
      }
    })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Alertas de fraude: sucursales sospechosas y cuota 1 alta
// ---------------------------------------------------------------------------

export interface AlertaSucursalOrden {
  orderId: string
  userDni: string
  userName: string
  fecha: string
  monto: number
  bloqueado: boolean
  deviceStatus: string
}

export interface AlertaSucursal {
  storeName: string
  clientId: string
  ordenes: number
  pdHard: number
  asignados: number
  activados: number
  tasaActivacion: number
  detalleOrdenes: AlertaSucursalOrden[]
}

export async function fetchAlertasSucursales(): Promise<AlertaSucursal[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    // PD Hard cuota 2 por store (ordenes >20 dias)
    const pdRes = await client.query<{
      store_name: string; client_id: string; ordenes: string; den: string; num: string
    }>(
      `SELECT o.store_name, o.client_id::text AS client_id,
        COUNT(DISTINCT o.order_id)::text AS ordenes,
        SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE THEN i.installment_amount ELSE 0 END)::text AS den,
        SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE
          AND ((i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL)
            OR i.installment_collected_at::date > i.installment_due_at::date + 1)
          THEN i.installment_amount ELSE 0 END)::text AS num
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND i.installment_number = 2
        AND o.order_created_at < CURRENT_DATE - 20
      GROUP BY 1, 2`
    )

    // Tasa activación por store (ordenes >20 dias)
    const actRes = await client.query<{
      store_name: string; client_id: string; asignados: string; activados: string
    }>(
      `SELECT go.store_name, go.client_id::text AS client_id,
        COUNT(*) FILTER (WHERE d.trustonic_status::text != 'idle')::text AS asignados,
        COUNT(*) FILTER (WHERE d.trustonic_status::text IN ('active', 'locked'))::text AS activados
      FROM devices d
      JOIN gocuotas_orders go ON go.order_id = d.order_id
      WHERE (d.is_test_device = false OR d.is_test_device IS NULL)
        AND d.trustonic_status::text != 'idle'
        AND go.order_created_at < CURRENT_DATE - 20
      GROUP BY 1, 2`
    )

    // Merge: join PD + activación por store
    const actMap = new Map<string, { asignados: number; activados: number }>()
    for (const r of actRes.rows) {
      actMap.set(r.store_name, { asignados: Number(r.asignados), activados: Number(r.activados) })
    }

    // Identificar stores alertadas
    const alertStores: string[] = []
    const tempResult: Omit<AlertaSucursal, 'detalleOrdenes'>[] = []
    for (const r of pdRes.rows) {
      const den = Number(r.den)
      const num = Number(r.num)
      const pd = den > 0 ? Math.round((num / den) * 1000) / 10 : 0
      const act = actMap.get(r.store_name)
      const asignados = act?.asignados ?? 0
      const activados = act?.activados ?? 0
      const tasa = asignados > 0 ? Math.round((activados / asignados) * 1000) / 10 : 100

      if (pd > 50 || tasa < 90) {
        alertStores.push(r.store_name)
        tempResult.push({
          storeName: r.store_name,
          clientId: r.client_id,
          ordenes: Number(r.ordenes),
          pdHard: pd,
          asignados,
          activados,
          tasaActivacion: tasa,
        })
      }
    }

    // Traer detalle de órdenes (DNI, bloqueado) de las sucursales alertadas
    const ordenesMap = new Map<string, AlertaSucursalOrden[]>()
    if (alertStores.length > 0) {
      const detRes = await client.query<{
        store_name: string; order_id: string; user_dni: string; user_name: string;
        fecha: string; monto: string; device_status: string | null
      }>(
        `SELECT o.store_name, o.order_id::text AS order_id,
          COALESCE(o.user_dni::text, '') AS user_dni, COALESCE(o.user_name, 'Sin nombre') AS user_name,
          o.order_created_at::date::text AS fecha,
          o.total_order_amount::text AS monto,
          d.trustonic_status::text AS device_status
        FROM gocuotas_orders o
        LEFT JOIN devices d ON d.order_id = o.order_id::text
        WHERE o.order_delivered_at IS NOT NULL
          AND o.order_discarded_at IS NULL
          AND o.order_created_at < CURRENT_DATE - 20
          AND o.store_name = ANY($1)
        ORDER BY o.store_name, o.order_created_at DESC`,
        [alertStores]
      )
      for (const r of detRes.rows) {
        let monto = Number(r.monto)
        if (monto > 5000000) monto = monto / 100
        const arr = ordenesMap.get(r.store_name) ?? []
        arr.push({
          orderId: r.order_id,
          userDni: r.user_dni,
          userName: r.user_name,
          fecha: r.fecha,
          monto,
          bloqueado: r.device_status === 'locked',
          deviceStatus: r.device_status || 'sin device',
        })
        ordenesMap.set(r.store_name, arr)
      }
    }

    const result: AlertaSucursal[] = tempResult.map(s => ({
      ...s,
      detalleOrdenes: ordenesMap.get(s.storeName) ?? [],
    }))

    return result.sort((a, b) => b.pdHard - a.pdHard)
  } finally {
    client.release()
  }
}

export interface AlertaCuota1 {
  orderId: string
  storeName: string
  clientId: string
  fecha: string
  totalOrden: number
  cuota1: number
  pctCuota1: number
  bloqueado: boolean
}

export async function fetchAlertasCuota1(): Promise<AlertaCuota1[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{
      order_id: string; store_name: string; client_id: string; fecha: string;
      total_order_amount: string; installment_amount: string; pct: string; device_status: string | null
    }>(
      `SELECT o.order_id::text, o.store_name, o.client_id::text AS client_id,
        o.order_created_at::date::text AS fecha,
        o.total_order_amount::text,
        i.installment_amount::text,
        ROUND(100.0 * i.installment_amount / NULLIF(o.total_order_amount, 0), 1)::text AS pct,
        d.trustonic_status::text AS device_status
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      LEFT JOIN devices d ON d.order_id = o.order_id::text
      WHERE i.installment_number = 1
        AND o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.total_order_amount > 0
        AND i.installment_amount > o.total_order_amount * 0.5
      ORDER BY pct DESC`
    )
    return res.rows.map(r => {
      let total = Number(r.total_order_amount)
      if (total > 5000000) total = total / 100
      return {
        orderId: r.order_id,
        storeName: r.store_name,
        clientId: r.client_id,
        fecha: r.fecha,
        totalOrden: total,
        cuota1: Number(r.installment_amount),
        pctCuota1: Number(r.pct),
        bloqueado: r.device_status === 'locked',
      }
    })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Alertas DNI: usuarios con 2+ órdenes y tiendas con usuarios multi-orden
// ---------------------------------------------------------------------------

export interface AlertaDNIDetalle {
  orderId: string
  storeName: string
  clientId: string
  fecha: string
  monto: number
  bloqueado: boolean
}

export interface AlertaDNI {
  userDni: string
  userName: string
  ordenes: number
  bloqueados: number
  primera: string
  ultima: string
  cantTiendas: number
  detalles: AlertaDNIDetalle[]
}

export async function fetchAlertasDNI(): Promise<AlertaDNI[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    // Usuarios con 2+ ordenes
    const users = await client.query<{
      user_dni: string; user_name: string; ordenes: string; primera: string; ultima: string; cant_tiendas: string
    }>(
      `SELECT o.user_dni::text AS user_dni, o.user_name,
        COUNT(*)::text AS ordenes,
        MIN(o.order_created_at::date)::text AS primera,
        MAX(o.order_created_at::date)::text AS ultima,
        COUNT(DISTINCT o.store_name)::text AS cant_tiendas
      FROM gocuotas_orders o
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.user_dni IS NOT NULL
      GROUP BY o.user_dni, o.user_name
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC`
    )

    // Detalle de ordenes de esos usuarios
    const dnis = users.rows.map(r => r.user_dni)
    if (dnis.length === 0) return []

    const details = await client.query<{
      user_dni: string; order_id: string; store_name: string; client_id: string; fecha: string; monto: string; device_status: string | null
    }>(
      `SELECT o.user_dni::text AS user_dni, o.order_id::text AS order_id,
        o.store_name, o.client_id::text AS client_id,
        o.order_created_at::date::text AS fecha,
        o.total_order_amount::text AS monto,
        d.trustonic_status::text AS device_status
      FROM gocuotas_orders o
      LEFT JOIN devices d ON d.order_id = o.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.user_dni = ANY($1::int[])
      ORDER BY o.user_dni, o.order_created_at`,
      [dnis.map(Number)]
    )

    const detailMap = new Map<string, AlertaDNIDetalle[]>()
    for (const d of details.rows) {
      let monto = Number(d.monto)
      if (monto > 5000000) monto = monto / 100
      const arr = detailMap.get(d.user_dni) ?? []
      arr.push({ orderId: d.order_id, storeName: d.store_name, clientId: d.client_id, fecha: d.fecha, monto, bloqueado: d.device_status === 'locked' })
      detailMap.set(d.user_dni, arr)
    }

    return users.rows.map(r => {
      const det = detailMap.get(r.user_dni) ?? []
      return {
        userDni: r.user_dni,
        userName: r.user_name || 'Sin nombre',
        ordenes: Number(r.ordenes),
        bloqueados: det.filter(d => d.bloqueado).length,
        primera: r.primera,
        ultima: r.ultima,
        cantTiendas: Number(r.cant_tiendas),
        detalles: det,
      }
    })
  } finally {
    client.release()
  }
}

export interface AlertaTiendaDNIUser {
  userDni: string
  userName: string
  ordenes: number
  bloqueados: number
}

export interface AlertaTiendaDNI {
  storeName: string
  clientId: string
  usuariosMulti: number
  ordenesDeMulti: number
  bloqueadosTotal: number
  usuarios: AlertaTiendaDNIUser[]
}

export async function fetchAlertasTiendaDNI(): Promise<AlertaTiendaDNI[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    // Solo terceros (excluir client_ids propios)
    const res = await client.query<{
      store_name: string; client_id: string; user_dni: string; user_name: string; ordenes: string; bloqueados: string
    }>(
      `WITH multi AS (
        SELECT user_dni FROM gocuotas_orders
        WHERE order_delivered_at IS NOT NULL AND order_discarded_at IS NULL AND user_dni IS NOT NULL
          AND client_id::text NOT IN (${SQL_IDS_PROPIOS})
        GROUP BY user_dni HAVING COUNT(*) >= 2
      )
      SELECT o.store_name, o.client_id::text AS client_id,
        o.user_dni::text AS user_dni, o.user_name,
        COUNT(*)::text AS ordenes,
        COUNT(*) FILTER (WHERE d.trustonic_status::text = 'locked')::text AS bloqueados
      FROM gocuotas_orders o
      JOIN multi m ON o.user_dni = m.user_dni
      LEFT JOIN devices d ON d.order_id = o.order_id::text
      WHERE o.order_delivered_at IS NOT NULL AND o.order_discarded_at IS NULL
        AND o.client_id::text NOT IN (${SQL_IDS_PROPIOS})
      GROUP BY o.store_name, o.client_id, o.user_dni, o.user_name
      ORDER BY o.store_name, COUNT(*) DESC`
    )

    const map = new Map<string, AlertaTiendaDNI>()
    for (const r of res.rows) {
      const key = r.store_name
      const existing = map.get(key)
      const user: AlertaTiendaDNIUser = {
        userDni: r.user_dni,
        userName: r.user_name || 'Sin nombre',
        ordenes: Number(r.ordenes),
        bloqueados: Number(r.bloqueados),
      }
      if (existing) {
        existing.usuarios.push(user)
        existing.usuariosMulti = new Set(existing.usuarios.map(u => u.userDni)).size
        existing.ordenesDeMulti += Number(r.ordenes)
        existing.bloqueadosTotal += Number(r.bloqueados)
      } else {
        map.set(key, {
          storeName: r.store_name,
          clientId: r.client_id,
          usuariosMulti: 1,
          ordenesDeMulti: Number(r.ordenes),
          bloqueadosTotal: Number(r.bloqueados),
          usuarios: [user],
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => b.usuariosMulti - a.usuariosMulti)
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Alerta 5: Órdenes de terceros sin IMEI asignado
// ---------------------------------------------------------------------------

export interface AlertaSinImeiOrden {
  orderId: string
  userDni: string
  userName: string
  fecha: string
  monto: number
}

export interface AlertaSinImeiTienda {
  storeName: string
  clientId: string
  sinImei: number
  total: number
  ordenes: AlertaSinImeiOrden[]
}

export async function fetchAlertasSinImei(): Promise<AlertaSinImeiTienda[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{
      store_name: string; client_id: string; order_id: string;
      user_dni: string; user_name: string; fecha: string; monto: string
    }>(
      `SELECT o.store_name, o.client_id::text AS client_id,
        o.order_id::text AS order_id,
        COALESCE(o.user_dni::text, '') AS user_dni,
        COALESCE(o.user_name, 'Sin nombre') AS user_name,
        o.order_created_at::date::text AS fecha,
        o.total_order_amount::text AS monto
      FROM gocuotas_orders o
      LEFT JOIN devices d ON d.order_id = o.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.client_id::text NOT IN (${SQL_IDS_PROPIOS})
        AND d.imei IS NULL
      ORDER BY o.store_name, o.order_created_at DESC`
    )

    const map = new Map<string, AlertaSinImeiTienda>()
    for (const r of res.rows) {
      let monto = Number(r.monto)
      if (monto > 5000000) monto = monto / 100
      const key = r.store_name
      const orden: AlertaSinImeiOrden = {
        orderId: r.order_id, userDni: r.user_dni, userName: r.user_name,
        fecha: r.fecha, monto,
      }
      const existing = map.get(key)
      if (existing) {
        existing.sinImei++
        existing.ordenes.push(orden)
      } else {
        map.set(key, {
          storeName: r.store_name, clientId: r.client_id,
          sinImei: 1, total: 0, ordenes: [orden],
        })
      }
    }

    // Traer totales por tienda para contexto
    const totRes = await client.query<{ store_name: string; total: string }>(
      `SELECT o.store_name, COUNT(*)::text AS total
       FROM gocuotas_orders o
       WHERE o.order_delivered_at IS NOT NULL AND o.order_discarded_at IS NULL
         AND o.client_id::text NOT IN (${SQL_IDS_PROPIOS})
       GROUP BY o.store_name`
    )
    for (const r of totRes.rows) {
      const t = map.get(r.store_name)
      if (t) t.total = Number(r.total)
    }

    return Array.from(map.values()).sort((a, b) => b.sinImei - a.sinImei)
  } finally {
    client.release()
  }
}
