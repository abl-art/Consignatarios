import { Client } from 'pg'

export interface VentaDiaria {
  store_name: string
  ventas: number
  monto: number
}

/**
 * Ventas de hoy agrupadas por store_name (para el dashboard admin).
 */
export async function fetchVentasHoy(): Promise<VentaDiaria[]> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return []

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query<{ store_name: string; ventas: string; monto: string }>(
      `SELECT go.store_name, COUNT(*)::text AS ventas, COALESCE(SUM(go.total_order_amount), 0)::text AS monto
       FROM gocuotas_orders go
       WHERE go.order_discarded_at IS NULL
         AND go.created_at::date = CURRENT_DATE
       GROUP BY go.store_name
       ORDER BY ventas DESC`
    )
    return res.rows.map((r) => ({
      store_name: r.store_name,
      ventas: Number(r.ventas),
      monto: Number(r.monto),
    }))
  } finally {
    await client.end()
  }
}

/**
 * Dado un array de order_ids ya sincronizados, devuelve los que fueron
 * anulados en GOcelular (order_discarded_at IS NOT NULL).
 */
export async function fetchAnuladas(orderIds: string[]): Promise<string[]> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url || orderIds.length === 0) return []

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query<{ order_id: string }>(
      `SELECT order_id FROM gocuotas_orders
       WHERE order_id = ANY($1) AND order_discarded_at IS NOT NULL`,
      [orderIds]
    )
    return res.rows.map((r) => r.order_id)
  } finally {
    await client.end()
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
  const url = process.env.GOCELULAR_DB_URL
  if (!url) throw new Error('GOCELULAR_DB_URL no configurada')

  if (params.ourImeis.length === 0) return []

  const client = new Client({ connectionString: url })
  await client.connect()
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
    await client.end()
  }
}
