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
          <h2 className="text-sm font-semibold text-gray-700 mb-6">Funnel de conversión</h2>
          <div className="flex flex-col items-center gap-1">
            {/* Touches */}
            <div className="w-full bg-blue-100 rounded-t-xl h-14 flex items-center justify-center relative">
              <div className="text-center">
                <span className="text-lg font-bold text-blue-800 font-mono">{fmt(ft.touches)}</span>
                <span className="text-xs text-blue-600 ml-2">touches</span>
              </div>
            </div>
            {/* Conversion label */}
            <div className="flex items-center gap-1.5 py-0.5">
              <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              <span className="text-[11px] text-gray-500">{ft.touches > 0 ? fmtPct((ft.visitors / ft.touches) * 100) : '0%'} únicos</span>
            </div>
            {/* Visitantes */}
            <div className="w-[85%] bg-indigo-100 h-14 flex items-center justify-center">
              <div className="text-center">
                <span className="text-lg font-bold text-indigo-800 font-mono">{fmt(ft.visitors)}</span>
                <span className="text-xs text-indigo-600 ml-2">visitantes únicos</span>
              </div>
            </div>
            {/* Conversion label */}
            <div className="flex items-center gap-1.5 py-0.5">
              <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              <span className="text-[11px] text-gray-500">{fmtPct(ft.conversion_touch_order)} generan order</span>
            </div>
            {/* Orders */}
            <div className="w-[65%] bg-purple-100 h-14 flex items-center justify-center">
              <div className="text-center">
                <span className="text-lg font-bold text-purple-800 font-mono">{fmt(ft.orders)}</span>
                <span className="text-xs text-purple-600 ml-2">orders</span>
              </div>
            </div>
            {/* Conversion label */}
            <div className="flex items-center gap-1.5 py-0.5">
              <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              <span className="text-[11px] text-gray-500">{fmtPct(ft.conversion_order_paid)} se pagan</span>
              {ft.orders_cancelled > 0 && <span className="text-[11px] text-red-400">· {fmt(ft.orders_cancelled)} canc.</span>}
            </div>
            {/* Paid */}
            <div className="w-[40%] bg-emerald-100 rounded-b-xl h-14 flex items-center justify-center">
              <div className="text-center">
                <span className="text-lg font-bold text-emerald-800 font-mono">{fmt(ft.orders_paid)}</span>
                <span className="text-xs text-emerald-600 ml-2">pagadas</span>
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
              <p className="text-xs text-gray-400">Tasa: {filteredPartners[0].commission_value}% sobre neto sin IVA</p>
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
