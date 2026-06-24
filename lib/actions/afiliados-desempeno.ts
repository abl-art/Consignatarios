'use server'

import { getPool } from '@/lib/db-pool'

export interface AfiliadoStats {
  partner_slug: string
  display_name: string
  commission_type: string | null
  commission_value: number | null
  touches: number
  visitors: number
  orders: number
  orders_paid: number
  orders_cancelled: number
  orders_redirected: number
  revenue_paid: number
  revenue_total: number
  commission_estimated: number
}

export interface AfiliadoProducto {
  product_name: string
  partner_slug: string
  orders: number
  paid: number
  cancelled: number
  revenue: number
}

export interface DesempenoData {
  partners: AfiliadoStats[]
  productos: AfiliadoProducto[]
  totals: {
    touches: number
    visitors: number
    orders: number
    orders_paid: number
    orders_cancelled: number
    revenue_paid: number
    revenue_total: number
    commission_estimated: number
    conversion_touch_order: number
    conversion_order_paid: number
    conversion_touch_paid: number
  }
}

const EMPTY_DATA: DesempenoData = {
  partners: [],
  productos: [],
  totals: {
    touches: 0, visitors: 0, orders: 0, orders_paid: 0, orders_cancelled: 0,
    revenue_paid: 0, revenue_total: 0, commission_estimated: 0,
    conversion_touch_order: 0, conversion_order_paid: 0, conversion_touch_paid: 0,
  },
}

// Partners excluidos (test/prueba)
const PARTNERS_EXCLUIDOS = ['smoke']

export async function fetchDesempenoAfiliados(desde: string, hasta: string): Promise<DesempenoData> {
  const pool = getPool()
  if (!pool) return EMPTY_DATA

  const client = await pool.connect()
  try {
    // Query 1 — Partner stats
    const partnersRes = await client.query<AfiliadoStats>(
      `
      SELECT
        ap.slug AS partner_slug,
        ap.display_name,
        ap.commission_type,
        ap.commission_value,
        COALESCE(t.touches, 0)::int AS touches,
        COALESCE(t.visitors, 0)::int AS visitors,
        COALESCE(o.orders, 0)::int AS orders,
        COALESCE(o.orders_paid, 0)::int AS orders_paid,
        COALESCE(o.orders_cancelled, 0)::int AS orders_cancelled,
        COALESCE(o.orders_redirected, 0)::int AS orders_redirected,
        COALESCE(o.revenue_paid, 0)::numeric AS revenue_paid,
        COALESCE(o.revenue_total, 0)::numeric AS revenue_total,
        CASE
          WHEN ap.commission_type = 'percent'
            THEN (COALESCE(o.revenue_paid, 0) / 1.21) * COALESCE(ap.commission_value, 0) / 100
          ELSE 0
        END::numeric AS commission_estimated
      FROM affiliate_partners ap
      LEFT JOIN (
        SELECT partner_slug, COUNT(*)::int AS touches, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM affiliate_touches
        WHERE occurred_at >= $1::date AND occurred_at < ($2::date + 1)
        GROUP BY partner_slug
      ) t ON t.partner_slug = ap.slug
      LEFT JOIN (
        SELECT
          ap2.slug AS partner_slug,
          COUNT(*)::int AS orders,
          COUNT(*) FILTER (WHERE so.status = 'paid')::int AS orders_paid,
          COUNT(*) FILTER (WHERE so.status = 'cancelled')::int AS orders_cancelled,
          COUNT(*) FILTER (WHERE so.status = 'redirected_to_payment')::int AS orders_redirected,
          COALESCE(SUM(so.product_price / 100) FILTER (WHERE so.status = 'paid'), 0)::numeric AS revenue_paid,
          COALESCE(SUM(so.product_price / 100), 0)::numeric AS revenue_total
        FROM store_orders so
        JOIN affiliate_partners ap2 ON ap2.id = so.attributed_partner_id
        WHERE so.created_at >= $1::date AND so.created_at < ($2::date + 1)
        GROUP BY ap2.slug
      ) o ON o.partner_slug = ap.slug
      WHERE ap.slug != ALL($3)
      ORDER BY touches DESC, orders DESC
      `,
      [desde, hasta, PARTNERS_EXCLUIDOS]
    )

    // Query 2 — Product breakdown (top 20)
    const productosRes = await client.query<AfiliadoProducto>(
      `
      SELECT so.product_name, ap.slug AS partner_slug,
        COUNT(*)::int AS orders,
        COUNT(*) FILTER (WHERE so.status = 'paid')::int AS paid,
        COUNT(*) FILTER (WHERE so.status = 'cancelled')::int AS cancelled,
        COALESCE(SUM(so.product_price / 100) FILTER (WHERE so.status = 'paid'), 0)::numeric AS revenue
      FROM store_orders so
      JOIN affiliate_partners ap ON ap.id = so.attributed_partner_id
      WHERE so.created_at >= $1::date AND so.created_at < ($2::date + 1)
        AND ap.slug != ALL($3)
      GROUP BY so.product_name, ap.slug
      ORDER BY orders DESC
      LIMIT 20
      `,
      [desde, hasta, PARTNERS_EXCLUIDOS]
    )

    const partners: AfiliadoStats[] = partnersRes.rows.map((r) => ({
      partner_slug: r.partner_slug,
      display_name: r.display_name,
      commission_type: r.commission_type,
      commission_value: r.commission_value ? parseFloat(String(r.commission_value)) : null,
      touches: Number(r.touches),
      visitors: Number(r.visitors),
      orders: Number(r.orders),
      orders_paid: Number(r.orders_paid),
      orders_cancelled: Number(r.orders_cancelled),
      orders_redirected: Number(r.orders_redirected),
      revenue_paid: Number(r.revenue_paid),
      revenue_total: Number(r.revenue_total),
      commission_estimated: Number(r.commission_estimated),
    }))

    const productos: AfiliadoProducto[] = productosRes.rows.map((r) => ({
      product_name: r.product_name,
      partner_slug: r.partner_slug,
      orders: Number(r.orders),
      paid: Number(r.paid),
      cancelled: Number(r.cancelled),
      revenue: Number(r.revenue),
    }))

    // Calculate totals
    const totalTouches = partners.reduce((s, p) => s + p.touches, 0)
    const totalVisitors = partners.reduce((s, p) => s + p.visitors, 0)
    const totalOrders = partners.reduce((s, p) => s + p.orders, 0)
    const totalPaid = partners.reduce((s, p) => s + p.orders_paid, 0)
    const totalCancelled = partners.reduce((s, p) => s + p.orders_cancelled, 0)
    const totalRevenuePaid = partners.reduce((s, p) => s + p.revenue_paid, 0)
    const totalRevenueTotal = partners.reduce((s, p) => s + p.revenue_total, 0)
    const totalCommission = partners.reduce((s, p) => s + p.commission_estimated, 0)

    return {
      partners,
      productos,
      totals: {
        touches: totalTouches,
        visitors: totalVisitors,
        orders: totalOrders,
        orders_paid: totalPaid,
        orders_cancelled: totalCancelled,
        revenue_paid: totalRevenuePaid,
        revenue_total: totalRevenueTotal,
        commission_estimated: totalCommission,
        conversion_touch_order: totalTouches > 0 ? (totalOrders / totalTouches) * 100 : 0,
        conversion_order_paid: totalOrders > 0 ? (totalPaid / totalOrders) * 100 : 0,
        conversion_touch_paid: totalTouches > 0 ? (totalPaid / totalTouches) * 100 : 0,
      },
    }
  } finally {
    client.release()
  }
}
