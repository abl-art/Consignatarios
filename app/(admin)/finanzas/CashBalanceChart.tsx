'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface Props {
  data: { cash_date: string; cash_balance: number }[]
}

type Periodo = 'total' | '3m' | '2m' | '1m'

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function formatDate(ds: string): string {
  const [, m, d] = ds.split('-')
  return `${d}/${m}`
}

function formatLabel(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function getEndDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months + 1, 0) // last day of target month
  return d.toISOString().slice(0, 10)
}

function getStartOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function CashBalanceChart({ data }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('1m')

  const filteredData = useMemo(() => {
    if (periodo === 'total') return data
    const start = getStartOfMonth()
    const months = periodo === '3m' ? 3 : periodo === '2m' ? 2 : 1
    const end = getEndDate(months)
    return data.filter(d => d.cash_date >= start && d.cash_date <= end)
  }, [data, periodo])

  if (data.length === 0) return null

  const chartData = filteredData.map(d => ({
    label: formatDate(d.cash_date),
    saldo: Math.round(d.cash_balance),
  }))

  const minSaldo = chartData.length > 0 ? Math.min(...chartData.map(d => d.saldo)) : 0
  const hasNegative = minSaldo < 0

  const periodos: { key: Periodo; label: string }[] = [
    { key: '1m', label: '1 mes' },
    { key: '2m', label: '2 meses' },
    { key: '3m', label: '3 meses' },
    { key: 'total', label: 'Total' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Saldo acumulado</h3>
          <p className="text-xs text-gray-400">Evolución diaria del cash balance</p>
        </div>
        <div className="flex gap-1">
          {periodos.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                periodo === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={10} interval="preserveStartEnd" />
            <YAxis stroke="#6b7280" fontSize={10} tickFormatter={formatLabel} domain={[hasNegative ? 'auto' : 0, 'auto']} />
            {hasNegative && <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />}
            <Tooltip
              formatter={(value) => [`$${fmt.format(Number(value))}`, 'Saldo']}
              labelStyle={{ color: '#374151' }}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
            />
            <defs>
              <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.8} />
                <stop offset={hasNegative ? '50%' : '100%'} stopColor="#3B82F6" stopOpacity={0.6} />
                {hasNegative && <stop offset="100%" stopColor="#EF4444" stopOpacity={0.8} />}
              </linearGradient>
            </defs>
            <Line
              type="monotone"
              dataKey="saldo"
              stroke="url(#saldoGradient)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#3B82F6' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
