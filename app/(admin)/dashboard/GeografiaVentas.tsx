'use client'

import { useEffect, useRef, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { VentasPorProvincia, VentasPorCiudad } from '@/lib/gocelular'

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

  const svgRef = useRef<HTMLObjectElement>(null)

  // Color provinces when SVG loads
  useEffect(() => {
    function colorize() {
      const obj = svgRef.current
      if (!obj) return
      const svgDoc = obj.contentDocument
      if (!svgDoc) return

      const paths = svgDoc.querySelectorAll('path[data-prov]')
      paths.forEach((path) => {
        const prov = path.getAttribute('data-prov') || ''
        const ordenes = provMap.get(prov) ?? 0
        const isTop = top5.has(prov)
        const intensity = ordenes > 0 ? Math.max(0.2, ordenes / maxOrdenes) : 0

        let fill = '#f3f4f6'
        if (ordenes > 0) {
          if (isTop) {
            const r = 233, g = Math.round(30 + (1 - intensity) * 180), b = Math.round(123 + (1 - intensity) * 100)
            fill = `rgb(${r},${g},${b})`
          } else {
            const r = Math.round(99 + (1 - intensity) * 140), g = Math.round(102 + (1 - intensity) * 140), b = Math.round(241 - (1 - intensity) * 40)
            fill = `rgb(${r},${g},${b})`
          }
        }

        const el = path as SVGPathElement
        el.style.fill = fill
        el.style.stroke = isTop ? '#E91E7B' : '#9ca3af'
        el.style.strokeWidth = isTop ? '1.5' : '0.5'
        el.style.cursor = 'default'

        // Add number label
        if (ordenes > 0) {
          const bbox = el.getBBox()
          const cx = bbox.x + bbox.width / 2
          const cy = bbox.y + bbox.height / 2
          const text = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'text')
          text.setAttribute('x', String(cx))
          text.setAttribute('y', String(cy))
          text.setAttribute('text-anchor', 'middle')
          text.setAttribute('dominant-baseline', 'central')
          text.setAttribute('font-size', ordenes >= 100 ? '22' : '18')
          text.setAttribute('font-weight', '700')
          text.setAttribute('fill', intensity > 0.4 ? '#fff' : '#111827')
          text.setAttribute('pointer-events', 'none')
          text.textContent = String(ordenes)
          el.parentElement?.appendChild(text)
        }
      })
    }

    const obj = svgRef.current
    if (obj) {
      obj.addEventListener('load', colorize)
      // Also try immediately in case already loaded
      setTimeout(colorize, 100)
    }
    return () => { obj?.removeEventListener('load', colorize) }
  }, [provMap, top5, maxOrdenes])

  return (
    <div className="space-y-4">
      {/* Mapa */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Ventas por provincia</h3>
        <p className="text-[10px] text-gray-400 mb-2">{total} ordenes propias</p>
        <div className="flex justify-center">
          <object ref={svgRef} data="/argentina-provincias.svg" type="image/svg+xml"
            className="w-full max-w-[240px] h-auto" />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2 justify-center">
          {provincias.slice(0, 5).map((p, i) => (
            <span key={p.provincia} className="text-[10px] px-2 py-0.5 rounded-full bg-magenta-100 text-magenta-700 font-medium">
              {i + 1}. {p.provincia} ({p.ordenes})
            </span>
          ))}
        </div>
      </div>

      {/* Torta */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Top 10 ciudades</h3>
        <p className="text-[10px] text-gray-400 mb-3">Por cantidad de ordenes propias</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={ciudades} dataKey="ordenes" nameKey="ciudad" cx="50%" cy="50%"
                outerRadius={75} innerRadius={30} paddingAngle={2} label={false}>
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
