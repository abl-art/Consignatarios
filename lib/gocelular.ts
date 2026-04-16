import { Client } from 'pg'

export interface GocelularSale {
  imei: string
  price: number | null
  default_price: number | null
  assigned_at: string
  assigned_to_order_id: string
  store_name: string
  order_created_at: string
}

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
    const baseSql = `
      SELECT ii.imei,
             ii.price,
             dm.default_price,
             ii.assigned_at::text AS assigned_at,
             ii.assigned_to_order_id,
             go.store_name,
             go.order_created_at::text AS order_created_at
      FROM inventory_items ii
      JOIN gocuotas_orders go ON go.order_id = ii.assigned_to_order_id
      LEFT JOIN device_models dm ON dm.model_code = ii.model_code
      WHERE ii.status = 'assigned'
        AND go.order_discarded_at IS NULL
        AND ii.imei = ANY($1)
    `
    const sql = params.alreadySyncedSaleIds.length > 0
      ? `${baseSql} AND ii.assigned_to_order_id != ALL($2)`
      : baseSql
    const values = params.alreadySyncedSaleIds.length > 0
      ? [params.ourImeis, params.alreadySyncedSaleIds]
      : [params.ourImeis]

    const res = await client.query<GocelularSale>(sql, values)
    return res.rows
  } finally {
    await client.end()
  }
}
