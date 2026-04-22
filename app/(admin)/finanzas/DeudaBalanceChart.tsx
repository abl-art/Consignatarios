'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { DeudaPrestamo } from '@/lib/types'

interface Props {
  data: { cash_date: string; cash_balance: number }[]
  prestamos: DeudaPrestamo[]
}

type Periodo = 'total' | '3m' | '2m' | '1m'

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function formatDate(ds: string): string {
  const [, m, d] = ds.split('-')
  return `${d}/${m}`
}

function formatLabel(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function getEndDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months + 1, 0)
  return d.toISOString().slice(0, 10)
}

function getStartOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function DeudaBalanceChart({ data, prestamos }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('1m')

  // Calcular saldo de deuda por día
  const chartData = useMemo(() => {
    const activos = prestamos.filter(p => p.estado === 'activo')

    const deudaPorDia = data.map(d => {
      // Sumar saldo capital de préstamos activos a esa fecha
      let saldoDeuda = 0
      for (const p of activos) {
        if (d.cash_date >= p.fecha_toma) {
          if (!p.fecha_vencimiento || d.cash_date < p.fecha_vencimiento) {
            saldoDeuda += p.saldo_capital
          }
        }
      }
      return { cash_date: d.cash_date, deuda: saldoDeuda }
    })

    if (periodo === 'total') return deudaPorDia
    const start = getStartOfMonth()
    const months = periodo === '3m' ? 3 : periodo === '2m' ? 2 : 1
    const end = getEndDate(months)
    return deudaPorDia.filter(d => d.cash_date >= start && d.cash_date <= end)
  }, [data, prestamos, periodo])

  if (data.length === 0) return null

  const mapped = chartData.map(d => ({
    label: formatDate(d.cash_date),
    deuda: Math.round(d.deuda),
  }))

  const periodos: { key: Periodo; label: string }[] = [
    { key: '1m', label: '1 mes' },
    { key: '2m', label: '2 meses' },
    { key: '3m', label: '3 meses' },
    { key: 'total', label: 'Total' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Saldo de deuda</h3>
          <p className="text-xs text-gray-400">Evolución diaria del endeudamiento</p>
        </div>
        <div className="flex gap-1">
          {periodos.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                periodo === p.key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mapped} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={10} interval="preserveStartEnd" />
            <YAxis stroke="#6b7280" fontSize={10} tickFormatter={formatLabel} domain={[0, 'auto']} />
            <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1} />
            <Tooltip
              formatter={(value) => [`$${fmt.format(Number(value))}`, 'Deuda']}
              labelStyle={{ color: '#374151' }}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="deuda"
              stroke="#EF4444"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#EF4444' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
