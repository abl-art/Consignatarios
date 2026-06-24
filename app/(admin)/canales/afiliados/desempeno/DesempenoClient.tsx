'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { fetchDesempenoAfiliados, type DesempenoData } from '@/lib/actions/afiliados-desempeno'

function fmt(n: number): string { return n.toLocaleString('es-AR') }
function fmtPesos(n: number): string { return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function fmtPct(n: number): string { return n.toFixed(1) + '%' }

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const

export default function DesempenoClient({ data: initialData }: { data: DesempenoData }) {
  const [data, setData] = useState(initialData)
  const [selectedDays, setSelectedDays] = useState(30)
  const [isPending, startTransition] = useTransition()

  function handlePeriod(days: number) {
    setSelectedDays(days)
    startTransition(async () => {
      const result = await fetchDesempenoAfiliados(days)
      setData(result)
    })
  }

  const { totals, partners, diario, productos, atribuciones } = data
  const totalAttrOrders = atribuciones.reduce((s, a) => s + a.orders, 0)

  // Group diario by fecha
  const fechas = [...new Set(diario.map(d => d.fecha))].slice(0, 30)

  return (
    <div className={`p-4 md:p-6 max-w-7xl mx-auto space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
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
          <h1 className="text-2xl font-bold text-gray-900">Desempeno</h1>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => handlePeriod(p.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                selectedDays === p.days
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Touches</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{fmt(totals.touches)}</p>
          <p className="text-xs text-gray-400 mt-1">{fmt(totals.visitors)} visitantes</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Orders generadas</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{fmt(totals.orders)}</p>
          <p className="text-xs text-purple-600 mt-1 font-medium">{fmtPct(totals.conversion_touch_order)} conv. touch→order</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Orders pagadas</p>
          <p className="text-2xl font-bold text-emerald-600 font-mono">{fmt(totals.orders_paid)}</p>
          <p className="text-xs text-emerald-600 mt-1 font-medium">{fmtPct(totals.conversion_order_paid)} conv. order→paid</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Revenue pagado</p>
          <p className="text-2xl font-bold text-emerald-600 font-mono">{fmtPesos(totals.revenue_paid)}</p>
          <p className="text-xs text-purple-600 mt-1 font-medium">Comision est. {fmtPesos(totals.commission_estimated)}</p>
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Funnel de conversion</h2>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {/* Touches */}
          <div className="flex flex-col items-center">
            <div className="bg-blue-100 text-blue-800 rounded-lg px-4 py-3 text-center min-w-[100px]">
              <p className="text-xs font-medium">Touches</p>
              <p className="text-lg font-bold font-mono">{fmt(totals.touches)}</p>
            </div>
          </div>
          {/* Arrow 1 */}
          <div className="flex flex-col items-center">
            <span className="text-gray-400 text-lg">&rarr;</span>
            <span className="text-xs text-gray-500 font-mono">{fmtPct(totals.conversion_touch_order)}</span>
          </div>
          {/* Orders */}
          <div className="flex flex-col items-center">
            <div className="bg-purple-100 text-purple-800 rounded-lg px-4 py-3 text-center min-w-[100px]">
              <p className="text-xs font-medium">Orders</p>
              <p className="text-lg font-bold font-mono">{fmt(totals.orders)}</p>
            </div>
          </div>
          {/* Arrow 2 */}
          <div className="flex flex-col items-center">
            <span className="text-gray-400 text-lg">&rarr;</span>
            <span className="text-xs text-gray-500 font-mono">{fmtPct(totals.conversion_order_paid)}</span>
          </div>
          {/* Pagadas */}
          <div className="flex flex-col items-center">
            <div className="bg-emerald-100 text-emerald-800 rounded-lg px-4 py-3 text-center min-w-[100px]">
              <p className="text-xs font-medium">Pagadas</p>
              <p className="text-lg font-bold font-mono">{fmt(totals.orders_paid)}</p>
            </div>
          </div>
          {/* Cancelled */}
          {totals.orders_cancelled > 0 && (
            <div className="flex flex-col items-center ml-2">
              <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 text-center">
                <p className="text-xs font-medium">Canc.</p>
                <p className="text-sm font-bold font-mono">{fmt(totals.orders_cancelled)}</p>
              </div>
            </div>
          )}
        </div>
        <p className="text-center text-xs text-gray-500 mt-3">
          Conversion total touch &rarr; pagada: <span className="font-semibold text-gray-700">{fmtPct(totals.conversion_touch_paid)}</span>
        </p>
      </div>

      {/* Per-Partner Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Por partner</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Partner</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Touches</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Visitantes</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Orders</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Pagadas</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Canc.</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Conv.%</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Revenue</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Comision</th>
              </tr>
            </thead>
            <tbody>
              {partners.map(p => {
                const convPct = p.touches > 0 ? (p.orders_paid / p.touches) * 100 : 0
                return (
                  <tr key={p.partner_slug} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="text-sm font-medium text-gray-900">{p.display_name}</p>
                      <p className="text-xs text-gray-400">{p.partner_slug} {p.commission_value ? `· ${p.commission_value}%` : ''}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(p.touches)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(p.visitors)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(p.orders)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-600">{fmt(p.orders_paid)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-red-500">{p.orders_cancelled > 0 ? fmt(p.orders_cancelled) : '-'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                        convPct >= 5 ? 'bg-emerald-100 text-emerald-700' :
                        convPct >= 2 ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {fmtPct(convPct)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtPesos(p.revenue_paid)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-purple-600">{fmtPesos(p.commission_estimated)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-2.5 text-sm text-gray-700">Total</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(totals.touches)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(totals.visitors)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(totals.orders)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-600">{fmt(totals.orders_paid)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-red-500">{totals.orders_cancelled > 0 ? fmt(totals.orders_cancelled) : '-'}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                    {fmtPct(totals.conversion_touch_paid)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtPesos(totals.revenue_paid)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-purple-600">{fmtPesos(totals.commission_estimated)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Daily Activity Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Actividad diaria</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Fecha</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Partner</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Touches</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Visitantes</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Orders</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Pagadas</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {fechas.map(fecha => {
                const rows = diario.filter(d => d.fecha === fecha)
                return rows.map((row, i) => (
                  <tr key={`${fecha}-${row.partner_slug}`} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">
                      {i === 0 ? fecha : ''}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">{row.partner_slug}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{fmt(row.touches)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{fmt(row.visitors)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{fmt(row.orders)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-emerald-600">{fmt(row.orders_paid)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{fmtPesos(row.revenue)}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Row: Products + Attribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Products */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Top productos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Producto</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Orders</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Pagadas</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <p className="text-sm text-gray-900">{p.product_name}</p>
                      <p className="text-xs text-gray-400">{p.partner_slug}</p>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{fmt(p.orders)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-emerald-600">{fmt(p.paid)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{fmtPesos(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Attribution Rules */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Reglas de atribucion</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {atribuciones.map(a => {
              const pct = totalAttrOrders > 0 ? (a.orders / totalAttrOrders) * 100 : 0
              return (
                <div key={a.rule}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{a.rule}</span>
                    <span className="font-mono text-xs text-gray-500">{fmt(a.orders)} orders</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtPct(pct)}</p>
                </div>
              )
            })}
            {atribuciones.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Sin datos de atribucion</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
