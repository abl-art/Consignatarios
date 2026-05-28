'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface VentaDiaria {
  fecha: string // YYYY-MM-DD
  cantidad: number
  monto: number
}

interface Props {
  data: VentaDiaria[]
  producto: string
}

type Agrupacion = 'totales' | 'diarias' | 'semanales' | 'mensuales'
type Metrica = 'cantidad' | 'pesos'

function abbreviate(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

const fmtNumber = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function getISOWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday.toISOString().slice(0, 10)
}

function formatDay(yyyyMmDd: string): string {
  const [, month, day] = yyyyMmDd.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(day, 10)} ${monthNames[parseInt(month, 10) - 1]}`
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`
}

export default function AccesoriosVentasChart({ data, producto }: Props) {
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('mensuales')
  const [metrica, setMetrica] = useState<Metrica>('cantidad')

  const chartData = useMemo(() => {
    if (agrupacion === 'totales') {
      const totalCantidad = data.reduce((sum, row) => sum + row.cantidad, 0)
      const totalMonto = data.reduce((sum, row) => sum + row.monto, 0)
      return [{ label: 'Total', valor: metrica === 'pesos' ? totalMonto : totalCantidad }]
    }

    const groups = new Map<string, { cantidad: number; monto: number }>()

    for (const row of data) {
      let key: string
      if (agrupacion === 'diarias') {
        key = row.fecha
      } else if (agrupacion === 'semanales') {
        key = getISOWeekMonday(row.fecha)
      } else {
        // mensuales
        key = row.fecha.slice(0, 7)
      }

      const existing = groups.get(key) ?? { cantidad: 0, monto: 0 }
      existing.cantidad += row.cantidad
      existing.monto += row.monto
      groups.set(key, existing)
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, vals]) => {
        let label: string
        if (agrupacion === 'diarias') {
          label = formatDay(key)
        } else if (agrupacion === 'semanales') {
          label = `Sem ${formatDay(key)}`
        } else {
          label = formatMonth(key)
        }
        return { label, valor: metrica === 'pesos' ? vals.monto : vals.cantidad }
      })
  }, [data, agrupacion, metrica])

  const formatYAxis = (n: number) => {
    if (metrica === 'pesos') return `$${fmtNumber.format(n)}`
    return fmtNumber.format(n)
  }

  const formatTooltipValue = (value: number): [string, string] => {
    if (metrica === 'pesos') return [`$${fmtNumber.format(value)}`, 'Monto']
    return [fmtNumber.format(value), 'Cantidad']
  }

  const formatLabel = (value: number) => {
    if (metrica === 'pesos') return `$${abbreviate(value)}`
    return abbreviate(value)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Ventas — {producto}</h3>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        {/* Agrupación */}
        <div className="flex items-center gap-1">
          <Pill label="Totales" active={agrupacion === 'totales'} onClick={() => setAgrupacion('totales')} />
          <Pill label="Diarias" active={agrupacion === 'diarias'} onClick={() => setAgrupacion('diarias')} />
          <Pill label="Semanales" active={agrupacion === 'semanales'} onClick={() => setAgrupacion('semanales')} />
          <Pill label="Mensuales" active={agrupacion === 'mensuales'} onClick={() => setAgrupacion('mensuales')} />
        </div>

        {/* Métrica */}
        <div className="flex items-center gap-1">
          <Pill label="Cantidad" active={metrica === 'cantidad'} onClick={() => setMetrica('cantidad')} />
          <Pill label="Pesos" active={metrica === 'pesos'} onClick={() => setMetrica('pesos')} />
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
                <text x={props.x} y={props.y - 10} textAnchor="middle" fill="#6b7280" fontSize={9}>
                  {formatLabel(props.value)}
                </text>
              )) as any}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
