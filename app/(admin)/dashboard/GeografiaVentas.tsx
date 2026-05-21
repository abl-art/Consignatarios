'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { VentasPorProvincia, VentasPorCiudad } from '@/lib/gocelular'
import { PROVINCIAS_SVG } from './argentina-paths'

const COLORES = ['#E91E7B', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#6366F1', '#84CC16']

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
    if (ordenes === 0) return '#f3f4f6'
    const intensity = Math.max(0.2, ordenes / maxOrdenes)
    if (top5.has(prov)) return `rgba(233, 30, 123, ${intensity})`
    return `rgba(99, 102, 241, ${intensity})`
  }

  return (
    <div className="space-y-4">
      {/* Mapa político */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Ventas por provincia</h3>
        <p className="text-[10px] text-gray-400 mb-2">{total} ordenes propias</p>
        <div className="flex justify-center">
          <svg viewBox="20 0 300 560" className="w-full max-w-[280px]">
            {Object.entries(PROVINCIAS_SVG).map(([prov, { d, cx, cy }]) => {
              const ordenes = provMap.get(prov) ?? 0
              const isTop5 = top5.has(prov)
              return (
                <g key={prov}>
                  <path d={d} fill={getColor(prov)}
                    stroke={isTop5 ? '#E91E7B' : '#9ca3af'} strokeWidth={isTop5 ? 1.5 : 0.5}
                  />
                  {ordenes > 0 && (
                    <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
                      fontSize={ordenes >= 100 ? 10 : 9} fontWeight={700}
                      fill={ordenes > maxOrdenes * 0.25 ? '#fff' : '#111827'}>
                      {ordenes}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2 justify-center">
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
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={ciudades} dataKey="ordenes" nameKey="ciudad" cx="50%" cy="50%"
                outerRadius={75} innerRadius={30} paddingAngle={2}
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
