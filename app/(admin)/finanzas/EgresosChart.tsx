'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface EgresosChartProps {
  data: { mes: string; celulares: number; licencias: number; descartables: number; sueldos: number; envios: number; interes: number; otros: number; vta3ero: number }[]
}

const lines = [
  { dataKey: 'celulares', name: 'Celulares', stroke: '#E91E7B' },
  { dataKey: 'licencias', name: 'Licencias', stroke: '#3B82F6' },
  { dataKey: 'descartables', name: 'Descartables', stroke: '#F59E0B' },
  { dataKey: 'sueldos', name: 'Sueldos', stroke: '#10B981' },
  { dataKey: 'envios', name: 'Envíos', stroke: '#8B5CF6' },
  { dataKey: 'interes', name: 'Interés', stroke: '#EF4444' },
  { dataKey: 'otros', name: 'Otros', stroke: '#6B7280' },
  { dataKey: 'vta3ero', name: 'Vta3ero', stroke: '#F97316' },
]

export default function EgresosChart({ data }: EgresosChartProps) {
  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
          <YAxis stroke="#6b7280" fontSize={11} tickFormatter={fmt} />
          <Tooltip
            formatter={(value, name) => [`$${fmt(Number(value))}`, name]}
            labelStyle={{ color: '#374151' }}
            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
          />
          <Legend />
          {lines.map((line) => (
            <Line key={line.dataKey} type="monotone" dataKey={line.dataKey} name={line.name} stroke={line.stroke} strokeWidth={2} dot={{ r: 4, fill: line.stroke }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
