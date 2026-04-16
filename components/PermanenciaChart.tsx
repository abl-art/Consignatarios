'use client'

import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export interface PermanenciaRow {
  modelo: string
  marca: string
  consignatarioId: string
  consignatarioNombre: string
  dias: number
  cantidad: number
}

interface Props {
  rows: PermanenciaRow[]
}

function colorForDias(dias: number): string {
  if (dias < 30) return '#16a34a'
  if (dias <= 60) return '#eab308'
  return '#dc2626'
}

export default function PermanenciaChart({ rows }: Props) {
  const [consigFilter, setConsigFilter] = useState<string>('')

  // Build dropdown options from unique consignatarios
  const consignatarios = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) map.set(r.consignatarioId, r.consignatarioNombre)
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }))
  }, [rows])

  // Data to chart: if no filter, aggregate across all consignatarios per modelo
  // if filter, show that consignatario's models only
  const chartData = useMemo(() => {
    if (consigFilter) {
      return rows
        .filter((r) => r.consignatarioId === consigFilter)
        .map((r) => ({ label: `${r.marca} ${r.modelo}`, dias: r.dias, cantidad: r.cantidad }))
        .sort((a, b) => b.dias - a.dias)
    }
    // Aggregate across all consignatarios per modelo
    const agg: Record<string, { sumaPonderada: number; cantidad: number; marca: string; modelo: string }> = {}
    for (const r of rows) {
      const key = `${r.marca} ${r.modelo}`
      if (!agg[key]) agg[key] = { sumaPonderada: 0, cantidad: 0, marca: r.marca, modelo: r.modelo }
      agg[key].sumaPonderada += r.dias * r.cantidad
      agg[key].cantidad += r.cantidad
    }
    return Object.entries(agg)
      .map(([key, v]) => ({
        label: key,
        dias: v.cantidad > 0 ? Math.round(v.sumaPonderada / v.cantidad) : 0,
        cantidad: v.cantidad,
      }))
      .sort((a, b) => b.dias - a.dias)
  }, [rows, consigFilter])

  return (
    <div>
      <div className="flex justify-end mb-3">
        <select
          value={consigFilter}
          onChange={(e) => setConsigFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Todos los consignatarios</option>
          {consignatarios.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      {chartData.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {consigFilter ? 'Este consignatario no tiene stock asignado.' : 'Sin datos para mostrar.'}
        </p>
      ) : (
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 70, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                stroke="#6b7280"
                fontSize={10}
                angle={-35}
                textAnchor="end"
                interval={0}
                height={80}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={11}
                label={{ value: 'Días', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6b7280' }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                formatter={(value, _name, item) => {
                  const cantidad = item?.payload?.cantidad
                  return [`${Number(value)} días (${cantidad} equipos)`, 'Permanencia']
                }}
              />
              <Bar dataKey="dias" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={colorForDias(entry.dias)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
