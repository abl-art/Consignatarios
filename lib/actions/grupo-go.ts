'use server'

import { getGocuotasPool } from '@/lib/db-pool'

export interface ModeloOperaciones {
  modelo: string
  cantidad: number
  monto: number
  usuarios_activados: number
}

export interface GrupoGoData {
  modelos: ModeloOperaciones[]
  total_cantidad: number
  total_monto: number
  facturacion: number
  usuarios_registrados: number
  usuarios_activados: number
  tipo_cambio: number
}

const MODELOS = [
  { name: 'GOcuotas', table: 'orders' },
  { name: 'GOPremium', table: 'premium_orders' },
  { name: 'GOAdelantos', table: 'go_adelantos_orders' },
  { name: 'GOTarjeta', table: 'go_tarjeta_orders' },
  { name: 'GOBig', table: 'go_big_orders' },
  { name: 'GOQr', table: 'go_qr_orders' },
  { name: 'GOPlus', table: 'go_plus_orders' },
]

export async function fetchGrupoGoOperaciones(desde?: string, hasta?: string): Promise<GrupoGoData> {
  const empty: GrupoGoData = { modelos: [], total_cantidad: 0, total_monto: 0, facturacion: 0, usuarios_registrados: 0, usuarios_activados: 0, tipo_cambio: 1500 }
  const pool = getGocuotasPool()
  if (!pool) return empty

  const client = await pool.connect()
  try {
    const modelos: ModeloOperaciones[] = []

    for (const m of MODELOS) {
      let dateFilter = ''
      const params: string[] = []

      if (desde) {
        params.push(desde)
        dateFilter += ` AND delivered_at >= $${params.length}::timestamp`
      }
      if (hasta) {
        params.push(hasta + ' 23:59:59')
        dateFilter += ` AND delivered_at <= $${params.length}::timestamp`
      }

      const res = await client.query<{ cnt: string; monto: string }>(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_in_cents), 0) AS monto
         FROM ${m.table}
         WHERE delivered_at IS NOT NULL
           AND discarded_at IS NULL${dateFilter}`,
        params
      )

      // Usuarios activados: primera orden delivered en este modelo cae en el período
      let activDateFilter = ''
      const activParams: string[] = []
      if (desde) {
        activParams.push(desde)
        activDateFilter += ` AND first_order >= $${activParams.length}::timestamp`
      }
      if (hasta) {
        activParams.push(hasta + ' 23:59:59')
        activDateFilter += ` AND first_order <= $${activParams.length}::timestamp`
      }
      const activRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM (
          SELECT user_id, MIN(delivered_at) AS first_order
          FROM ${m.table}
          WHERE delivered_at IS NOT NULL AND discarded_at IS NULL
          GROUP BY user_id
        ) sub WHERE 1=1${activDateFilter}`,
        activParams
      )

      const cantidad = Number(res.rows[0].cnt)
      const monto = Number(res.rows[0].monto) / 100
      const usuarios_activados = Number(activRes.rows[0].cnt)

      modelos.push({ modelo: m.name, cantidad, monto, usuarios_activados })
    }

    // GOcelular: orders from GOcelular stores (subset of GOcuotas orders)
    {
      let dateFilter = ''
      const params: string[] = []

      if (desde) {
        params.push(desde)
        dateFilter += ` AND o.delivered_at >= $${params.length}::timestamp`
      }
      if (hasta) {
        params.push(hasta + ' 23:59:59')
        dateFilter += ` AND o.delivered_at <= $${params.length}::timestamp`
      }

      const res = await client.query<{ cnt: string; monto: string }>(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(o.amount_in_cents), 0) AS monto
         FROM orders o
         WHERE o.delivered_at IS NOT NULL
           AND o.discarded_at IS NULL
           AND o.client_id IN (1, 2026134, 2461631, 5495277, 6033574, 6115009)${dateFilter}`,
        params
      )

      let activDateFilter = ''
      const activParams: string[] = []
      if (desde) {
        activParams.push(desde)
        activDateFilter += ` AND first_order >= $${activParams.length}::timestamp`
      }
      if (hasta) {
        activParams.push(hasta + ' 23:59:59')
        activDateFilter += ` AND first_order <= $${activParams.length}::timestamp`
      }
      const activRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM (
          SELECT user_id, MIN(delivered_at) AS first_order
          FROM orders
          WHERE delivered_at IS NOT NULL AND discarded_at IS NULL
            AND client_id IN (1, 2026134, 2461631, 5495277, 6033574, 6115009)
          GROUP BY user_id
        ) sub WHERE 1=1${activDateFilter}`,
        activParams
      )

      modelos.push({
        modelo: 'GOcelular',
        cantidad: Number(res.rows[0].cnt),
        monto: Number(res.rows[0].monto) / 100,
        usuarios_activados: Number(activRes.rows[0].cnt),
      })
    }

    // Facturación: invoices (facturas A=1 y B=6) + GOcelular propias (monto total orden)
    {
      let dateFilter = ''
      const params: string[] = []

      if (desde) {
        params.push(desde)
        dateFilter += ` AND created_at >= $${params.length}::timestamp`
      }
      if (hasta) {
        params.push(hasta + ' 23:59:59')
        dateFilter += ` AND created_at <= $${params.length}::timestamp`
      }

      const invRes = await client.query<{ monto: string }>(
        `SELECT COALESCE(SUM(net_amount_in_cents), 0) AS monto
         FROM invoices
         WHERE kind IN (1, 6, 19)${dateFilter}`,
        params
      )
      const montoInvoices = Number(invRes.rows[0].monto) / 100

      // GOcelular propias: monto total de la orden = facturación directa
      let dateFilterGC = ''
      const paramsGC: string[] = []
      if (desde) {
        paramsGC.push(desde)
        dateFilterGC += ` AND o.delivered_at >= $${paramsGC.length}::timestamp`
      }
      if (hasta) {
        paramsGC.push(hasta + ' 23:59:59')
        dateFilterGC += ` AND o.delivered_at <= $${paramsGC.length}::timestamp`
      }

      const gcRes = await client.query<{ monto: string }>(
        `SELECT COALESCE(SUM(o.amount_in_cents), 0) AS monto
         FROM orders o
         WHERE o.delivered_at IS NOT NULL
           AND o.discarded_at IS NULL
           AND o.client_id IN (2026134, 2461631)${dateFilterGC}`,
        paramsGC
      )
      const montoGCPropias = Math.round(Number(gcRes.rows[0].monto) / 100 / 1.21)

      var facturacion = montoInvoices + montoGCPropias
    }

    // Usuarios registrados
    {
      let dateFilter = ''
      const params: string[] = []
      if (desde) {
        params.push(desde)
        dateFilter += ` AND created_at >= $${params.length}::timestamp`
      }
      if (hasta) {
        params.push(hasta + ' 23:59:59')
        dateFilter += ` AND created_at <= $${params.length}::timestamp`
      }
      const res = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM users WHERE discarded_at IS NULL${dateFilter}`,
        params
      )
      var usuarios_registrados = Number(res.rows[0].cnt)
    }

    // Usuarios activados (primera orden delivered en el período)
    {
      let dateFilter = ''
      const params: string[] = []
      if (desde) {
        params.push(desde)
        dateFilter += ` AND first_order >= $${params.length}::timestamp`
      }
      if (hasta) {
        params.push(hasta + ' 23:59:59')
        dateFilter += ` AND first_order <= $${params.length}::timestamp`
      }
      // Union all order tables to find first delivered order per user
      const res = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM (
          SELECT user_id, MIN(delivered_at) AS first_order FROM (
            SELECT user_id, delivered_at FROM orders WHERE delivered_at IS NOT NULL AND discarded_at IS NULL
            UNION ALL SELECT user_id, delivered_at FROM premium_orders WHERE delivered_at IS NOT NULL AND discarded_at IS NULL
            UNION ALL SELECT user_id, delivered_at FROM go_adelantos_orders WHERE delivered_at IS NOT NULL AND discarded_at IS NULL
            UNION ALL SELECT user_id, delivered_at FROM go_tarjeta_orders WHERE delivered_at IS NOT NULL AND discarded_at IS NULL
            UNION ALL SELECT user_id, delivered_at FROM go_big_orders WHERE delivered_at IS NOT NULL AND discarded_at IS NULL
            UNION ALL SELECT user_id, delivered_at FROM go_qr_orders WHERE delivered_at IS NOT NULL AND discarded_at IS NULL
            UNION ALL SELECT user_id, delivered_at FROM go_plus_orders WHERE delivered_at IS NOT NULL AND discarded_at IS NULL
          ) all_orders
          GROUP BY user_id
        ) first_orders
        WHERE 1=1${dateFilter}`,
        params
      )
      var usuarios_activados = Number(res.rows[0].cnt)
    }

    const total_cantidad = modelos.reduce((s, m) => s + m.cantidad, 0)
    const total_monto = modelos.reduce((s, m) => s + m.monto, 0)

    // Tipo de cambio from config_resultado
    const { fetchConfig } = await import('@/lib/actions/resultado')
    const config = await fetchConfig()
    const tipo_cambio = config.tipo_cambio

    return { modelos, total_cantidad, total_monto, facturacion, usuarios_registrados, usuarios_activados, tipo_cambio }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Transaccionalidad por cliente: top 50 client_id de orders (GOcuotas)
// ---------------------------------------------------------------------------

export interface ClienteTransaccional {
  client_id: number
  client_name: string
  transacciones: number
  comision: number
  ticket_promedio: number
  cuotas_promedio: number
  dias_pago: number | null
}

export async function fetchTopClientes(desde?: string, hasta?: string): Promise<ClienteTransaccional[]> {
  const pool = getGocuotasPool()
  if (!pool) return []

  // Cap duro: nunca consultar más atrás de 12 meses
  const limite = new Date()
  limite.setMonth(limite.getMonth() - 12)
  const limiteStr = limite.toISOString().slice(0, 10)
  const desdeFinal = desde && desde > limiteStr ? desde : limiteStr

  const client = await pool.connect()
  try {
    const params: string[] = [desdeFinal]
    let dateFilter = ' AND o.delivered_at >= $1::timestamp'
    if (hasta) {
      params.push(hasta + ' 23:59:59')
      dateFilter += ` AND o.delivered_at <= $${params.length}::timestamp`
    }

    const res = await client.query<{
      client_id: string
      client_name: string
      transacciones: string
      comision: string
      ticket_promedio: string
      cuotas_promedio: string
      dias_pago: number | null
    }>(
      `SELECT o.client_id,
              COALESCE(NULLIF(TRIM(u.business_name), ''), u.name) AS client_name,
              COUNT(*) AS transacciones,
              COALESCE(SUM(o.commission_amount_in_cents), 0) / 100.0 AS comision,
              COALESCE(AVG(o.amount_in_cents), 0) / 100.0 AS ticket_promedio,
              COALESCE(AVG(o.number_of_installments), 0) AS cuotas_promedio,
              u.business_days_to_expense_payment AS dias_pago
       FROM orders o
       JOIN users u ON u.id = o.client_id
       WHERE o.delivered_at IS NOT NULL
         AND o.discarded_at IS NULL${dateFilter}
       GROUP BY o.client_id, 2, u.business_days_to_expense_payment
       ORDER BY transacciones DESC
       LIMIT 50`,
      params
    )

    return res.rows.map(r => ({
      client_id: Number(r.client_id),
      client_name: r.client_name || `Cliente ${r.client_id}`,
      transacciones: Number(r.transacciones),
      comision: Number(r.comision),
      ticket_promedio: Number(r.ticket_promedio),
      cuotas_promedio: Number(r.cuotas_promedio),
      dias_pago: r.dias_pago === null ? null : Number(r.dias_pago),
    }))
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Chart data: monthly series per model
// ---------------------------------------------------------------------------

export interface ChartDayRow {
  dia: string
  [modelo: string]: string | number // modelo names as keys
}

const ALL_MODELOS = [
  ...MODELOS,
  { name: 'GOcelular', table: 'orders', clientFilter: ' AND client_id IN (1, 2026134, 2461631, 5495277, 6033574, 6115009)' },
]

export async function fetchGrupoGoChart(desde?: string, hasta?: string): Promise<ChartDayRow[]> {
  const pool = getGocuotasPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    // Collect daily data per model
    const dailyMap = new Map<string, Record<string, number>>()

    for (const m of ALL_MODELOS) {
      let dateFilter = ''
      const params: string[] = []
      const alias = 'table' in m && 'clientFilter' in m ? 'o' : ''
      const prefix = alias ? `${alias}.` : ''
      const extra = ('clientFilter' in m ? (m as { clientFilter: string }).clientFilter : '')

      if (desde) {
        params.push(desde)
        dateFilter += ` AND ${prefix}delivered_at >= $${params.length}::timestamp`
      }
      if (hasta) {
        params.push(hasta + ' 23:59:59')
        dateFilter += ` AND ${prefix}delivered_at <= $${params.length}::timestamp`
      }

      const fromClause = alias ? `${m.table} ${alias}` : m.table
      const res = await client.query<{ mes: Date; ops: string; monto: string }>(
        `SELECT date_trunc('month', ${prefix}delivered_at)::date AS mes, COUNT(*) AS ops, COALESCE(SUM(${prefix}amount_in_cents), 0) AS monto
         FROM ${fromClause}
         WHERE ${prefix}delivered_at IS NOT NULL AND ${prefix}discarded_at IS NULL${extra}${dateFilter}
         GROUP BY 1 ORDER BY 1`,
        params
      )

      for (const row of res.rows) {
        const mesStr = row.mes instanceof Date ? row.mes.toISOString().slice(0, 7) : String(row.mes).slice(0, 7)
        if (!dailyMap.has(mesStr)) dailyMap.set(mesStr, {})
        const entry = dailyMap.get(mesStr)!
        entry[`${m.name}_ops`] = Number(row.ops)
        entry[`${m.name}_monto`] = Number(row.monto) / 100
      }
    }

    // Add new users per day per model
    for (const m of ALL_MODELOS) {
      let dateFilter = ''
      const params: string[] = []
      const extra = ('clientFilter' in m ? (m as { clientFilter: string }).clientFilter.replace('client_id', 'o.client_id') : '')
      const fromClause = 'clientFilter' in m ? `${m.table} o` : m.table

      if (desde) {
        params.push(desde)
        dateFilter += ` AND first_order >= $${params.length}::timestamp`
      }
      if (hasta) {
        params.push(hasta + ' 23:59:59')
        dateFilter += ` AND first_order <= $${params.length}::timestamp`
      }

      const prefix = 'clientFilter' in m ? 'o.' : ''
      const res = await client.query<{ mes: Date; cnt: string }>(
        `SELECT date_trunc('month', first_order)::date AS mes, COUNT(*) AS cnt FROM (
          SELECT user_id, MIN(${prefix}delivered_at) AS first_order
          FROM ${fromClause}
          WHERE ${prefix}delivered_at IS NOT NULL AND ${prefix}discarded_at IS NULL${extra}
          GROUP BY user_id
        ) sub WHERE 1=1${dateFilter}
        GROUP BY 1 ORDER BY 1`,
        params
      )

      for (const row of res.rows) {
        const mesStr = row.mes instanceof Date ? row.mes.toISOString().slice(0, 7) : String(row.mes).slice(0, 7)
        if (!dailyMap.has(mesStr)) dailyMap.set(mesStr, {})
        dailyMap.get(mesStr)![`${m.name}_usuarios`] = Number(row.cnt)
      }
    }

    // Build sorted array
    return [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, data]) => ({ dia, ...data }))
  } finally {
    client.release()
  }
}
