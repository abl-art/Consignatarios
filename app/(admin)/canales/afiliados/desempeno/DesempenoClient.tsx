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
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - offset)
  return d.toISOString().slice(0, 10)
}
function monthEnd(offset: number = 0): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - offset + 1)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
function monthLabel(offset: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - offset)
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
  const [activePreset, setActivePreset] = useState<number | null>(1) // 30 días default
  const [isPending, startTransition] = useTransition()

  // Actividad filters
  const [actDesde, setActDesde] = useState('')
  const [actHasta, setActHasta] = useState('')
  const [actPreset, setActPreset] = useState<string>('all')

  // Partner table filter
  const [filtroPartner, setFiltroPartner] = useState<string>('')

  function reload(d: string, h: string, presetIdx: number | null) {
    setDesde(d)
    setHasta(h)
    setActivePreset(presetIdx)
    startTransition(async () => {
      const result = await fetchDesempenoAfiliados(d, h)
      setData(result)
    })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]
    reload(p.desde(), p.hasta(), idx)
  }

  function handleCustomRange() {
    if (desde && hasta) {
      reload(desde, hasta, null)
    }
  }

  const { totals, partners, diario, productos } = data
  const partnerSlugs = useMemo(() => partners.map(p => p.partner_slug), [partners])

  // Filter partners
  const filteredPartners = filtroPartner
    ? partners.filter(p => p.partner_slug === filtroPartner)
    : partners

  const filteredTotals = useMemo(() => {
    if (!filtroPartner) return totals
    const fp = filteredPartners
    const t = fp.reduce((s, p) => s + p.touches, 0)
    const o = fp.reduce((s, p) => s + p.orders, 0)
    const paid = fp.reduce((s, p) => s + p.orders_paid, 0)
    return {
      ...totals,
      touches: t,
      visitors: fp.reduce((s, p) => s + p.visitors, 0),
      orders: o,
      orders_paid: paid,
      orders_cancelled: fp.reduce((s, p) => s + p.orders_cancelled, 0),
      revenue_paid: fp.reduce((s, p) => s + p.revenue_paid, 0),
      revenue_total: fp.reduce((s, p) => s + p.revenue_total, 0),
      commission_estimated: fp.reduce((s, p) => s + p.commission_estimated, 0),
      conversion_touch_order: t > 0 ? (o / t) * 100 : 0,
      conversion_order_paid: o > 0 ? (paid / o) * 100 : 0,
      conversion_touch_paid: t > 0 ? (paid / t) * 100 : 0,
    }
  }, [filtroPartner, filteredPartners, totals])

  // Filter actividad
  const filteredDiario = useMemo(() => {
    let rows = diario
    if (actPreset === '7d') {
      const cutoff = daysAgo(7)
      rows = rows.filter(d => d.fecha >= cutoff)
    } else if (actPreset === 'month0') {
      const start = monthStart(0)
      rows = rows.filter(d => d.fecha >= start)
    } else if (actPreset === 'month1') {
      const start = monthStart(1)
      const end = monthEnd(1)
      rows = rows.filter(d => d.fecha >= start && d.fecha <= end)
    } else if (actPreset === 'custom' && actDesde && actHasta) {
      rows = rows.filter(d => d.fecha >= actDesde && d.fecha <= actHasta)
    }
    return rows
  }, [diario, actPreset, actDesde, actHasta])

  const actFechas = useMemo(() => [...new Set(filteredDiario.map(d => d.fecha))], [filteredDiario])

  return (
    <div className={`p-4 md:p-6 max-w-7xl mx-auto space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Header */}
      <div>
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
        </div>
        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => handlePreset(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activePreset === i
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
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
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activePreset === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            Aplicar
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Touches</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{fmt(filteredTotals.touches)}</p>
          <p className="text-xs text-gray-400 mt-1">{fmt(filteredTotals.visitors)} visitantes</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Orders generadas</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{fmt(filteredTotals.orders)}</p>
          <p className="text-xs text-purple-600 mt-1 font-medium">{fmtPct(filteredTotals.conversion_touch_order)} conv. touch→order</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Orders pagadas</p>
          <p className="text-2xl font-bold text-emerald-600 font-mono">{fmt(filteredTotals.orders_paid)}</p>
          <p className="text-xs text-emerald-600 mt-1 font-medium">{fmtPct(filteredTotals.conversion_order_paid)} conv. order→paid</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Revenue pagado</p>
          <p className="text-2xl font-bold text-emerald-600 font-mono">{fmtPesos(filteredTotals.revenue_paid)}</p>
          <p className="text-xs text-purple-600 mt-1 font-medium">Comisión est. {fmtPesos(filteredTotals.commission_estimated)}</p>
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Funnel de conversión</h2>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <div className="flex flex-col items-center">
            <div className="bg-blue-100 text-blue-800 rounded-lg px-4 py-3 text-center min-w-[100px]">
              <p className="text-xs font-medium">Touches</p>
              <p className="text-lg font-bold font-mono">{fmt(filteredTotals.touches)}</p>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-gray-400 text-lg">&rarr;</span>
            <span className="text-xs text-gray-500 font-mono">{fmtPct(filteredTotals.conversion_touch_order)}</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="bg-purple-100 text-purple-800 rounded-lg px-4 py-3 text-center min-w-[100px]">
              <p className="text-xs font-medium">Orders</p>
              <p className="text-lg font-bold font-mono">{fmt(filteredTotals.orders)}</p>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-gray-400 text-lg">&rarr;</span>
            <span className="text-xs text-gray-500 font-mono">{fmtPct(filteredTotals.conversion_order_paid)}</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="bg-emerald-100 text-emerald-800 rounded-lg px-4 py-3 text-center min-w-[100px]">
              <p className="text-xs font-medium">Pagadas</p>
              <p className="text-lg font-bold font-mono">{fmt(filteredTotals.orders_paid)}</p>
            </div>
          </div>
          {filteredTotals.orders_cancelled > 0 && (
            <div className="flex flex-col items-center ml-2">
              <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 text-center">
                <p className="text-xs font-medium">Canc.</p>
                <p className="text-sm font-bold font-mono">{fmt(filteredTotals.orders_cancelled)}</p>
              </div>
            </div>
          )}
        </div>
        <p className="text-center text-xs text-gray-500 mt-3">
          Conversión total touch → pagada: <span className="font-semibold text-gray-700">{fmtPct(filteredTotals.conversion_touch_paid)}</span>
        </p>
      </div>

      {/* Per-Partner Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Por partner</h2>
          <div className="flex gap-1">
            <button onClick={() => setFiltroPartner('')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${!filtroPartner ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Todos
            </button>
            {partnerSlugs.map(slug => (
              <button key={slug} onClick={() => setFiltroPartner(slug)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${filtroPartner === slug ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {slug}
              </button>
            ))}
          </div>
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
                        convPct >= 5 ? 'bg-emerald-100 text-emerald-700' :
                        convPct >= 2 ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-600'
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
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(filteredTotals.touches)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(filteredTotals.visitors)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(filteredTotals.orders)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-600">{fmt(filteredTotals.orders_paid)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-red-500">{filteredTotals.orders_cancelled > 0 ? fmt(filteredTotals.orders_cancelled) : '-'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                      {fmtPct(filteredTotals.conversion_touch_paid)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtPesos(filteredTotals.revenue_paid)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-purple-600">{fmtPesos(filteredTotals.commission_estimated)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Actividad */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Actividad</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setActPreset('all')}
              className={`px-3 py-1 text-xs font-medium rounded-full ${actPreset === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Todo
            </button>
            <button onClick={() => setActPreset('7d')}
              className={`px-3 py-1 text-xs font-medium rounded-full ${actPreset === '7d' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              7 días
            </button>
            <button onClick={() => setActPreset('month0')}
              className={`px-3 py-1 text-xs font-medium rounded-full ${actPreset === 'month0' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {monthLabel(0)}
            </button>
            <button onClick={() => setActPreset('month1')}
              className={`px-3 py-1 text-xs font-medium rounded-full ${actPreset === 'month1' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {monthLabel(1)}
            </button>
            <span className="text-gray-300">|</span>
            <input type="date" value={actDesde} onChange={e => setActDesde(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg" />
            <span className="text-xs text-gray-400">a</span>
            <input type="date" value={actHasta} onChange={e => setActHasta(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg" />
            <button onClick={() => setActPreset('custom')}
              className={`px-3 py-1 text-xs font-medium rounded-full ${actPreset === 'custom' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Aplicar
            </button>
          </div>
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
              {actFechas.map(fecha => {
                const rows = filteredDiario.filter(d => d.fecha === fecha)
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
                    <td className="px-4 py-2 text-right font-mono text-xs">{row.revenue > 0 ? fmtPesos(row.revenue) : '—'}</td>
                  </tr>
                ))
              })}
              {actFechas.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Sin actividad en el período seleccionado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                  <td className="px-4 py-2 text-right font-mono text-xs">{p.revenue > 0 ? fmtPesos(p.revenue) : '—'}</td>
                </tr>
              ))}
              {productos.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Sin productos en el período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
