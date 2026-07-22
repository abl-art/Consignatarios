'use client'

import { useState, useTransition } from 'react'
import { getVentasPorMarca } from '@/lib/actions/dashboard'
import type { VentasPorMarca } from '@/lib/gocelular'

function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function yearStart(): string { return new Date().getFullYear() + '-01-01' }

const PRESETS = [
  { label: 'Ayer', desde: () => daysAgo(1), hasta: () => daysAgo(1) },
  { label: '7 días', desde: () => daysAgo(7), hasta: () => today() },
  { label: '30 días', desde: () => daysAgo(30), hasta: () => today() },
  { label: 'Este año', desde: () => yearStart(), hasta: () => today() },
]

const COLORS = ['#be185d', '#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#4b5563']

interface PieSlice {
  marca: string
  ventas: number
  pct: number
  color: string
  startAngle: number
  endAngle: number
}

function buildSlices(data: VentasPorMarca[]): PieSlice[] {
  const total = data.reduce((s, d) => s + d.ventas, 0)
  if (total === 0) return []
  let cumAngle = 0
  return data.map((d, i) => {
    const pct = (d.ventas / total) * 100
    const angle = (d.ventas / total) * 360
    const slice: PieSlice = {
      marca: d.marca,
      ventas: d.ventas,
      pct,
      color: COLORS[i % COLORS.length],
      startAngle: cumAngle,
      endAngle: cumAngle + angle,
    }
    cumAngle += angle
    return slice
  })
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

function labelPosition(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const midAngle = (startAngle + endAngle) / 2
  const labelR = r * 0.6
  return polarToCartesian(cx, cy, labelR, midAngle)
}

export default function QueVendemos({ initialData }: { initialData: VentasPorMarca[] }) {
  const [data, setData] = useState(initialData)
  const [activePreset, setActivePreset] = useState(1)
  const [isPending, startTransition] = useTransition()

  function handlePreset(idx: number) {
    setActivePreset(idx)
    const p = PRESETS[idx]
    startTransition(async () => {
      try {
        const result = await getVentasPorMarca(p.desde(), p.hasta())
        if (result) setData(result)
      } catch { /* keep previous */ }
    })
  }

  const slices = buildSlices(data)
  const total = data.reduce((s, d) => s + d.ventas, 0)
  const SIZE = 200
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = 90

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${isPending ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Qué vendemos</h2>
          <p className="text-xs text-gray-400">{total.toLocaleString('es-AR')} celulares propios</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {PRESETS.map((p, i) => (
          <button key={i} onClick={() => handlePreset(i)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${activePreset === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {slices.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
      ) : (
        <div className="flex flex-col items-center">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {slices.length === 1 ? (
              <>
                <circle cx={CX} cy={CY} r={R} fill={slices[0].color} />
                <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
                  className="fill-white text-sm font-bold">{slices[0].pct.toFixed(0)}%</text>
              </>
            ) : (
              slices.map((s) => {
                const pos = labelPosition(CX, CY, R, s.startAngle, s.endAngle)
                const showLabel = s.pct >= 5
                return (
                  <g key={s.marca}>
                    <path d={describeArc(CX, CY, R, s.startAngle, s.endAngle)} fill={s.color} />
                    {showLabel && (
                      <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                        className="fill-white font-bold" style={{ fontSize: s.pct >= 15 ? 14 : 11 }}>
                        {s.pct.toFixed(0)}%
                      </text>
                    )}
                  </g>
                )
              })
            )}
          </svg>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
            {slices.map((s) => (
              <div key={s.marca} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-gray-700">{s.marca}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
