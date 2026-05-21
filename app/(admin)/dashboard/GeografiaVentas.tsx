'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { VentasPorProvincia, VentasPorCiudad } from '@/lib/gocelular'

const COLORES = ['#E91E7B', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#6366F1', '#84CC16']

// Mapa simplificado de Argentina — cada provincia es un rect posicionado en una grilla
// para evitar un SVG path complejo. Posiciones relativas aprox.
const PROV_GRID: Record<string, { col: number; row: number }> = {
  'JUJUY': { col: 2, row: 0 },
  'SALTA': { col: 2, row: 1 },
  'FORMOSA': { col: 3, row: 1 },
  'CATAMARCA': { col: 2, row: 2 },
  'TUCUMAN': { col: 2, row: 2.6 },
  'CHACO': { col: 3, row: 2 },
  'MISIONES': { col: 4, row: 2 },
  'SANTIAGO DEL ESTERO': { col: 2, row: 3 },
  'CORRIENTES': { col: 3, row: 3 },
  'LA RIOJA': { col: 1, row: 3 },
  'SAN JUAN': { col: 1, row: 4 },
  'SANTA FE': { col: 3, row: 4 },
  'ENTRE RIOS': { col: 3, row: 5 },
  'CORDOBA': { col: 2, row: 4 },
  'SAN LUIS': { col: 1, row: 5 },
  'MENDOZA': { col: 1, row: 6 },
  'LA PAMPA': { col: 2, row: 6 },
  'BUENOS AIRES': { col: 3, row: 6 },
  'CAPITAL FEDERAL': { col: 3.6, row: 5.5 },
  'NEUQUEN': { col: 1, row: 7 },
  'RIO NEGRO': { col: 2, row: 7 },
  'CHUBUT': { col: 1, row: 8 },
  'SANTA CRUZ': { col: 1, row: 9 },
  'TIERRA DEL FUEGO': { col: 1, row: 10 },
}

interface Props {
  provincias: VentasPorProvincia[]
  ciudades: VentasPorCiudad[]
}

export default function GeografiaVentas({ provincias, ciudades }: Props) {
  const total = provincias.reduce((s, p) => s + p.ordenes, 0)
  const top5 = useMemo(() => new Set(provincias.slice(0, 5).map(p => p.provincia)), [provincias])
  const maxOrdenes = provincias.length > 0 ? provincias[0].ordenes : 1
  const provMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of provincias) m.set(p.provincia, p.ordenes)
    return m
  }, [provincias])

  function getColor(prov: string): string {
    const ordenes = provMap.get(prov) ?? 0
    if (ordenes === 0) return '#e5e7eb'
    const intensity = Math.max(0.15, ordenes / maxOrdenes)
    if (top5.has(prov)) return `rgba(233, 30, 123, ${intensity})`
    return `rgba(99, 102, 241, ${intensity})`
  }

  const cellSize = 42
  const gap = 3

  return (
    <div className="space-y-4">
      {/* Mapa */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Ventas por provincia</h3>
        <p className="text-[10px] text-gray-400 mb-3">{total} ordenes propias con datos de envio</p>
        <div className="flex justify-center">
          <svg width={5.5 * (cellSize + gap)} height={11.5 * (cellSize + gap)} className="max-w-full">
            {Object.entries(PROV_GRID).map(([prov, pos]) => {
              const ordenes = provMap.get(prov) ?? 0
              const isTop5 = top5.has(prov)
              const x = pos.col * (cellSize + gap)
              const y = pos.row * (cellSize + gap)
              // Abreviar nombre
              const abbr = prov.length > 10 ? prov.slice(0, 3) + '.' : prov
              return (
                <g key={prov}>
                  <rect x={x} y={y} width={cellSize} height={cellSize} rx={4}
                    fill={getColor(prov)}
                    stroke={isTop5 ? '#E91E7B' : '#d1d5db'} strokeWidth={isTop5 ? 2 : 0.5}
                  />
                  <text x={x + cellSize / 2} y={y + cellSize / 2 - 4} textAnchor="middle" fontSize={7}
                    fill={ordenes > maxOrdenes * 0.3 ? '#fff' : '#374151'} fontWeight={isTop5 ? 700 : 400}>
                    {abbr}
                  </text>
                  <text x={x + cellSize / 2} y={y + cellSize / 2 + 8} textAnchor="middle" fontSize={9}
                    fill={ordenes > maxOrdenes * 0.3 ? '#fff' : '#111827'} fontWeight={700}>
                    {ordenes > 0 ? ordenes : ''}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
        {/* Top 5 leyenda */}
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {provincias.slice(0, 5).map((p, i) => (
            <span key={p.provincia} className="text-[10px] px-2 py-0.5 rounded-full bg-magenta-100 text-magenta-700 font-medium">
              {i + 1}. {p.provincia} ({p.ordenes})
            </span>
          ))}
        </div>
      </div>

      {/* Torta ciudades */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Top 10 ciudades</h3>
        <p className="text-[10px] text-gray-400 mb-3">Por cantidad de ordenes propias</p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={ciudades} dataKey="ordenes" nameKey="ciudad" cx="50%" cy="50%"
                outerRadius={80} innerRadius={35} paddingAngle={2}
                label={false}>
                {ciudades.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-1 mt-2">
          {ciudades.map((c, i) => (
            <div key={c.ciudad} className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORES[i % COLORES.length] }}></div>
              <span className="text-gray-700 truncate">{c.ciudad}</span>
              <span className="text-gray-400 ml-auto">{c.ordenes}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
