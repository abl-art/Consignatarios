'use client'

// Torta de share de ventas por marca — mismo cuadro que "Qué vendemos" del
// Dashboard 360, replicado para el link de Samsung. Colores FIJOS por marca
// (el color sigue a la entidad, paleta validada dataviz): Samsung siempre azul.

import type { VentaMarca } from '@/lib/partner-samsung'

const COLOR_MARCA: Record<string, string> = {
  Samsung: '#2a78d6',
  Motorola: '#eb6834',
  Xiaomi: '#1baf7a',
  Nubia: '#e87ba4',
}
const COLORES_RESTO = ['#4a3aa7', '#eda100', '#e34948', '#52514e']

function colorDe(marca: string, fallbackIdx: number): string {
  return COLOR_MARCA[marca] ?? COLORES_RESTO[Math.min(fallbackIdx, COLORES_RESTO.length - 1)]
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

export default function PieMarcas({ titulo, subtitulo, data }: { titulo: string; subtitulo: string; data: VentaMarca[] }) {
  const total = data.reduce((s, d) => s + d.ventas, 0)
  const SIZE = 180
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = 80

  let cumAngle = 0
  let fallbackIdx = 0
  const slices = data.map(d => {
    const pct = total > 0 ? (d.ventas / total) * 100 : 0
    const angle = total > 0 ? (d.ventas / total) * 360 : 0
    const color = COLOR_MARCA[d.marca] ? colorDe(d.marca, 0) : colorDe(d.marca, fallbackIdx++)
    const slice = { ...d, pct, color, startAngle: cumAngle, endAngle: cumAngle + angle }
    cumAngle += angle
    return slice
  })

  return (
    <div className="flex flex-col items-center">
      <p className="text-sm font-semibold text-gray-900">{titulo}</p>
      <p className="text-xs text-gray-400 mb-2">{subtitulo}</p>
      {total === 0 ? (
        <p className="text-sm text-gray-400 py-10">Sin ventas en el período</p>
      ) : (
        <>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {slices.length === 1 ? (
              <circle cx={CX} cy={CY} r={R} fill={slices[0].color} />
            ) : (
              slices.map(s => (
                <path
                  key={s.marca}
                  d={describeArc(CX, CY, R, s.startAngle, s.endAngle)}
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ))
            )}
            {slices.filter(s => s.pct >= 5).map(s => {
              const mid = (s.startAngle + s.endAngle) / 2
              const pos = polarToCartesian(CX, CY, R * 0.6, mid)
              return (
                <text key={s.marca} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                  className="fill-white font-bold" style={{ fontSize: s.pct >= 15 ? 13 : 10 }}>
                  {s.pct.toFixed(0)}%
                </text>
              )
            })}
          </svg>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 max-w-[260px]">
            {slices.map(s => (
              <div key={s.marca} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-gray-700">
                  {s.marca} <span className="text-gray-400">{s.pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
