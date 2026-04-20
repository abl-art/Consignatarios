'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface Props {
  data: { cash_date: string; cash_balance: number }[]
}

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

export default function CashBalanceChart({ data }: Props) {
  if (data.length === 0) return null

  const chartData = data.map(d => ({
    label: formatDate(d.cash_date),
    saldo: Math.round(d.cash_balance),
  }))

  const minSaldo = Math.min(...chartData.map(d => d.saldo))
  const maxSaldo = Math.max(...chartData.map(d => d.saldo))
  const hasNegative = minSaldo < 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Saldo acumulado</h3>
      <p className="text-xs text-gray-400 mb-3">Evolución diaria del cash balance</p>
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
