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

export interface AfiliadoDiario {
  fecha: string
  partner_slug: string
  touches: number
  visitors: number
  orders: number
  orders_paid: number
  revenue: number
}

export interface AfiliadoProducto {
  product_name: string
  partner_slug: string
  orders: number
  paid: number
  cancelled: number
  revenue: number
}

export interface AfiliadoAtribucion {
  rule: string
  orders: number
  paid: number
}

export interface DesempenoData {
  partners: AfiliadoStats[]
  diario: AfiliadoDiario[]
  productos: AfiliadoProducto[]
  atribuciones: AfiliadoAtribucion[]
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
  diario: [],
  productos: [],
  atribuciones: [],
  totals: {
    touches: 0,
    visitors: 0,
    orders: 0,
    orders_paid: 0,
    orders_cancelled: 0,
    revenue_paid: 0,
    revenue_total: 0,
    commission_estimated: 0,
    conversion_touch_order: 0,
    conversion_order_paid: 0,
    conversion_touch_paid: 0,
  },
}

export async function fetchDesempenoAfiliados(dias: number = 30): Promise<DesempenoData> {
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
            THEN COALESCE(o.revenue_paid, 0) * COALESCE(ap.commission_value, 0) / 100
          ELSE 0
        END::numeric AS commission_estimated
      FROM affiliate_partners ap
      LEFT JOIN (
        SELECT
          partner_slug,
          COUNT(*)::int AS touches,
          COUNT(DISTINCT visitor_id)::int AS visitors
        FROM affiliate_touches
        WHERE occurred_at >= NOW() - INTERVAL '1 day' * $1
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
        WHERE so.created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY ap2.slug
      ) o ON o.partner_slug = ap.slug
      ORDER BY touches DESC, orders DESC
      `,
      [dias]
    )

    // Query 2 — Daily breakdown
    const diarioRes = await client.query<AfiliadoDiario>(
      `
      SELECT
        d.fecha,
        d.partner_slug,
        COALESCE(t.touches, 0)::int AS touches,
        COALESCE(t.visitors, 0)::int AS visitors,
        COALESCE(o.orders, 0)::int AS orders,
        COALESCE(o.orders_paid, 0)::int AS orders_paid,
        COALESCE(o.revenue, 0)::numeric AS revenue
      FROM (
        SELECT DISTINCT
          d.fecha,
          ap.slug AS partner_slug
        FROM affiliate_partners ap
        CROSS JOIN (
          SELECT generate_series(
            (NOW() - INTERVAL '1 day' * $1)::date,
            CURRENT_DATE,
            '1 day'::interval
          )::date AS fecha
        ) d
      ) d
      LEFT JOIN (
        SELECT
          occurred_at::date AS fecha,
          partner_slug,
          COUNT(*)::int AS touches,
          COUNT(DISTINCT visitor_id)::int AS visitors
        FROM affiliate_touches
        WHERE occurred_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY occurred_at::date, partner_slug
      ) t ON t.fecha = d.fecha AND t.partner_slug = d.partner_slug
      LEFT JOIN (
        SELECT
          so.created_at::date AS fecha,
          ap2.slug AS partner_slug,
          COUNT(*)::int AS orders,
          COUNT(*) FILTER (WHERE so.status = 'paid')::int AS orders_paid,
          COALESCE(SUM(so.product_price / 100) FILTER (WHERE so.status = 'paid'), 0)::numeric AS revenue
        FROM store_orders so
        JOIN affiliate_partners ap2 ON ap2.id = so.attributed_partner_id
        WHERE so.created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY so.created_at::date, ap2.slug
      ) o ON o.fecha = d.fecha AND o.partner_slug = d.partner_slug
      WHERE COALESCE(t.touches, 0) > 0 OR COALESCE(o.orders, 0) > 0
      ORDER BY d.fecha DESC, d.partner_slug
      `,
      [dias]
    )

    // Query 3 — Product breakdown (top 20)
    const productosRes = await client.query<AfiliadoProducto>(
      `
      SELECT
        so.product_name,
        ap.slug AS partner_slug,
        COUNT(*)::int AS orders,
        COUNT(*) FILTER (WHERE so.status = 'paid')::int AS paid,
        COUNT(*) FILTER (WHERE so.status = 'cancelled')::int AS cancelled,
        COALESCE(SUM(so.product_price / 100) FILTER (WHERE so.status = 'paid'), 0)::numeric AS revenue
      FROM store_orders so
      JOIN affiliate_partners ap ON ap.id = so.attributed_partner_id
      WHERE so.created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY so.product_name, ap.slug
      ORDER BY orders DESC
      LIMIT 20
      `,
      [dias]
    )

    // Query 4 — Attribution rules
    const atribucionesRes = await client.query<AfiliadoAtribucion>(
      `
      SELECT
        COALESCE(attribution_rule, 'unknown') AS rule,
        COUNT(*)::int AS orders,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid
      FROM store_orders
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY attribution_rule
      ORDER BY orders DESC
      `,
      [dias]
    )

    const partners = partnersRes.rows.map((r) => ({
      ...r,
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

    const diario = diarioRes.rows.map((r) => ({
      ...r,
      touches: Number(r.touches),
      visitors: Number(r.visitors),
      orders: Number(r.orders),
      orders_paid: Number(r.orders_paid),
      revenue: Number(r.revenue),
    }))

    const productos = productosRes.rows.map((r) => ({
      ...r,
      orders: Number(r.orders),
      paid: Number(r.paid),
      cancelled: Number(r.cancelled),
      revenue: Number(r.revenue),
    }))

    const atribuciones = atribucionesRes.rows.map((r) => ({
      ...r,
      orders: Number(r.orders),
      paid: Number(r.paid),
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
      diario,
      productos,
      atribuciones,
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
