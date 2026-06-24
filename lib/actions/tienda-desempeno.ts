'use server'

import { getPool } from '@/lib/db-pool'

export interface CanalStats {
  canal: string
  touches: number
  visitors: number
  orders: number
  orders_paid: number
  orders_cancelled: number
  revenue: number
}

export interface TiendaProducto {
  product_name: string
  paid: number
  revenue: number
}

export interface TiendaDesempenoData {
  canales: CanalStats[]
  productos: TiendaProducto[]
  totals: {
    touches: number
    visitors: number
    orders: number
    orders_paid: number
    orders_cancelled: number
    revenue: number
    conversion_touch_visitor: number
    conversion_visitor_order: number
    conversion_order_paid: number
    conversion_touch_paid: number
  }
}

const EMPTY_DATA: TiendaDesempenoData = {
  canales: [], productos: [],
  totals: {
    touches: 0, visitors: 0, orders: 0, orders_paid: 0, orders_cancelled: 0, revenue: 0,
    conversion_touch_visitor: 0, conversion_visitor_order: 0, conversion_order_paid: 0, conversion_touch_paid: 0,
  },
}

const CANAL_CASE = `
  CASE
    WHEN utm_source = 'gocuotas' AND utm_medium = 'stores' THEN 'GOcuotas Stores'
    WHEN utm_source = 'gocuotas' AND utm_medium = 'banner' THEN 'GOcuotas Banner'
    WHEN utm_source = 'gocuotas' AND utm_medium = 'landing' THEN 'GOcuotas Landing'
    WHEN utm_source = 'gocuotas' AND utm_medium = 'mailing' THEN 'GOcuotas Mailing'
    WHEN utm_source = 'gocuotas' AND utm_medium = 'redes' THEN 'GOcuotas Redes'
    WHEN utm_source = 'gocuotas' THEN 'GOcuotas Otro'
    WHEN utm_source = 'meta' OR fbclid IS NOT NULL THEN 'Meta Ads'
    WHEN utm_source = 'redes' THEN 'Redes orgánicas'
    WHEN utm_source IS NULL AND fbclid IS NULL AND gclid IS NULL THEN 'Orgánico / Directo'
    ELSE 'Otro'
  END
`

export async function fetchTiendaDesempeno(desde: string, hasta: string): Promise<TiendaDesempenoData> {
  const pool = getPool()
  if (!pool) return EMPTY_DATA

  const client = await pool.connect()
  try {
    // Query 1 — Touches + visitors per channel
    const touchesRes = await client.query<{ canal: string; touches: string; visitors: string }>(
      `SELECT ${CANAL_CASE} AS canal,
        COUNT(*)::int AS touches,
        COUNT(DISTINCT visitor_id)::int AS visitors
      FROM affiliate_touches
      WHERE partner_slug IS NULL
        AND occurred_at >= $1::date AND occurred_at < ($2::date + 1)
      GROUP BY canal
      ORDER BY touches DESC`,
      [desde, hasta]
    )

    // Query 2 — Orders + paid per channel (via first touch visitor_id)
    const ordersRes = await client.query<{ canal: string; orders: string; paid: string; cancelled: string; revenue: string }>(
      `WITH first_touch AS (
        SELECT DISTINCT ON (visitor_id)
          visitor_id,
          ${CANAL_CASE} AS canal
        FROM affiliate_touches
        WHERE partner_slug IS NULL
          AND occurred_at >= $1::date AND occurred_at < ($2::date + 1)
        ORDER BY visitor_id, occurred_at ASC
      )
      SELECT
        ft.canal,
        COUNT(DISTINCT so.id)::int AS orders,
        COUNT(DISTINCT so.id) FILTER (WHERE so.status = 'paid')::int AS paid,
        COUNT(DISTINCT so.id) FILTER (WHERE so.status = 'cancelled')::int AS cancelled,
        COALESCE(SUM(so.product_price / 100) FILTER (WHERE so.status = 'paid'), 0)::numeric AS revenue
      FROM first_touch ft
      JOIN store_orders so ON so.visitor_id = ft.visitor_id
        AND so.attributed_partner_id IS NULL
        AND so.created_at >= $1::date AND so.created_at < ($2::date + 1)
      GROUP BY ft.canal
      ORDER BY orders DESC`,
      [desde, hasta]
    )

    // Query 3 — Top products with paid orders (no partner)
    const prodRes = await client.query<{ product_name: string; paid: string; revenue: string }>(
      `SELECT product_name,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
        COALESCE(SUM(product_price / 100) FILTER (WHERE status = 'paid'), 0)::numeric AS revenue
      FROM store_orders
      WHERE attributed_partner_id IS NULL
        AND created_at >= $1::date AND created_at < ($2::date + 1)
        AND status = 'paid'
      GROUP BY product_name
      ORDER BY paid DESC
      LIMIT 15`,
      [desde, hasta]
    )

    // Merge touches + orders by canal
    const ordersMap = new Map<string, { orders: number; paid: number; cancelled: number; revenue: number }>()
    for (const r of ordersRes.rows) {
      ordersMap.set(r.canal, { orders: Number(r.orders), paid: Number(r.paid), cancelled: Number(r.cancelled), revenue: Number(r.revenue) })
    }

    const canales: CanalStats[] = touchesRes.rows.map(r => {
      const o = ordersMap.get(r.canal)
      return {
        canal: r.canal,
        touches: Number(r.touches),
        visitors: Number(r.visitors),
        orders: o?.orders ?? 0,
        orders_paid: o?.paid ?? 0,
        orders_cancelled: o?.cancelled ?? 0,
        revenue: o?.revenue ?? 0,
      }
    })

    const productos: TiendaProducto[] = prodRes.rows.map(r => ({
      product_name: r.product_name,
      paid: Number(r.paid),
      revenue: Number(r.revenue),
    }))

    const totalTouches = canales.reduce((s, c) => s + c.touches, 0)
    const totalVisitors = canales.reduce((s, c) => s + c.visitors, 0)
    const totalOrders = canales.reduce((s, c) => s + c.orders, 0)
    const totalPaid = canales.reduce((s, c) => s + c.orders_paid, 0)
    const totalCancelled = canales.reduce((s, c) => s + c.orders_cancelled, 0)
    const totalRevenue = canales.reduce((s, c) => s + c.revenue, 0)

    return {
      canales,
      productos,
      totals: {
        touches: totalTouches,
        visitors: totalVisitors,
        orders: totalOrders,
        orders_paid: totalPaid,
        orders_cancelled: totalCancelled,
        revenue: totalRevenue,
        conversion_touch_visitor: totalTouches > 0 ? (totalVisitors / totalTouches) * 100 : 0,
        conversion_visitor_order: totalVisitors > 0 ? (totalOrders / totalVisitors) * 100 : 0,
        conversion_order_paid: totalOrders > 0 ? (totalPaid / totalOrders) * 100 : 0,
        conversion_touch_paid: totalTouches > 0 ? (totalPaid / totalTouches) * 100 : 0,
      },
    }
  } finally {
    client.release()
  }
}
