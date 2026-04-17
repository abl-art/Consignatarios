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
      `SELECT go.store_name, COUNT(*)::text AS ventas, COALESCE(SUM(CASE WHEN go.total_order_amount > 5000000 THEN go.total_order_amount / 100.0 ELSE go.total_order_amount END), 0)::text AS monto
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

export interface ContracargosData {
  monto_contracargos: number
  monto_total_ventas: number
  porcentaje: number
  cantidad: number
}

export async function fetchContracargos(): Promise<ContracargosData> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return { monto_contracargos: 0, monto_total_ventas: 0, porcentaje: 0, cantidad: 0 }

  const client = new Client({ connectionString: url })
  await client.connect()
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
        AND o.client_id::text IN ('1', '2026134', '2461631', '5495277')
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
    await client.end()
  }
}

export interface VentaHistorica {
  fecha: string // YYYY-MM-DD
  store_name: string
  ventas: number
  monto: number
}

/**
 * Ventas historicas agrupadas por fecha y store_name.
 * Devuelve store_name crudo para que el consumidor clasifique por canal.
 */
export async function fetchVentasHistoricas(): Promise<VentaHistorica[]> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return []

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query<{
      fecha: Date
      store_name: string
      ventas: number
      monto: string
    }>(
      `SELECT
        o.order_created_at::date AS fecha,
        o.store_name,
        COUNT(*)::int AS ventas,
        COALESCE(SUM(CASE WHEN o.total_order_amount > 5000000 THEN o.total_order_amount / 100.0 ELSE o.total_order_amount END), 0) AS monto
      FROM gocuotas_orders o
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.client_id::text IN ('1', '2026134', '2461631', '5495277')
      GROUP BY 1, 2
      ORDER BY 1`
    )
    return res.rows.map((r) => ({
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha),
      store_name: r.store_name,
      ventas: r.ventas,
      monto: Number(r.monto),
    }))
  } finally {
    await client.end()
  }
}
