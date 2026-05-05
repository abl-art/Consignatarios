'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ConversionDiaria {
  fecha: string
  total: number
  delivered: number
  pct: number
}

type Granularidad = 'mensual' | 'diario'

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
        active
          ? 'bg-[#E91E7B] text-white border-[#E91E7B]'
          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
      }`}
    >
      {label}
    </button>
  )
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`
}

function formatDay(yyyyMmDd: string): string {
  const [, month, day] = yyyyMmDd.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(day, 10)} ${monthNames[parseInt(month, 10) - 1]}`
}

export default function ConversionChart({ data }: { data: ConversionDiaria[] }) {
  const [granularidad, setGranularidad] = useState<Granularidad>('mensual')

  const chartData = useMemo(() => {
    const groups = new Map<string, { total: number; delivered: number }>()

    for (const row of data) {
      const key = granularidad === 'mensual' ? row.fecha.slice(0, 7) : row.fecha
      const existing = groups.get(key) ?? { total: 0, delivered: 0 }
      existing.total += row.total
      existing.delivered += row.delivered
      groups.set(key, existing)
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, vals]) => ({
        label: granularidad === 'mensual' ? formatMonth(key) : formatDay(key),
        pct: vals.total > 0 ? Math.round((vals.delivered / vals.total) * 10000) / 100 : 0,
      }))
  }, [data, granularidad])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Conversión GOcuotas (% entregadas)</h3>

      <div className="flex items-center gap-1 mb-4">
        <Pill label="Mensual" active={granularidad === 'mensual'} onClick={() => setGranularidad('mensual')} />
        <Pill label="Diario" active={granularidad === 'diario'} onClick={() => setGranularidad('diario')} />
      </div>

      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Conversión']}
              labelStyle={{ color: '#374151' }}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4, fill: '#10b981' }}
              label={((props: { x: number; y: number; value: number }) => (
                <text x={props.x} y={props.y - 10} textAnchor="middle" fill="#6b7280" fontSize={9}>
                  {props.value.toFixed(1)}%
                </text>
              )) as any}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
