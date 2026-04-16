'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface PermanenciaChartProps {
  data: { modelo: string; dias: number; cantidad: number }[]
}

function colorForDias(dias: number): string {
  if (dias < 30) return '#16a34a'    // verde
  if (dias <= 60) return '#eab308'   // amarillo
  return '#dc2626'                    // rojo
}

export default function PermanenciaChart({ data }: PermanenciaChartProps) {
  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 60, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="modelo"
            stroke="#6b7280"
            fontSize={10}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={70}
          />
          <YAxis stroke="#6b7280" fontSize={11} label={{ value: 'Días', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6b7280' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
            formatter={(value, _name, item) => {
              const cantidad = item?.payload?.cantidad
              return [`${Number(value)} días (${cantidad} equipos)`, 'Permanencia']
            }}
          />
          <Bar dataKey="dias" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={colorForDias(entry.dias)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
