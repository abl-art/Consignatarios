'use client'

import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface PlazoData {
  proveedor: string
  categoria: string
  dias: number
}

const COLORES = ['#E91E7B', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444']

export default function PlazoEntrega({ data }: { data: PlazoData[] }) {
  const [catAbierta, setCatAbierta] = useState<string | null>(null)

  // Agrupar por categoría
  const porCategoria = useMemo(() => {
    const map: Record<string, PlazoData[]> = {}
    data.forEach(d => {
      if (!map[d.categoria]) map[d.categoria] = []
      map[d.categoria].push(d)
    })
    return Object.entries(map).map(([cat, items]) => {
      const promedio = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.dias, 0) / items.length) : 0
      return { categoria: cat, promedio, items }
    }).sort((a, b) => b.items.length - a.items.length)
  }, [data])

  // Datos por proveedor para la categoría abierta
  const barData = useMemo(() => {
    if (!catAbierta) return []
    const cat = porCategoria.find(c => c.categoria === catAbierta)
    if (!cat) return []
    const porProv: Record<string, { total: number; count: number }> = {}
    cat.items.forEach(i => {
      if (!porProv[i.proveedor]) porProv[i.proveedor] = { total: 0, count: 0 }
      porProv[i.proveedor].total += i.dias
      porProv[i.proveedor].count++
    })
    return Object.entries(porProv)
      .map(([prov, d]) => ({ proveedor: prov, promedio: Math.round(d.total / d.count) }))
      .sort((a, b) => a.promedio - b.promedio)
  }, [catAbierta, porCategoria])

  const promedioGeneral = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.dias, 0) / data.length) : 0

  return (
    <div className="mt-8">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Plazo promedio de entrega</h2>
      <p className="text-sm text-gray-500 mb-4">Desde envío del pedido hasta recepción. Click en una categoría para ver el detalle por proveedor.</p>

      {/* Contador general */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex-1 min-w-[140px]">
          <p className="text-xs text-gray-500 mb-1">Promedio general</p>
          <p className="text-4xl font-bold text-gray-900">{promedioGeneral}<span className="text-lg text-gray-400 ml-1">días</span></p>
          <p className="text-xs text-gray-400 mt-1">{data.length} pedidos entregados</p>
        </div>
        {porCategoria.map(cat => (
          <button
            key={cat.categoria}
            onClick={() => setCatAbierta(prev => prev === cat.categoria ? null : cat.categoria)}
            className={`bg-white rounded-xl border p-5 flex-1 min-w-[140px] text-left transition-all ${
              catAbierta === cat.categoria ? 'border-magenta-400 ring-2 ring-magenta-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-xs text-gray-500 mb-1">{cat.categoria}</p>
            <p className="text-3xl font-bold text-gray-900">{cat.promedio}<span className="text-base text-gray-400 ml-1">días</span></p>
            <p className="text-xs text-gray-400 mt-1">{cat.items.length} pedidos</p>
          </button>
        ))}
      </div>

      {/* Gráfico de barras por proveedor */}
      {catAbierta && barData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">{catAbierta} — plazo por proveedor</h3>
          <p className="text-xs text-gray-400 mb-4">Promedio de días de entrega</p>
          <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#6b7280" fontSize={11} tickFormatter={v => `${v}d`} />
                <YAxis type="category" dataKey="proveedor" stroke="#6b7280" fontSize={11} width={120} />
                <Tooltip formatter={(v) => [`${v} días`, 'Promedio']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="promedio" radius={[0, 4, 4, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
