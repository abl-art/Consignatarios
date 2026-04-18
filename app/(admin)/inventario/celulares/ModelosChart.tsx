'use client'

import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface VentaModelo {
  fecha: string // YYYY-MM-DD
  store_name: string
  modelo: string
  ventas: number
}

interface StorePrefix {
  nombre: string
  prefix: string
}

interface Props {
  data: VentaModelo[]
  prefixes: StorePrefix[]
}

type Canal = 'todos' | 'gocelular' | 'consignatarios' | 'terceros'
type Tiempo = '30d' | '7d' | 'ayer' | 'hoy' | 'personalizado'

function classifyCanal(storeName: string, prefixes: StorePrefix[]): Exclude<Canal, 'todos'> {
  const lower = storeName.toLowerCase()
  if (lower.startsWith('ecommerce')) return 'gocelular'
  if (prefixes.some((p) => lower.startsWith(p.prefix.toLowerCase()))) return 'consignatarios'
  return 'terceros'
}

function cleanModelName(storeName: string): string {
  let name = storeName
  if (name.startsWith('Celular ')) name = name.slice('Celular '.length)
  if (name.startsWith('Ecommerce-')) name = name.slice('Ecommerce-'.length)
  return name
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str
}

function todayStr(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const fmtNumber = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function Pill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
        active
          ? 'bg-[#E91E7B] text-white border-[#E91E7B]'
          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
      }`}
    >
      {label}
    </button>
  )
}

export default function ModelosChart({ data, prefixes }: Props) {
  const [canal, setCanal] = useState<Canal>('todos')
  const [tiempo, setTiempo] = useState<Tiempo>('30d')
  const [desde, setDesde] = useState(daysAgo(30))
  const [hasta, setHasta] = useState(todayStr())

  const chartData = useMemo(() => {
    // Determine date range
    let fechaDesde: string
    let fechaHasta: string
    const hoy = todayStr()

    switch (tiempo) {
      case 'hoy':
        fechaDesde = hoy
        fechaHasta = hoy
        break
      case 'ayer':
        fechaDesde = daysAgo(1)
        fechaHasta = daysAgo(1)
        break
      case '7d':
        fechaDesde = daysAgo(6)
        fechaHasta = hoy
        break
      case '30d':
        fechaDesde = daysAgo(29)
        fechaHasta = hoy
        break
      case 'personalizado':
        fechaDesde = desde
        fechaHasta = hasta
        break
    }

    // Filter by canal and date range
    const filtered = data.filter((row) => {
      if (canal !== 'todos' && classifyCanal(row.store_name, prefixes) !== canal) return false
      if (row.fecha < fechaDesde || row.fecha > fechaHasta) return false
      return true
    })

    // Group by cleaned model name and sum ventas
    const groups = new Map<string, number>()
    for (const row of filtered) {
      const model = row.modelo || 'Desconocido'
      groups.set(model, (groups.get(model) ?? 0) + row.ventas)
    }

    // Sort descending by ventas, take top 15
    return Array.from(groups.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([modelo, ventas]) => ({ modelo, ventas }))
  }, [data, prefixes, canal, tiempo, desde, hasta])

  const chartHeight = Math.max(256, chartData.length * 30 + 40)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Ventas por modelo</h3>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        {/* Canal */}
        <div className="flex items-center gap-1">
          <Pill label="Todos" active={canal === 'todos'} onClick={() => setCanal('todos')} />
          <Pill label="GOcelular" active={canal === 'gocelular'} onClick={() => setCanal('gocelular')} />
          <Pill label="Consignatarios" active={canal === 'consignatarios'} onClick={() => setCanal('consignatarios')} />
          <Pill label="Terceros" active={canal === 'terceros'} onClick={() => setCanal('terceros')} />
        </div>

        {/* Tiempo */}
        <div className="flex items-center gap-1">
          <Pill label="30 dias" active={tiempo === '30d'} onClick={() => setTiempo('30d')} />
          <Pill label="7 dias" active={tiempo === '7d'} onClick={() => setTiempo('7d')} />
          <Pill label="Ayer" active={tiempo === 'ayer'} onClick={() => setTiempo('ayer')} />
          <Pill label="Hoy" active={tiempo === 'hoy'} onClick={() => setTiempo('hoy')} />
          <Pill label="Personalizado" active={tiempo === 'personalizado'} onClick={() => setTiempo('personalizado')} />
        </div>

        {/* Custom date range */}
        {tiempo === 'personalizado' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md"
            />
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md"
            />
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="w-full" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 40, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" stroke="#6b7280" fontSize={11} tickFormatter={(v) => fmtNumber.format(v)} />
            <YAxis
              type="category"
              dataKey="modelo"
              stroke="#6b7280"
              fontSize={11}
              width={160}
              tickFormatter={(v) => truncate(v, 25)}
            />
            <Tooltip
              formatter={(value) => [fmtNumber.format(Number(value)), 'Ventas']}
              labelStyle={{ color: '#374151' }}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="ventas" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#6b7280' }}>
              {chartData.map((_, index) => (
                <Cell key={index} fill="#E91E7B" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
