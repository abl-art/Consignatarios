'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface VentasChartProps {
  data: { mes: string; total: number }[]
}

export default function VentasChart({ data }: VentasChartProps) {
  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
          <YAxis stroke="#6b7280" fontSize={11} tickFormatter={fmt} />
          <Tooltip
            formatter={(value) => [`$${fmt(Number(value))}`, 'Ventas']}
            labelStyle={{ color: '#374151' }}
            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="total" stroke="#E91E7B" strokeWidth={2} dot={{ r: 4, fill: '#E91E7B' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
