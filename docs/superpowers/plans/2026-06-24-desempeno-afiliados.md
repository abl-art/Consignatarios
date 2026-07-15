# Desempeño Afiliados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an affiliate performance dashboard showing the full conversion funnel (touches → orders → paid) per partner, with temporal trends, product breakdown, and commission estimates.

**Architecture:** Server action queries GOcelular DB (`affiliate_partners`, `affiliate_touches`, `store_orders`) and returns pre-aggregated data. A single client component renders summary cards, funnel visualization, per-partner table, temporal chart area, and product breakdown. Follows existing patterns: `'use server'` action file + server page + `'use client'` component.

**Tech Stack:** Next.js App Router, GOcelular Postgres via `getPool()`, Tailwind CSS. No new dependencies.

**Key data notes:**
- `store_orders.product_price` is in centavos → divide by 100 for display in pesos
- Prices are in ARS (Argentine pesos)
- 3 real partners: Loginet (15% commission), Paylab/cc (10%), Yami (10%)
- Attribution rules: `session_affiliate`, `lookback_first_affiliate`

---

### Task 1: Server Action — `fetchDesempenoAfiliados()`

**Files:**
- Create: `lib/actions/afiliados-desempeno.ts`

- [ ] **Step 1: Create the server action file with types and main query**

```typescript
// lib/actions/afiliados-desempeno.ts
'use server'

import { getPool } from '@/lib/db-pool'

export interface AfiliadoPartner {
  id: string
  slug: string
  display_name: string
  channel: string
  commission_type: string | null
  commission_value: number | null
  status: string
}

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
  revenue_paid: number       // in pesos (already divided by 100)
  revenue_total: number      // all orders regardless of status
  commission_estimated: number
}

export interface AfiliadoDiario {
  fecha: string  // YYYY-MM-DD
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
    conversion_touch_order: number    // percentage
    conversion_order_paid: number     // percentage
    conversion_touch_paid: number     // percentage
  }
}

export async function fetchDesempenoAfiliados(dias: number = 30): Promise<DesempenoData> {
  const pool = getPool()
  if (!pool) {
    return {
      partners: [], diario: [], productos: [], atribuciones: [],
      totals: { touches: 0, visitors: 0, orders: 0, orders_paid: 0, orders_cancelled: 0, revenue_paid: 0, revenue_total: 0, commission_estimated: 0, conversion_touch_order: 0, conversion_order_paid: 0, conversion_touch_paid: 0 },
    }
  }

  const client = await pool.connect()
  try {
    // 1. Partner stats (touches + orders joined)
    const statsRes = await client.query<{
      partner_slug: string; display_name: string; commission_type: string | null; commission_value: string | null
      touches: string; visitors: string; orders: string; orders_paid: string; orders_cancelled: string; orders_redirected: string
      revenue_paid: string; revenue_total: string
    }>(`
      WITH partner_touches AS (
        SELECT
          t.partner_slug,
          ap.display_name,
          ap.commission_type,
          ap.commission_value,
          COUNT(*) AS touches,
          COUNT(DISTINCT t.visitor_id) AS visitors
        FROM affiliate_touches t
        JOIN affiliate_partners ap ON ap.slug = t.partner_slug
        WHERE t.partner_slug IS NOT NULL
          AND t.occurred_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY t.partner_slug, ap.display_name, ap.commission_type, ap.commission_value
      ),
      partner_orders AS (
        SELECT
          ap.slug AS partner_slug,
          COUNT(*) AS orders,
          COUNT(*) FILTER (WHERE so.status = 'paid') AS orders_paid,
          COUNT(*) FILTER (WHERE so.status = 'cancelled') AS orders_cancelled,
          COUNT(*) FILTER (WHERE so.status = 'redirected_to_payment') AS orders_redirected,
          COALESCE(SUM(so.product_price / 100) FILTER (WHERE so.status = 'paid'), 0) AS revenue_paid,
          COALESCE(SUM(so.product_price / 100), 0) AS revenue_total
        FROM store_orders so
        JOIN affiliate_partners ap ON ap.id = so.attributed_partner_id
        WHERE so.attributed_partner_id IS NOT NULL
          AND so.created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY ap.slug
      )
      SELECT
        pt.partner_slug, pt.display_name, pt.commission_type, pt.commission_value::text,
        pt.touches, pt.visitors,
        COALESCE(po.orders, 0) AS orders,
        COALESCE(po.orders_paid, 0) AS orders_paid,
        COALESCE(po.orders_cancelled, 0) AS orders_cancelled,
        COALESCE(po.orders_redirected, 0) AS orders_redirected,
        COALESCE(po.revenue_paid, 0) AS revenue_paid,
        COALESCE(po.revenue_total, 0) AS revenue_total
      FROM partner_touches pt
      LEFT JOIN partner_orders po ON po.partner_slug = pt.partner_slug
      ORDER BY pt.touches DESC
    `, [dias])

    const partners: AfiliadoStats[] = statsRes.rows.map(r => {
      const commVal = r.commission_value ? parseFloat(r.commission_value) : 0
      const revPaid = Number(r.revenue_paid)
      const commEst = r.commission_type === 'percent' ? revPaid * commVal / 100 : 0
      return {
        partner_slug: r.partner_slug,
        display_name: r.display_name,
        commission_type: r.commission_type,
        commission_value: r.commission_value ? parseFloat(r.commission_value) : null,
        touches: Number(r.touches),
        visitors: Number(r.visitors),
        orders: Number(r.orders),
        orders_paid: Number(r.orders_paid),
        orders_cancelled: Number(r.orders_cancelled),
        orders_redirected: Number(r.orders_redirected),
        revenue_paid: revPaid,
        revenue_total: Number(r.revenue_total),
        commission_estimated: commEst,
      }
    })

    // 2. Daily breakdown
    const diarioRes = await client.query<{
      fecha: string; partner_slug: string; touches: string; visitors: string; orders: string; orders_paid: string; revenue: string
    }>(`
      WITH daily_touches AS (
        SELECT
          DATE(t.occurred_at) AS fecha,
          t.partner_slug,
          COUNT(*) AS touches,
          COUNT(DISTINCT t.visitor_id) AS visitors
        FROM affiliate_touches t
        WHERE t.partner_slug IS NOT NULL
          AND t.occurred_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(t.occurred_at), t.partner_slug
      ),
      daily_orders AS (
        SELECT
          DATE(so.created_at) AS fecha,
          ap.slug AS partner_slug,
          COUNT(*) AS orders,
          COUNT(*) FILTER (WHERE so.status = 'paid') AS orders_paid,
          COALESCE(SUM(so.product_price / 100) FILTER (WHERE so.status = 'paid'), 0) AS revenue
        FROM store_orders so
        JOIN affiliate_partners ap ON ap.id = so.attributed_partner_id
        WHERE so.attributed_partner_id IS NOT NULL
          AND so.created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(so.created_at), ap.slug
      )
      SELECT
        dt.fecha::text, dt.partner_slug,
        dt.touches, dt.visitors,
        COALESCE(dor.orders, 0) AS orders,
        COALESCE(dor.orders_paid, 0) AS orders_paid,
        COALESCE(dor.revenue, 0) AS revenue
      FROM daily_touches dt
      LEFT JOIN daily_orders dor ON dor.fecha = dt.fecha AND dor.partner_slug = dt.partner_slug
      ORDER BY dt.fecha DESC, dt.touches DESC
    `, [dias])

    const diario: AfiliadoDiario[] = diarioRes.rows.map(r => ({
      fecha: r.fecha,
      partner_slug: r.partner_slug,
      touches: Number(r.touches),
      visitors: Number(r.visitors),
      orders: Number(r.orders),
      orders_paid: Number(r.orders_paid),
      revenue: Number(r.revenue),
    }))

    // 3. Product breakdown
    const prodRes = await client.query<{
      product_name: string; partner_slug: string; orders: string; paid: string; cancelled: string; revenue: string
    }>(`
      SELECT
        so.product_name,
        ap.slug AS partner_slug,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE so.status = 'paid') AS paid,
        COUNT(*) FILTER (WHERE so.status = 'cancelled') AS cancelled,
        COALESCE(SUM(so.product_price / 100) FILTER (WHERE so.status = 'paid'), 0) AS revenue
      FROM store_orders so
      JOIN affiliate_partners ap ON ap.id = so.attributed_partner_id
      WHERE so.attributed_partner_id IS NOT NULL
        AND so.created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY so.product_name, ap.slug
      ORDER BY orders DESC
      LIMIT 20
    `, [dias])

    const productos: AfiliadoProducto[] = prodRes.rows.map(r => ({
      product_name: r.product_name,
      partner_slug: r.partner_slug,
      orders: Number(r.orders),
      paid: Number(r.paid),
      cancelled: Number(r.cancelled),
      revenue: Number(r.revenue),
    }))

    // 4. Attribution rules breakdown
    const attrRes = await client.query<{ rule: string; orders: string; paid: string }>(`
      SELECT
        COALESCE(so.attribution_rule, 'direct') AS rule,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE so.status = 'paid') AS paid
      FROM store_orders so
      WHERE so.attributed_partner_id IS NOT NULL
        AND so.created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY so.attribution_rule
      ORDER BY orders DESC
    `, [dias])

    const atribuciones: AfiliadoAtribucion[] = attrRes.rows.map(r => ({
      rule: r.rule,
      orders: Number(r.orders),
      paid: Number(r.paid),
    }))

    // Calculate totals
    const totalTouches = partners.reduce((s, p) => s + p.touches, 0)
    const totalVisitors = partners.reduce((s, p) => s + p.visitors, 0)
    const totalOrders = partners.reduce((s, p) => s + p.orders, 0)
    const totalPaid = partners.reduce((s, p) => s + p.orders_paid, 0)
    const totalCancelled = partners.reduce((s, p) => s + p.orders_cancelled, 0)
    const totalRevPaid = partners.reduce((s, p) => s + p.revenue_paid, 0)
    const totalRevAll = partners.reduce((s, p) => s + p.revenue_total, 0)
    const totalComm = partners.reduce((s, p) => s + p.commission_estimated, 0)

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
        revenue_paid: totalRevPaid,
        revenue_total: totalRevAll,
        commission_estimated: totalComm,
        conversion_touch_order: totalTouches > 0 ? (totalOrders / totalTouches) * 100 : 0,
        conversion_order_paid: totalOrders > 0 ? (totalPaid / totalOrders) * 100 : 0,
        conversion_touch_paid: totalTouches > 0 ? (totalPaid / totalTouches) * 100 : 0,
      },
    }
  } finally {
    client.release()
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep afiliados-desempeno`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/actions/afiliados-desempeno.ts
git commit -m "feat: add server action for affiliate performance data"
```

---

### Task 2: Server Page + Client Component

**Files:**
- Create: `app/(admin)/canales/afiliados/desempeno/page.tsx`
- Create: `app/(admin)/canales/afiliados/desempeno/DesempenoClient.tsx`

- [ ] **Step 1: Create the server page**

```typescript
// app/(admin)/canales/afiliados/desempeno/page.tsx
export const dynamic = 'force-dynamic'

import { fetchDesempenoAfiliados } from '@/lib/actions/afiliados-desempeno'
import DesempenoClient from './DesempenoClient'

export default async function DesempenoPage() {
  const data = await fetchDesempenoAfiliados(30)
  return <DesempenoClient data={data} />
}
```

- [ ] **Step 2: Create the client component**

This is the main UI component. It includes:
- Period selector (7d / 14d / 30d / 90d)
- Summary cards row (touches, orders, paid, conversion rates, revenue, commissions)
- Conversion funnel visualization (touches → orders → paid with drop-off %)
- Per-partner performance table (all metrics + sparkline-style bars)
- Daily activity table grouped by date
- Top products table
- Attribution rules breakdown

```typescript
// app/(admin)/canales/afiliados/desempeno/DesempenoClient.tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { fetchDesempenoAfiliados, type DesempenoData } from '@/lib/actions/afiliados-desempeno'

function fmt(n: number): string {
  return n.toLocaleString('es-AR')
}

function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}

const PERIODOS = [
  { label: '7 días', value: 7 },
  { label: '14 días', value: 14 },
  { label: '30 días', value: 30 },
  { label: '90 días', value: 90 },
]

export default function DesempenoClient({ data: initialData }: { data: DesempenoData }) {
  const [data, setData] = useState(initialData)
  const [dias, setDias] = useState(30)
  const [isPending, startTransition] = useTransition()

  function changePeriod(d: number) {
    setDias(d)
    startTransition(async () => {
      const newData = await fetchDesempenoAfiliados(d)
      setData(newData)
    })
  }

  const { totals, partners, diario, productos, atribuciones } = data

  // Group diario by date for the daily table
  const fechas = [...new Set(diario.map(d => d.fecha))].sort().reverse()

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-4">
          <Link
            href="/canales/afiliados"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Afiliados
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Desempeño</h1>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {PERIODOS.map(p => (
            <button
              key={p.value}
              onClick={() => changePeriod(p.value)}
              disabled={isPending}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dias === p.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              } ${isPending ? 'opacity-50' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">Performance de la red de afiliados — últimos {dias} días</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Touches</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.touches)}</p>
          <p className="text-xs text-gray-400">{fmt(totals.visitors)} visitantes únicos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Orders generadas</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.orders)}</p>
          <p className="text-xs text-purple-600 font-medium">{fmtPct(totals.conversion_touch_order)} de touches</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Orders pagadas</p>
          <p className="text-2xl font-bold text-green-700">{fmt(totals.orders_paid)}</p>
          <p className="text-xs text-green-600 font-medium">{fmtPct(totals.conversion_order_paid)} de orders</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Revenue pagado</p>
          <p className="text-2xl font-bold text-green-700">{fmtPesos(totals.revenue_paid)}</p>
          <p className="text-xs text-gray-400">Comisiones: {fmtPesos(totals.commission_estimated)}</p>
        </div>
      </div>

      {/* Conversion funnel */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Embudo de conversión</h3>
        <div className="flex items-center gap-2">
          {/* Touches */}
          <div className="flex-1">
            <div className="bg-blue-100 rounded-lg p-3 text-center">
              <p className="text-xs text-blue-600 font-medium">Touches</p>
              <p className="text-xl font-bold text-blue-800">{fmt(totals.touches)}</p>
            </div>
          </div>
          <div className="text-center shrink-0 w-16">
            <svg className="w-5 h-5 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <p className="text-xs text-gray-500 font-medium">{fmtPct(totals.conversion_touch_order)}</p>
          </div>
          {/* Orders */}
          <div className="flex-1">
            <div className="bg-purple-100 rounded-lg p-3 text-center">
              <p className="text-xs text-purple-600 font-medium">Orders</p>
              <p className="text-xl font-bold text-purple-800">{fmt(totals.orders)}</p>
            </div>
          </div>
          <div className="text-center shrink-0 w-16">
            <svg className="w-5 h-5 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <p className="text-xs text-gray-500 font-medium">{fmtPct(totals.conversion_order_paid)}</p>
          </div>
          {/* Paid */}
          <div className="flex-1">
            <div className="bg-green-100 rounded-lg p-3 text-center">
              <p className="text-xs text-green-600 font-medium">Pagadas</p>
              <p className="text-xl font-bold text-green-800">{fmt(totals.orders_paid)}</p>
            </div>
          </div>
          <div className="text-center shrink-0 w-16">
            <p className="text-xs text-red-500 font-medium">{fmt(totals.orders_cancelled)} canc.</p>
          </div>
        </div>
        <div className="mt-3 text-center">
          <p className="text-xs text-gray-400">Conversión total touch → pagada: <span className="font-semibold text-gray-700">{fmtPct(totals.conversion_touch_paid)}</span></p>
        </div>
      </div>

      {/* Per-partner table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-6">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Performance por partner</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Partner</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Touches</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Visitantes</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Orders</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Pagadas</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Canc.</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Conv. %</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Revenue</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Comisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {partners.map(p => {
              const convPct = p.touches > 0 ? (p.orders_paid / p.touches) * 100 : 0
              return (
                <tr key={p.partner_slug} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div>
                      <span className="font-medium text-gray-900">{p.display_name}</span>
                      <span className="text-xs text-gray-400 ml-2">{p.partner_slug}</span>
                    </div>
                    <span className="text-xs text-gray-400">{p.commission_type === 'percent' ? p.commission_value + '%' : '—'}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{fmt(p.touches)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{fmt(p.visitors)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{fmt(p.orders)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-green-700 font-medium">{fmt(p.orders_paid)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-red-500">{fmt(p.orders_cancelled)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      convPct >= 1 ? 'bg-green-100 text-green-700' : convPct > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                    }`}>{fmtPct(convPct)}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-medium">{fmtPesos(p.revenue_paid)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-purple-700">{fmtPesos(p.commission_estimated)}</td>
                </tr>
              )
            })}
          </tbody>
          {partners.length > 1 && (
            <tfoot className="bg-gray-50 border-t border-gray-200 font-medium">
              <tr>
                <td className="px-4 py-2 text-gray-700">Total</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmt(totals.touches)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmt(totals.visitors)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmt(totals.orders)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-green-700">{fmt(totals.orders_paid)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-red-500">{fmt(totals.orders_cancelled)}</td>
                <td className="px-4 py-2 text-right">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-200 text-gray-700">{fmtPct(totals.conversion_touch_paid)}</span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmtPesos(totals.revenue_paid)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-purple-700">{fmtPesos(totals.commission_estimated)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Daily activity */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-6">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Actividad diaria</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Partner</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Touches</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Visitantes</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Orders</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Pagadas</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {fechas.slice(0, 30).flatMap(fecha =>
              diario.filter(d => d.fecha === fecha).map(d => (
                <tr key={`${fecha}-${d.partner_slug}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{fecha}</td>
                  <td className="px-4 py-2 text-gray-700">{d.partner_slug}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{fmt(d.touches)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{fmt(d.visitors)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{fmt(d.orders)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-green-700">{fmt(d.orders_paid)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{d.revenue > 0 ? fmtPesos(d.revenue) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom row: Products + Attribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top products */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Productos más vendidos</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Producto</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Orders</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Pagadas</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {productos.map((p, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span className="text-gray-900">{p.product_name}</span>
                    <span className="text-xs text-gray-400 ml-1">({p.partner_slug})</span>
                  </td>
                  <td className="px-4 py-2 text-center font-mono text-xs">{p.orders}</td>
                  <td className="px-4 py-2 text-center font-mono text-xs text-green-700">{p.paid}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{p.revenue > 0 ? fmtPesos(p.revenue) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Attribution */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Reglas de atribución</h3>
          </div>
          <div className="p-4 space-y-3">
            {atribuciones.map(a => {
              const totalOrders = atribuciones.reduce((s, x) => s + x.orders, 0)
              const pct = totalOrders > 0 ? (a.orders / totalOrders) * 100 : 0
              return (
                <div key={a.rule}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{a.rule.replace(/_/g, ' ')}</span>
                    <span className="text-sm font-medium text-gray-900">{a.orders} orders ({a.paid} pagadas)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {atribuciones.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Sin datos de atribución</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E 'desempeno|afiliados-desempeno'`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/canales/afiliados/desempeno/
git commit -m "feat: add Desempeño afiliados page with funnel, partner table, daily activity, products, and attribution"
```

---

### Task 3: Wire into Afiliados hub page + sidebar

**Files:**
- Modify: `app/(admin)/canales/afiliados/page.tsx`
- Modify: `app/(admin)/layout.tsx`

- [ ] **Step 1: Add Desempeño card to the afiliados hub page**

In `app/(admin)/canales/afiliados/page.tsx`, add a second card in the grid after the Guía Comercial card:

```tsx
<Link
  href="/canales/afiliados/desempeno"
  className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
>
  <div className="bg-emerald-600 px-5 py-4 flex items-center gap-3">
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
    <h2 className="text-lg font-semibold text-white">Desempeño</h2>
  </div>
  <div className="p-5">
    <p className="text-sm text-gray-500">Métricas de conversión, revenue y comisiones de la red de afiliados</p>
  </div>
</Link>
```

- [ ] **Step 2: Add sidebar entry**

In `app/(admin)/layout.tsx`, add after the Guía Comercial entry (line 34):

```typescript
{ href: '/canales/afiliados/desempeno', label: 'Desempeño', icon: 'dashboard' },
```

- [ ] **Step 3: Verify TypeScript compiles and test locally**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/canales/afiliados/page.tsx app/\(admin\)/layout.tsx
git commit -m "feat: add Desempeño card and sidebar link in afiliados section"
```

---

### Task 4: Fix .env.local and deploy

**Files:**
- Modify: `.env.local` (fix trailing `\n` in GOCELULAR_DB_URL)

- [ ] **Step 1: Fix the trailing `\n` in the DB URL**

The `GOCELULAR_DB_URL` in `.env.local` has a literal `\n` at the end of the connection string which causes connection failures locally. Remove it.

- [ ] **Step 2: Test the page locally**

Run: `npm run dev` and visit `/canales/afiliados/desempeno`
Expected: Page loads with real data from GOcelular DB

- [ ] **Step 3: Commit all changes and push**

```bash
git add -A
git commit -m "feat: Desempeño afiliados dashboard — funnel, per-partner metrics, daily activity, products, attribution"
git push
```

Vercel auto-deploys on push to master.
