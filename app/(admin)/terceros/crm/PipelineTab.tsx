'use client'

import { useState, useTransition } from 'react'
import { fetchPipelineData, type PipelineData, type Owner } from '@/lib/actions/crm-keycontact'

function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
function quarterStart(): string { const d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(1); return d.toISOString().slice(0, 10) }

const PRESETS = [
  { label: 'Semana', desde: () => daysAgo(7), hasta: () => today() },
  { label: 'Mes', desde: () => monthStart(), hasta: () => today() },
  { label: 'Trimestre', desde: () => quarterStart(), hasta: () => today() },
]

const STAGE_COLORS: Record<string, string> = {
  prospecto: 'bg-gray-100 text-gray-700',
  lead: 'bg-blue-100 text-blue-700',
  reunion_propuesta: 'bg-indigo-100 text-indigo-700',
  seguimiento: 'bg-purple-100 text-purple-700',
  parcialmente_ganado: 'bg-amber-100 text-amber-700',
  ganado: 'bg-emerald-100 text-emerald-700',
  perdido: 'bg-red-100 text-red-700',
}

export default function PipelineTab({ data: initialData, owners: initialOwners }: { data: PipelineData; owners: Owner[] }) {
  const [data, setData] = useState(initialData)
  const [desde, setDesde] = useState(daysAgo(30))
  const [hasta, setHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<number | null>(1)
  const [stageFilter, setStageFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [isPending, startTransition] = useTransition()

  function reload(d: string, h: string, presetIdx: number | null, stage?: string, owner?: string) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    const sf = stage ?? stageFilter
    const of = owner ?? ownerFilter
    startTransition(async () => { setData(await fetchPipelineData(d, h, sf, of)) })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx)
  }

  function handleStageChange(slug: string) {
    setStageFilter(slug); reload(desde, hasta, activePreset, slug, ownerFilter)
  }

  function handleOwnerChange(id: string) {
    setOwnerFilter(id); reload(desde, hasta, activePreset, stageFilter, id)
  }

  const { stages, deals: allDeals } = data
  const deals = nameFilter
    ? allDeals.filter(d => d.name.toLowerCase().includes(nameFilter.toLowerCase()))
    : allDeals
  const avgLeadScore = allDeals.length > 0
    ? allDeals.reduce((s, d) => s + (d.lead_score ?? 0), 0) / allDeals.filter(d => d.lead_score != null).length
    : 0

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
        <span className="text-gray-300 ml-1">|</span>
        <select value={stageFilter} onChange={e => handleStageChange(e.target.value)}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
          <option value="">Todas las etapas</option>
          {stages.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
        <select value={ownerFilter} onChange={e => handleOwnerChange(e.target.value)}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
          <option value="">Todos los owners</option>
          {initialOwners.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
        </select>
        <span className="text-gray-300 ml-1">|</span>
        <input type="text" value={nameFilter} onChange={e => setNameFilter(e.target.value)}
          placeholder="Buscar comercio..."
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg min-w-[160px]" />
      </div>

      {/* Stage summary cards + Lead Score KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {stages.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-700 mb-2 truncate">{s.name}</p>
            <p className="text-2xl font-bold text-gray-900">{s.deals_count}</p>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-emerald-600">+{s.entradas}</span>
              <span className="text-red-500">-{s.salidas}</span>
            </div>
          </div>
        ))}
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <p className="text-xs font-semibold text-blue-700 mb-2">Lead Score Prom.</p>
          <p className="text-2xl font-bold text-blue-900">{isNaN(avgLeadScore) ? '-' : avgLeadScore.toFixed(1)}</p>
          <p className="text-xs text-blue-500 mt-2">{allDeals.filter(d => d.lead_score != null).length} deals</p>
        </div>
      </div>

      {/* Deals table */}
      {deals.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Sin deals para este filtro.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Comercio</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Ciudad/Provincia</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Sucursales</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Etapa</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Owner</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Lead Score</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Última actividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deals.map(d => (
                <>
                  <tr key={d.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                    <td className="px-5 py-3 font-semibold text-gray-900">{d.name}</td>
                    <td className="px-5 py-3 text-gray-500">{[d.city, d.province].filter(Boolean).join(', ') || '-'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{d.locations_count}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[d.stage_slug] ?? 'bg-gray-100 text-gray-600'}`}>
                        {d.stage_name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{d.owner_name}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{d.lead_score ?? '-'}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{d.updated_at ? new Date(d.updated_at).toLocaleDateString('es-AR') : '-'}</td>
                  </tr>
                  {expandedId === d.id && (
                    <tr key={`${d.id}-detail`} className="bg-gray-50">
                      <td colSpan={7} className="px-5 py-3">
                        <div className="flex gap-6 text-xs text-gray-600">
                          <div><span className="font-medium text-gray-700">Contacto:</span> {d.contact_name ?? 'Sin contacto'}</div>
                          {d.contact_email && <div><span className="font-medium text-gray-700">Email:</span> {d.contact_email}</div>}
                          {d.contact_phone && <div><span className="font-medium text-gray-700">Tel:</span> {d.contact_phone}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
