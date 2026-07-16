'use client'

import { useState, useTransition } from 'react'
import { fetchConversionData, type ConversionData } from '@/lib/actions/crm-keycontact'

function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
function quarterStart(): string { const d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(1); return d.toISOString().slice(0, 10) }

const PRESETS = [
  { label: 'Semana', desde: () => daysAgo(7), hasta: () => today() },
  { label: 'Mes', desde: () => monthStart(), hasta: () => today() },
  { label: 'Trimestre', desde: () => quarterStart(), hasta: () => today() },
]

const FUNNEL_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  { bg: 'bg-purple-100', text: 'text-purple-800' },
  { bg: 'bg-amber-100', text: 'text-amber-800' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800' },
]

function fmtPct(n: number): string { return n.toFixed(1) + '%' }

export default function ConversionTab({ data: initialData }: { data: ConversionData }) {
  const [data, setData] = useState(initialData)
  const [desde, setDesde] = useState(daysAgo(30))
  const [hasta, setHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<number | null>(1)
  const [isPending, startTransition] = useTransition()

  function reload(d: string, h: string, presetIdx: number | null) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    startTransition(async () => { setData(await fetchConversionData(d, h)) })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx)
  }

  const { stages, transitions, total_rate, avg_time_per_stage, avg_total_days } = data
  const openStages = stages.filter(s => s.slug !== 'perdido')
  const maxDeals = Math.max(...openStages.map(s => s.deals_count), 1)

  return (
    <div className={`space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
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
        <button onClick={() => reload(desde, hasta, null)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Aplicar
        </button>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-6">Funnel de conversión</h2>
        <div className="flex flex-col items-center gap-1">
          {openStages.map((s, i) => {
            const widthPct = Math.max((s.deals_count / maxDeals) * 100, 15)
            const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
            const nextStage = openStages[i + 1]
            const transition = nextStage ? transitions.find(t => t.from_name === s.name && t.to_name === nextStage.name) : null
            return (
              <div key={s.id} className="w-full flex flex-col items-center">
                <div className={`${color.bg} ${i === 0 ? 'rounded-t-xl' : ''} ${i === openStages.length - 1 ? 'rounded-b-xl' : ''} h-14 flex items-center justify-center`}
                  style={{ width: `${widthPct}%` }}>
                  <div className="text-center">
                    <span className={`text-lg font-bold ${color.text} font-mono`}>{s.deals_count}</span>
                    <span className={`text-xs ${color.text} ml-2`}>{s.name}</span>
                  </div>
                </div>
                {transition && (
                  <div className="flex items-center gap-1.5 py-0.5">
                    <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    <span className="text-[11px] text-gray-500">{fmtPct(transition.rate)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 text-center">
          <span className="text-xs text-gray-500">Conversión total Prospecto → Ganado: </span>
          <span className="text-sm font-bold text-gray-900">{fmtPct(total_rate)}</span>
        </div>
      </div>

      {/* Conversion rates + Total */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Tasa por etapa</h2>
          {transitions.length === 0 ? (
            <p className="text-sm text-gray-400">Sin transiciones en este período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 text-xs font-medium text-gray-500">Transición</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500">Deals</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500">Tasa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transitions.map((t, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-700">{t.from_name} → {t.to_name}</td>
                    <td className="py-2 text-right text-gray-600">{t.count}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">{fmtPct(t.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-5 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-500 mb-2">Conversión total</p>
          <p className="text-4xl font-bold text-gray-900">{fmtPct(total_rate)}</p>
          <p className="text-xs text-gray-400 mt-1">Prospecto → Ganado / Parcialmente Ganado</p>
        </div>
      </div>

      {/* Time metrics */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
        <div className="flex items-baseline gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Tiempo promedio por etapa</h2>
          <span className="text-xs text-gray-400">|</span>
          <span className="text-xs text-gray-500">Total Prospecto → Ganado:</span>
          <span className="text-lg font-bold text-gray-900">{avg_total_days} días</span>
        </div>
        {avg_time_per_stage.length === 0 ? (
          <p className="text-sm text-gray-400">Sin datos de tiempo en este período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 text-xs font-medium text-gray-500">Etapa</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500">Promedio (días)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {avg_time_per_stage.map((t, i) => (
                <tr key={i}>
                  <td className="py-2 text-gray-700">{t.stage_name}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">{t.avg_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
