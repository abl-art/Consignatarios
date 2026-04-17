'use client'

import { useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatearMoneda } from '@/lib/utils'

interface DPDRow {
  mes: string
  dpd_1_7_pct: number
  dpd_1_7_monto: number
  dpd_8_30_pct: number
  dpd_8_30_monto: number
  dpd_31_60_pct: number
  dpd_31_60_monto: number
  dpd_60_plus_pct: number
  dpd_60_plus_monto: number
  total_vencido: number
}

interface Props {
  byOrigination: DPDRow[]
  byDueMonth: DPDRow[]
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatMes(mes: string): string {
  const parts = mes.split('-')
  if (parts.length >= 2) {
    const y = parts[0].slice(-2)
    const m = parseInt(parts[1], 10) - 1
    return `${MONTH_NAMES[m] ?? parts[1]}-${y}`
  }
  return mes
}

function pctColor(value: number): string {
  if (value <= 10) return 'text-green-600'
  if (value <= 30) return 'text-yellow-600'
  return 'text-red-600'
}

export default function DPDTab({ byOrigination, byDueMonth }: Props) {
  const [view, setView] = useState<'due' | 'orig'>('due')

  const data = view === 'due' ? byDueMonth : byOrigination

  const chartData = data.map((r) => ({
    mes: formatMes(r.mes),
    '1-7 dias': r.dpd_1_7_pct,
    '8-30 dias': r.dpd_8_30_pct,
    '31-60 dias': r.dpd_31_60_pct,
    '+60 dias': r.dpd_60_plus_pct,
  }))

  return (
    <div className="space-y-6">
      {/* View selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('orig')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${
            view === 'orig'
              ? 'bg-magenta-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Por originacion
        </button>
        <button
          onClick={() => setView('due')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${
            view === 'due'
              ? 'bg-magenta-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Por vencimiento
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="max-h-[360px] overflow-auto border border-gray-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">Mes</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">1-7 dias (%)</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">1-7 dias ($)</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">8-30 dias (%)</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">8-30 dias ($)</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">31-60 dias (%)</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">31-60 dias ($)</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">+60 dias (%)</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">+60 dias ($)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.mes} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-700">{formatMes(row.mes)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${pctColor(row.dpd_1_7_pct)}`}>{row.dpd_1_7_pct.toFixed(2)}%</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{formatearMoneda(row.dpd_1_7_monto)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${pctColor(row.dpd_8_30_pct)}`}>{row.dpd_8_30_pct.toFixed(2)}%</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{formatearMoneda(row.dpd_8_30_monto)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${pctColor(row.dpd_31_60_pct)}`}>{row.dpd_31_60_pct.toFixed(2)}%</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{formatearMoneda(row.dpd_31_60_monto)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${pctColor(row.dpd_60_plus_pct)}`}>{row.dpd_60_plus_pct.toFixed(2)}%</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{formatearMoneda(row.dpd_60_plus_monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stacked Area Chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
              <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(2)}%`]}
                labelStyle={{ color: '#374151' }}
                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              />
              <Legend />
              <Area type="monotone" dataKey="1-7 dias" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.7} />
              <Area type="monotone" dataKey="8-30 dias" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.7} />
              <Area type="monotone" dataKey="31-60 dias" stackId="1" stroke="#F97316" fill="#F97316" fillOpacity={0.7} />
              <Area type="monotone" dataKey="+60 dias" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.7} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
