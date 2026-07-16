'use client'

import { useState, useTransition } from 'react'
import { fetchMeetingsData, type MeetingsData } from '@/lib/actions/crm-keycontact'

function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
function quarterStart(): string { const d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(1); return d.toISOString().slice(0, 10) }

const PRESETS = [
  { label: 'Semana', desde: () => daysAgo(7), hasta: () => today() },
  { label: 'Mes', desde: () => monthStart(), hasta: () => today() },
  { label: 'Trimestre', desde: () => quarterStart(), hasta: () => today() },
]

export default function ReunionesTab({ data: initialData }: { data: MeetingsData }) {
  const [data, setData] = useState(initialData)
  const [desde, setDesde] = useState(daysAgo(30))
  const [hasta, setHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<number | null>(1)
  const [isPending, startTransition] = useTransition()

  function reload(d: string, h: string, presetIdx: number | null) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    startTransition(async () => { setData(await fetchMeetingsData(d, h)) })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx)
  }

  const { total, meetings } = data

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

      {/* KPI card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Reuniones agendadas</p>
          <p className="text-3xl font-bold text-gray-900">{total}</p>
        </div>
      </div>

      {/* Meetings table */}
      {meetings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Sin reuniones para este período.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Deal</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meetings.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-700">{new Date(m.scheduled_date).toLocaleDateString('es-AR')}</td>
                  <td className="px-5 py-3 font-semibold text-gray-900">{m.deal_name}</td>
                  <td className="px-5 py-3 text-gray-600 capitalize">{m.meeting_type ?? '-'}</td>
                  <td className="px-5 py-3">
                    {m.executed_at ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        Ejecutada{m.outcome ? ` — ${m.outcome}` : ''}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        Agendada
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
