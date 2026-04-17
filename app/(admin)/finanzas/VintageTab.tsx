'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatearMoneda } from '@/lib/utils'

interface VintageRow {
  origination_month: string
  amt_total: number
  amt_por_vencer: number
  amt_cobrada_en_termino: number
  amt_mora_1_29: number
  amt_mora_30_59: number
  amt_mora_60_89: number
  amt_mora_90_119: number
  amt_incobrable_120_plus: number
  amt_recupero_1_29: number
  amt_recupero_30_59: number
  amt_recupero_60_89: number
  amt_recupero_90_119: number
  amt_recupero_120_plus: number
  pct_por_vencer: number
  pct_cobrada_en_termino: number
  pct_mora_1_29: number
  pct_mora_30_59: number
  pct_mora_60_89: number
  pct_mora_90_119: number
  pct_incobrable_120_plus: number
  pct_recupero_1_29: number
  pct_recupero_30_59: number
  pct_recupero_60_89: number
  pct_recupero_90_119: number
  pct_recupero_120_plus: number
}

interface Props {
  data: VintageRow[]
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

const SEGMENTS = [
  { key: 'pct_cobrada_en_termino', label: 'Cobrada en termino', color: '#10B981' },
  { key: 'pct_por_vencer', label: 'Por vencer', color: '#3B82F6' },
  { key: 'pct_mora_1_29', label: 'Mora 1-29', color: '#FCD34D' },
  { key: 'pct_mora_30_59', label: 'Mora 30-59', color: '#F59E0B' },
  { key: 'pct_mora_60_89', label: 'Mora 60-89', color: '#F97316' },
  { key: 'pct_mora_90_119', label: 'Mora 90-119', color: '#EF4444' },
  { key: 'pct_incobrable_120_plus', label: 'Incobrable 120+', color: '#991B1B' },
  { key: 'pct_recupero_1_29', label: 'Recupero 1-29', color: '#6EE7B7' },
  { key: 'pct_recupero_30_59', label: 'Recupero 30-59', color: '#34D399' },
  { key: 'pct_recupero_60_89', label: 'Recupero 60-89', color: '#059669' },
  { key: 'pct_recupero_90_119', label: 'Recupero 90-119', color: '#047857' },
  { key: 'pct_recupero_120_plus', label: 'Recupero 120+', color: '#065F46' },
] as const

export default function VintageTab({ data }: Props) {
  const chartData = data.map((r) => ({
    mes: formatMes(r.origination_month),
    pct_cobrada_en_termino: r.pct_cobrada_en_termino,
    pct_por_vencer: r.pct_por_vencer,
    pct_mora_1_29: r.pct_mora_1_29,
    pct_mora_30_59: r.pct_mora_30_59,
    pct_mora_60_89: r.pct_mora_60_89,
    pct_mora_90_119: r.pct_mora_90_119,
    pct_incobrable_120_plus: r.pct_incobrable_120_plus,
    pct_recupero_1_29: r.pct_recupero_1_29,
    pct_recupero_30_59: r.pct_recupero_30_59,
    pct_recupero_60_89: r.pct_recupero_60_89,
    pct_recupero_90_119: r.pct_recupero_90_119,
    pct_recupero_120_plus: r.pct_recupero_120_plus,
  }))

  return (
    <div className="space-y-6">
      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="max-h-[400px] overflow-auto border border-gray-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr>
                <th className="text-left px-2 py-2 font-semibold text-gray-600 border-b border-gray-200">Mes</th>
                <th className="text-right px-2 py-2 font-semibold text-gray-600 border-b border-gray-200 border-l border-gray-300">Total</th>
                <th className="text-right px-2 py-2 font-semibold text-green-700 border-b border-gray-200 border-l border-gray-300">En term.</th>
                <th className="text-right px-2 py-2 font-semibold text-blue-700 border-b border-gray-200 border-l border-gray-300">Por vencer</th>
                <th colSpan={4} className="text-center px-2 py-2 font-semibold text-orange-700 border-b border-gray-200 border-l border-gray-300">Mora</th>
                <th className="text-right px-2 py-2 font-semibold text-red-900 border-b border-gray-200 border-l border-gray-300">Incobr.</th>
                <th colSpan={5} className="text-center px-2 py-2 font-semibold text-emerald-700 border-b border-gray-200 border-l border-gray-300">Recupero</th>
              </tr>
              <tr>
                <th className="border-b border-gray-200"></th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 border-l border-gray-300">$</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 border-l border-gray-300">%</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 border-l border-gray-300">%</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 border-l border-gray-300">1-29</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200">30-59</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200">60-89</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200">90-119</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 border-l border-gray-300">120+</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 border-l border-gray-300">1-29</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200">30-59</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200">60-89</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200">90-119</th>
                <th className="text-right px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200">120+</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.origination_month} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-gray-700 font-medium">{formatMes(row.origination_month)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-700 border-l border-gray-300">{formatearMoneda(row.amt_total)}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-green-600 border-l border-gray-300">{row.pct_cobrada_en_termino.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-blue-600 border-l border-gray-300">{row.pct_por_vencer.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-yellow-600 border-l border-gray-300">{row.pct_mora_1_29.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-amber-600">{row.pct_mora_30_59.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-orange-600">{row.pct_mora_60_89.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-red-600">{row.pct_mora_90_119.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-bold text-red-900 border-l border-gray-300">{row.pct_incobrable_120_plus.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-emerald-300 border-l border-gray-300">{row.pct_recupero_1_29.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-emerald-400">{row.pct_recupero_30_59.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-emerald-600">{row.pct_recupero_60_89.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-emerald-700">{row.pct_recupero_90_119.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium text-emerald-800">{row.pct_recupero_120_plus.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stacked Bar Chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="mes" stroke="#6b7280" fontSize={10} />
              <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                formatter={(value, name) => {
                  const seg = SEGMENTS.find((s) => s.key === String(name))
                  return [`${Number(value).toFixed(2)}%`, seg?.label ?? String(name)]
                }}
                labelStyle={{ color: '#374151' }}
                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              />
              <Legend
                formatter={(value: string) => {
                  const seg = SEGMENTS.find((s) => s.key === value)
                  return seg?.label ?? value
                }}
                wrapperStyle={{ fontSize: 10 }}
              />
              {SEGMENTS.map((seg) => (
                <Bar key={seg.key} dataKey={seg.key} stackId="vintage" fill={seg.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
