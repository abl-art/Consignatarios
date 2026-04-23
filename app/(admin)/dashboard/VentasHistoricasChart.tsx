'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface VentaHistorica {
  fecha: string // YYYY-MM-DD
  store_name: string
  client_id: string
  ventas: number
  monto: number
}

const CLIENT_IDS_PROPIOS = ['2026134', '2461631']

interface StorePrefix {
  nombre: string
  prefix: string
}

interface Props {
  data: VentaHistorica[]
  prefixes: StorePrefix[]
}

type Granularidad = 'mensual' | 'diario'
type Canal = 'total' | 'gocelular' | 'consignatarios' | 'terceros'
type Metrica = 'pesos' | 'cantidad'

function classifyCanal(storeName: string, clientId: string, prefixes: StorePrefix[]): Canal {
  if (CLIENT_IDS_PROPIOS.includes(clientId)) return 'gocelular'
  const lower = storeName.toLowerCase()
  if (prefixes.some((p) => lower.startsWith(p.prefix.toLowerCase()))) return 'consignatarios'
  return 'terceros'
}

function abbreviate(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
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

export default function VentasHistoricasChart({ data, prefixes }: Props) {
  const [granularidad, setGranularidad] = useState<Granularidad>('mensual')
  const [canal, setCanal] = useState<Canal>('total')
  const [metrica, setMetrica] = useState<Metrica>('pesos')

  const chartData = useMemo(() => {
    // Classify and filter by canal
    const filtered = data.filter((row) => {
      if (canal === 'total') return true
      return classifyCanal(row.store_name, row.client_id, prefixes) === canal
    })

    // Group
    const groups = new Map<string, { ventas: number; monto: number }>()

    for (const row of filtered) {
      const key = granularidad === 'mensual' ? row.fecha.slice(0, 7) : row.fecha
      const existing = groups.get(key) ?? { ventas: 0, monto: 0 }
      existing.ventas += row.ventas
      existing.monto += row.monto
      groups.set(key, existing)
    }

    // Sort by date key and build chart array
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, vals]) => ({
        label: granularidad === 'mensual' ? formatMonth(key) : formatDay(key),
        valor: metrica === 'pesos' ? vals.monto : vals.ventas,
      }))
  }, [data, prefixes, granularidad, canal, metrica])

  const formatYAxis = (n: number) => {
    if (metrica === 'pesos') return `$${fmtNumber.format(n)}`
    return fmtNumber.format(n)
  }

  const formatTooltipValue = (value: number) => {
    if (metrica === 'pesos') return [`$${fmtNumber.format(value)}`, 'Monto']
    return [fmtNumber.format(value), 'Cantidad']
  }

  const formatLabel = (value: number) => {
    if (metrica === 'pesos') return `$${abbreviate(value)}`
    return abbreviate(value)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Ventas históricas</h3>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        {/* Granularidad */}
        <div className="flex items-center gap-1">
          <Pill label="Mensual" active={granularidad === 'mensual'} onClick={() => setGranularidad('mensual')} />
          <Pill label="Diario" active={granularidad === 'diario'} onClick={() => setGranularidad('diario')} />
        </div>

        {/* Canal */}
        <div className="flex items-center gap-1">
          <Pill label="Total" active={canal === 'total'} onClick={() => setCanal('total')} />
          <Pill label="GOcelular" active={canal === 'gocelular'} onClick={() => setCanal('gocelular')} />
          <Pill label="Consignatarios" active={canal === 'consignatarios'} onClick={() => setCanal('consignatarios')} />
          <Pill label="Terceros" active={canal === 'terceros'} onClick={() => setCanal('terceros')} />
        </div>

        {/* Métrica */}
        <div className="flex items-center gap-1">
          <Pill label="Pesos" active={metrica === 'pesos'} onClick={() => setMetrica('pesos')} />
          <Pill label="Cantidad" active={metrica === 'cantidad'} onClick={() => setMetrica('cantidad')} />
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11} tickFormatter={formatYAxis} />
            <Tooltip
              formatter={(value) => formatTooltipValue(Number(value))}
              labelStyle={{ color: '#374151' }}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="valor"
              stroke="#E91E7B"
              strokeWidth={2}
              dot={{ r: 4, fill: '#E91E7B' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={((props: any) => (
                <text x={props.x} y={props.y - 10} textAnchor="middle" fill="#6b7280" fontSize={9}>{formatLabel(props.value)}</text>
              )) as any}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`
}

function formatDay(yyyyMmDd: string): string {
  const [, month, day] = yyyyMmDd.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(day, 10)} ${monthNames[parseInt(month, 10) - 1]}`
}
