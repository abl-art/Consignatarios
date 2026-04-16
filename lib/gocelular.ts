import { Client } from 'pg'

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
 * GOcelular registra la relación pedido → IMEI en dos lugares posibles:
 * 1. `inventory_items.assigned_to_order_id` (flujo histórico, equipos propios)
 * 2. `gocuotas_orders.cancelled_device_imei` (flujo retail/consignación — el
 *    nombre es confuso pero contiene el IMEI del equipo del pedido activo)
 *
 * Esta query hace UNION de ambas fuentes y devuelve ventas únicas.
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
    const excludeClause = params.alreadySyncedSaleIds.length > 0
      ? 'AND go.order_id != ALL($2)'
      : ''

    const sql = `
      SELECT * FROM (
        -- Fuente 1: inventory_items vinculado al pedido
        SELECT ii.imei,
               ii.price,
               dm.default_price,
               (go.total_order_amount / 100.0) AS total_order_amount,
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
          ${excludeClause}

        UNION

        -- Fuente 2: IMEI en la orden (gocuotas_orders.cancelled_device_imei)
        SELECT go.cancelled_device_imei AS imei,
               ii.price,
               dm.default_price,
               (go.total_order_amount / 100.0) AS total_order_amount,
               COALESCE(go.order_delivered_at, go.created_at)::text AS assigned_at,
               go.order_id AS assigned_to_order_id,
               go.store_name,
               COALESCE(go.order_created_at, go.created_at)::text AS order_created_at
        FROM gocuotas_orders go
        LEFT JOIN inventory_items ii ON ii.imei = go.cancelled_device_imei
        LEFT JOIN device_models dm ON dm.model_code = ii.model_code
        WHERE go.order_discarded_at IS NULL
          AND go.cancelled_device_imei IS NOT NULL
          AND go.cancelled_device_imei = ANY($1)
          ${excludeClause}
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
