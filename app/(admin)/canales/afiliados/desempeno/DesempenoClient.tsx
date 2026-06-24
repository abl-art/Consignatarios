'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { fetchDesempenoAfiliados, type DesempenoData } from '@/lib/actions/afiliados-desempeno'

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

export default function DesempenoClient({ data: initialData, desde: initDesde, hasta: initHasta }: { data: DesempenoData; desde: string; hasta: string }) {
  const [data, setData] = useState(initialData)
  const [desde, setDesde] = useState(initDesde)
  const [hasta, setHasta] = useState(initHasta)
  const [activePreset, setActivePreset] = useState<number | null>(1)
  const [isPending, startTransition] = useTransition()
  const [filtroPartner, setFiltroPartner] = useState<string>('')

  function reload(d: string, h: string, presetIdx: number | null) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    startTransition(async () => { setData(await fetchDesempenoAfiliados(d, h)) })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx)
  }

  function handleCustomRange() {
    if (desde && hasta) reload(desde, hasta, null)
  }

  const { totals, partners, productos } = data
  const partnerSlugs = useMemo(() => partners.map(p => p.partner_slug), [partners])

  const filteredPartners = filtroPartner ? partners.filter(p => p.partner_slug === filtroPartner) : partners

  const ft = useMemo(() => {
    if (!filtroPartner) return totals
    const fp = filteredPartners
    const t = fp.reduce((s, p) => s + p.touches, 0)
    const o = fp.reduce((s, p) => s + p.orders, 0)
    const paid = fp.reduce((s, p) => s + p.orders_paid, 0)
    return {
      touches: t, visitors: fp.reduce((s, p) => s + p.visitors, 0), orders: o, orders_paid: paid,
      orders_cancelled: fp.reduce((s, p) => s + p.orders_cancelled, 0),
      revenue_paid: fp.reduce((s, p) => s + p.revenue_paid, 0),
      revenue_total: fp.reduce((s, p) => s + p.revenue_total, 0),
      commission_estimated: fp.reduce((s, p) => s + p.commission_estimated, 0),
      conversion_touch_order: t > 0 ? (o / t) * 100 : 0,
      conversion_order_paid: o > 0 ? (paid / o) * 100 : 0,
      conversion_touch_paid: t > 0 ? (paid / t) * 100 : 0,
    }
  }, [filtroPartner, filteredPartners, totals])

  // Only products with paid orders, grouped by product_name (merge across partners)
  const paidProducts = useMemo(() => {
    const map = new Map<string, { name: string; paid: number; revenue: number }>()
    for (const p of productos) {
      if (p.paid <= 0) continue
      const existing = map.get(p.product_name)
      if (existing) {
        existing.paid += p.paid
        existing.revenue += p.revenue
      } else {
        map.set(p.product_name, { name: p.product_name, paid: p.paid, revenue: p.revenue })
      }
    }
    return [...map.values()].sort((a, b) => b.paid - a.paid)
  }, [productos])

  const maxPaid = paidProducts.length > 0 ? paidProducts[0].paid : 1

  return (
    <div className={`p-4 md:p-6 max-w-7xl mx-auto space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-4 mb-1">
          <Link href="/canales/afiliados"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Afiliados
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Desempeño</h1>
        </div>
        {/* Period + partner filters */}
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
          <select value={filtroPartner} onChange={e => setFiltroPartner(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500">
            <option value="">Todos los partners</option>
            {partnerSlugs.map(slug => (
              <option key={slug} value={slug}>{partners.find(p => p.partner_slug === slug)?.display_name ?? slug}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Funnel (left) + Revenue (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 px-5 py-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-5">Funnel de conversión</h2>
          {/* Funnel bars */}
          <div className="space-y-3">
            {/* Touches */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-16 shrink-0 text-right">Touches</span>
              <div className="flex-1 relative">
                <div className="bg-blue-100 rounded-md h-10 w-full flex items-center px-3">
                  <span className="text-sm font-bold text-blue-800 font-mono">{fmt(ft.touches)}</span>
                  <span className="text-xs text-blue-600 ml-2">{fmt(ft.visitors)} visitantes únicos</span>
                </div>
              </div>
            </div>
            {/* Arrow */}
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0" />
              <div className="flex items-center gap-2 pl-2">
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                <span className="text-xs font-semibold text-purple-600">{fmtPct(ft.conversion_touch_order)} generan order</span>
              </div>
            </div>
            {/* Orders */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-16 shrink-0 text-right">Orders</span>
              <div className="flex-1 relative">
                <div className="bg-purple-100 rounded-md h-10 flex items-center px-3"
                  style={{ width: `${Math.max(ft.touches > 0 ? (ft.orders / ft.touches) * 100 : 5, 5)}%` }}>
                  <span className="text-sm font-bold text-purple-800 font-mono whitespace-nowrap">{fmt(ft.orders)}</span>
                </div>
              </div>
            </div>
            {/* Arrow */}
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0" />
              <div className="flex items-center gap-2 pl-2">
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                <span className="text-xs font-semibold text-emerald-600">{fmtPct(ft.conversion_order_paid)} se pagan</span>
                {ft.orders_cancelled > 0 && <span className="text-xs text-red-400 ml-1">({fmt(ft.orders_cancelled)} canceladas)</span>}
              </div>
            </div>
            {/* Paid */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-16 shrink-0 text-right">Pagadas</span>
              <div className="flex-1 relative">
                <div className="bg-emerald-100 rounded-md h-10 flex items-center px-3"
                  style={{ width: `${Math.max(ft.touches > 0 ? (ft.orders_paid / ft.touches) * 100 : 5, 5)}%` }}>
                  <span className="text-sm font-bold text-emerald-800 font-mono whitespace-nowrap">{fmt(ft.orders_paid)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 text-center">
            <span className="text-xs text-gray-500">Conversión total touch → pagada: </span>
            <span className="text-sm font-bold text-gray-900">{fmtPct(ft.conversion_touch_paid)}</span>
          </div>
        </div>

        {/* Revenue + Commission — 1 col */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-5 flex flex-col">
          <h2 className="text-sm font-semibold text-gray-700 mb-5">Revenue y comisiones</h2>
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Revenue pagado</p>
              <p className="text-3xl font-bold text-emerald-600 font-mono">{fmtPesos(ft.revenue_paid)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Revenue total (todas las orders)</p>
              <p className="text-xl font-bold text-gray-400 font-mono">{fmtPesos(ft.revenue_total)}</p>
            </div>
            <hr className="border-gray-100" />
            <div>
              <p className="text-xs text-gray-500 mb-1">Comisión estimada</p>
              <p className="text-3xl font-bold text-purple-600 font-mono">{fmtPesos(ft.commission_estimated)}</p>
            </div>
            {filtroPartner && filteredPartners[0]?.commission_value && (
              <p className="text-xs text-gray-400">Tasa: {filteredPartners[0].commission_value}% sobre revenue pagado</p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-xs text-gray-400">Ticket promedio</p>
              <p className="text-sm font-bold text-gray-900 font-mono">
                {ft.orders_paid > 0 ? fmtPesos(ft.revenue_paid / ft.orders_paid) : '—'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Costo por touch</p>
              <p className="text-sm font-bold text-gray-900 font-mono">
                {ft.touches > 0 ? fmtPesos(ft.commission_estimated / ft.touches) : '—'}
              </p>
            </div>
          </div>
        </div>
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
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {filteredPartners.map(p => {
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
                        convPct >= 5 ? 'bg-emerald-100 text-emerald-700' : convPct >= 2 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                      }`}>{fmtPct(convPct)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtPesos(p.revenue_paid)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-purple-600">{fmtPesos(p.commission_estimated)}</td>
                  </tr>
                )
              })}
            </tbody>
            {filteredPartners.length > 1 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-2.5 text-sm text-gray-700">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(ft.touches)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(ft.visitors)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(ft.orders)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-600">{fmt(ft.orders_paid)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-red-500">{ft.orders_cancelled > 0 ? fmt(ft.orders_cancelled) : '-'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">{fmtPct(ft.conversion_touch_paid)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtPesos(ft.revenue_paid)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-purple-600">{fmtPesos(ft.commission_estimated)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modelos pagados — bar chart */}
      {paidProducts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Modelos con ventas confirmadas</h2>
          <div className="space-y-2.5">
            {paidProducts.map(p => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="text-xs text-gray-700 w-48 shrink-0 truncate" title={p.name}>{p.name}</span>
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
