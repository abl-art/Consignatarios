'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { fetchTiendaDesempeno, type TiendaDesempenoData } from '@/lib/actions/tienda-desempeno'

function fmt(n: number): string { return n.toLocaleString('es-AR') }
function fmtPesos(n: number): string { return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function fmtPct(n: number): string { return n.toFixed(1) + '%' }

function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function monthStart(offset: number = 0): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset); return d.toISOString().slice(0, 10)
}
function monthEnd(offset: number = 0): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset + 1); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10)
}
function monthLabel(offset: number): string {
  const d = new Date(); d.setMonth(d.getMonth() - offset)
  return d.toLocaleString('es-AR', { month: 'long', year: 'numeric' })
}

const PRESETS = [
  { label: '7 días', desde: () => daysAgo(7), hasta: () => today() },
  { label: '30 días', desde: () => daysAgo(30), hasta: () => today() },
  { label: monthLabel(0), desde: () => monthStart(0), hasta: () => today() },
  { label: monthLabel(1), desde: () => monthStart(1), hasta: () => monthEnd(1) },
  { label: monthLabel(2), desde: () => monthStart(2), hasta: () => monthEnd(2) },
] as const

export default function TiendaDesempenoClient({ data: initialData, desde: initDesde, hasta: initHasta }: { data: TiendaDesempenoData; desde: string; hasta: string }) {
  const [data, setData] = useState(initialData)
  const [desde, setDesde] = useState(initDesde)
  const [hasta, setHasta] = useState(initHasta)
  const [activePreset, setActivePreset] = useState<number | null>(1)
  const [isPending, startTransition] = useTransition()
  const [filtroCanal, setFiltroCanal] = useState<string>('')

  function reload(d: string, h: string, presetIdx: number | null) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    startTransition(async () => { setData(await fetchTiendaDesempeno(d, h)) })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx)
  }

  function handleCustomRange() {
    if (desde && hasta) reload(desde, hasta, null)
  }

  const { totals, canales, productos } = data
  const canalNames = useMemo(() => canales.map(c => c.canal), [canales])

  const filteredCanales = filtroCanal ? canales.filter(c => c.canal === filtroCanal) : canales

  const ft = useMemo(() => {
    if (!filtroCanal) return totals
    const fc = filteredCanales
    const t = fc.reduce((s, c) => s + c.touches, 0)
    const v = fc.reduce((s, c) => s + c.visitors, 0)
    const o = fc.reduce((s, c) => s + c.orders, 0)
    const paid = fc.reduce((s, c) => s + c.orders_paid, 0)
    return {
      touches: t, visitors: v, orders: o, orders_paid: paid,
      orders_cancelled: fc.reduce((s, c) => s + c.orders_cancelled, 0),
      revenue: fc.reduce((s, c) => s + c.revenue, 0),
      conversion_touch_visitor: t > 0 ? (v / t) * 100 : 0,
      conversion_visitor_order: v > 0 ? (o / v) * 100 : 0,
      conversion_order_paid: o > 0 ? (paid / o) * 100 : 0,
      conversion_touch_paid: t > 0 ? (paid / t) * 100 : 0,
    }
  }, [filtroCanal, filteredCanales, totals])

  const maxPaid = productos.length > 0 ? productos[0].paid : 1

  return (
    <div className={`p-4 md:p-6 max-w-7xl mx-auto space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-4 mb-1">
          <Link href="/canales"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Canales
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Tienda Online — Desempeño</h1>
        </div>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {PRESETS.map((p, i) => (
            <button key={i} onClick={() => handlePreset(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {p.label}
            </button>
          ))}
          <span className="text-gray-300">|</span>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setActivePreset(null) }}
            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
          <span className="text-xs text-gray-400">a</span>
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setActivePreset(null) }}
            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
          <button onClick={handleCustomRange}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Aplicar
          </button>
          <span className="text-gray-300 ml-1">|</span>
          <select value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">Todos los canales</option>
            {canalNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Funnel (left) + Revenue (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 px-5 py-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-6">Funnel de conversión</h2>
          <div className="flex flex-col items-center gap-1">
            {/* Touches */}
            <div className="w-full bg-blue-100 rounded-t-xl h-14 flex items-center justify-center">
              <span className="text-lg font-bold text-blue-800 font-mono">{fmt(ft.touches)}</span>
              <span className="text-xs text-blue-600 ml-2">touches</span>
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              <span className="text-[11px] text-gray-500">{fmtPct(ft.conversion_touch_visitor)} únicos</span>
            </div>
            {/* Visitantes */}
            <div className="w-[85%] bg-indigo-100 h-14 flex items-center justify-center">
              <span className="text-lg font-bold text-indigo-800 font-mono">{fmt(ft.visitors)}</span>
              <span className="text-xs text-indigo-600 ml-2">visitantes únicos</span>
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              <span className="text-[11px] text-gray-500">{fmtPct(ft.conversion_visitor_order)} generan order</span>
            </div>
            {/* Orders */}
            <div className="w-[65%] bg-amber-100 h-14 flex items-center justify-center">
              <span className="text-lg font-bold text-amber-800 font-mono">{fmt(ft.orders)}</span>
              <span className="text-xs text-amber-600 ml-2">orders</span>
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              <span className="text-[11px] text-gray-500">{fmtPct(ft.conversion_order_paid)} se pagan</span>
              {ft.orders_cancelled > 0 && <span className="text-[11px] text-red-400">· {fmt(ft.orders_cancelled)} canc.</span>}
            </div>
            {/* Paid */}
            <div className="w-[40%] bg-emerald-100 rounded-b-xl h-14 flex items-center justify-center">
              <span className="text-lg font-bold text-emerald-800 font-mono">{fmt(ft.orders_paid)}</span>
              <span className="text-xs text-emerald-600 ml-2">pagadas</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 text-center">
            <span className="text-xs text-gray-500">Conversión total touch → pagada: </span>
            <span className="text-sm font-bold text-gray-900">{fmtPct(ft.conversion_touch_paid)}</span>
          </div>
        </div>

        {/* Revenue — 1 col */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-5 flex flex-col">
          <h2 className="text-sm font-semibold text-gray-700 mb-5">Revenue</h2>
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Revenue pagado</p>
              <p className="text-3xl font-bold text-emerald-600 font-mono">{fmtPesos(ft.revenue)}</p>
            </div>
            <hr className="border-gray-100" />
            <div>
              <p className="text-xs text-gray-500 mb-1">Ticket promedio</p>
              <p className="text-2xl font-bold text-gray-900 font-mono">
                {ft.orders_paid > 0 ? fmtPesos(ft.revenue / ft.orders_paid) : '—'}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-xs text-gray-400">Revenue / touch</p>
              <p className="text-sm font-bold text-gray-900 font-mono">
                {ft.touches > 0 ? fmtPesos(ft.revenue / ft.touches) : '—'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Revenue / visitante</p>
              <p className="text-sm font-bold text-gray-900 font-mono">
                {ft.visitors > 0 ? fmtPesos(ft.revenue / ft.visitors) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Per-Channel Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Por canal</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Canal</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Touches</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Visitantes</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Orders</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Pagadas</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Canc.</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Conv.%</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {filteredCanales.map(c => {
                const convPct = c.visitors > 0 ? (c.orders_paid / c.visitors) * 100 : 0
                return (
                  <tr key={c.canal} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{c.canal}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(c.touches)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(c.visitors)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(c.orders)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-600">{fmt(c.orders_paid)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-red-500">{c.orders_cancelled > 0 ? fmt(c.orders_cancelled) : '-'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                        convPct >= 2 ? 'bg-emerald-100 text-emerald-700' : convPct > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>{fmtPct(convPct)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtPesos(c.revenue)}</td>
                  </tr>
                )
              })}
            </tbody>
            {filteredCanales.length > 1 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-2.5 text-sm text-gray-700">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(ft.touches)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(ft.visitors)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(ft.orders)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-600">{fmt(ft.orders_paid)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-red-500">{ft.orders_cancelled > 0 ? fmt(ft.orders_cancelled) : '-'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">{fmtPct(ft.conversion_touch_paid)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtPesos(ft.revenue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modelos pagados — bar chart */}
      {productos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Modelos con ventas confirmadas</h2>
          <div className="space-y-2.5">
            {productos.map(p => (
              <div key={p.product_name} className="flex items-center gap-3">
                <span className="text-xs text-gray-700 w-48 shrink-0 truncate" title={p.product_name}>{p.product_name}</span>
                <div className="flex-1 relative">
                  <div className="bg-emerald-100 rounded h-7 flex items-center px-2"
                    style={{ width: `${Math.max((p.paid / maxPaid) * 100, 8)}%` }}>
                    <span className="text-xs font-bold text-emerald-800 font-mono whitespace-nowrap">{p.paid}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-500 font-mono shrink-0 w-24 text-right">{fmtPesos(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
