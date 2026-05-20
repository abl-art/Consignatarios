'use client'

import { useState, useMemo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'

interface VentaTercero {
  store_name: string
  fecha: string
  ventas: number
  monto: number
}

interface Props {
  data: VentaTercero[]
}

type Periodo = 'hoy' | 'ayer' | '7d' | 'mes' | 'todo'
type Metrica = 'cantidad' | 'pesos'

const COLORES = ['#E91E7B', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#6366F1', '#84CC16']
const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

const MERCHANT_ALIASES: Record<string, string> = { RIIING: 'RIING', RIIIING: 'RIING', DIGGIT: 'RIING' }

function getMerchant(storeName: string): string {
  const raw = storeName.split(/[\s-]/)[0].trim().toUpperCase()
  return MERCHANT_ALIASES[raw] || raw
}

function formatLabel(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function getDateRange(periodo: Periodo): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = hoy.toISOString().slice(0, 10)
  if (periodo === 'hoy') return { desde: hasta, hasta }
  if (periodo === 'ayer') {
    const ayer = new Date(hoy)
    ayer.setDate(ayer.getDate() - 1)
    return { desde: ayer.toISOString().slice(0, 10), hasta: ayer.toISOString().slice(0, 10) }
  }
  if (periodo === '7d') {
    const d = new Date(hoy)
    d.setDate(d.getDate() - 7)
    return { desde: d.toISOString().slice(0, 10), hasta }
  }
  if (periodo === 'mes') {
    return { desde: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`, hasta }
  }
  return { desde: '2020-01-01', hasta }
}

export default function TercerosChart({ data }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('todo')
  const [metrica, setMetrica] = useState<Metrica>('cantidad')
  const [merchantFiltro, setMerchantFiltro] = useState<string>('')
  const [lineMetrica, setLineMetrica] = useState<Metrica>('cantidad')

  const merchants = useMemo(() => [...new Set(data.map(d => getMerchant(d.store_name)))].sort(), [data])

  // ─── Bar chart data (por merchant) ──────────────────────────
  const barData = useMemo(() => {
    const { desde, hasta } = getDateRange(periodo)
    let filtrados = data.filter(d => d.fecha >= desde && d.fecha <= hasta)
    if (merchantFiltro) {
      filtrados = filtrados.filter(d => getMerchant(d.store_name) === merchantFiltro)
    }

    const byMerchant = new Map<string, { ventas: number; monto: number }>()
    for (const d of filtrados) {
      const key = getMerchant(d.store_name)
      const existing = byMerchant.get(key)
      if (existing) {
        existing.ventas += d.ventas
        existing.monto += d.monto
      } else {
        byMerchant.set(key, { ventas: d.ventas, monto: d.monto })
      }
    }

    const sorted = [...byMerchant.entries()]
      .map(([nombre, d]) => ({ nombre, ventas: d.ventas, monto: d.monto }))
    sorted.sort((a, b) => metrica === 'pesos' ? b.monto - a.monto : b.ventas - a.ventas)
    return sorted
  }, [data, periodo, merchantFiltro, metrica])

  const totalVentas = barData.reduce((s, d) => s + d.ventas, 0)
  const totalMonto = barData.reduce((s, d) => s + d.monto, 0)

  // ─── Line chart data (totales por mes) ──────────────────────
  const lineData = useMemo(() => {
    const byMonth = new Map<string, { ventas: number; monto: number }>()
    for (const d of data) {
      const mes = d.fecha.slice(0, 7)
      const existing = byMonth.get(mes)
      if (existing) {
        existing.ventas += d.ventas
        existing.monto += d.monto
      } else {
        byMonth.set(mes, { ventas: d.ventas, monto: d.monto })
      }
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, d]) => ({ mes, ventas: d.ventas, monto: d.monto }))
  }, [data])

  const periodos: { key: Periodo; label: string }[] = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'ayer', label: 'Ayer' },
    { key: '7d', label: '7 dias' },
    { key: 'mes', label: 'Mes' },
    { key: 'todo', label: 'Todo' },
  ]

  const barDataKey = metrica === 'pesos' ? 'monto' : 'ventas'

  return (
    <div className="space-y-6 mb-6">
      {/* ─── Gráfico de barras por merchant ─── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Ventas por merchant {merchantFiltro ? `— ${merchantFiltro}` : ''}
            </h3>
            <p className="text-xs text-gray-400">
              {totalVentas} ventas · ${fmt.format(totalMonto)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              {periodos.map(p => (
                <button key={p.key} onClick={() => setPeriodo(p.key)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${periodo === p.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button onClick={() => setMetrica('cantidad')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${metrica === 'cantidad' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Cantidad
              </button>
              <button onClick={() => setMetrica('pesos')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${metrica === 'pesos' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Pesos
              </button>
            </div>
          </div>
        </div>

        {/* Filtro merchant */}
        <div className="flex flex-wrap gap-1 mb-4">
          <button onClick={() => setMerchantFiltro('')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${!merchantFiltro ? 'bg-magenta-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Todos
          </button>
          {merchants.map(m => (
            <button key={m} onClick={() => setMerchantFiltro(m)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${merchantFiltro === m ? 'bg-magenta-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {m}
            </button>
          ))}
        </div>

        {barData.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">Sin datos para este periodo</p>
        ) : (
          <div className="w-full" style={{ height: Math.max(300, barData.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" stroke="#6b7280" fontSize={10} tickFormatter={formatLabel} />
                <YAxis type="category" dataKey="nombre" stroke="#6b7280" fontSize={10} width={220} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value) => [metrica === 'pesos' ? `$${fmt.format(Number(value))}` : fmt.format(Number(value)), metrica === 'pesos' ? 'Monto' : 'Ventas']}
                  labelStyle={{ color: '#374151', fontWeight: 600 }}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}
                />
                <Bar dataKey={barDataKey} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: '#374151', formatter: (v: unknown) => Number(v) > 0 ? formatLabel(Number(v)) : '' }}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ─── Gráfico de líneas: ventas totales por mes ─── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Ventas totales por mes</h3>
            <p className="text-xs text-gray-400">Evolucion mensual de terceros</p>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setLineMetrica('cantidad')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${lineMetrica === 'cantidad' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Cantidad
            </button>
            <button onClick={() => setLineMetrica('pesos')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${lineMetrica === 'pesos' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Pesos
            </button>
          </div>
        </div>

        {lineData.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">Sin datos</p>
        ) : (
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" stroke="#6b7280" fontSize={10} />
                <YAxis stroke="#6b7280" fontSize={10} tickFormatter={formatLabel} />
                <Tooltip
                  formatter={(value) => [lineMetrica === 'pesos' ? `$${fmt.format(Number(value))}` : fmt.format(Number(value)), lineMetrica === 'pesos' ? 'Monto' : 'Ventas']}
                  labelStyle={{ color: '#374151', fontWeight: 600 }}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}
                />
                <Line
                  type="monotone"
                  dataKey={lineMetrica === 'pesos' ? 'monto' : 'ventas'}
                  stroke={lineMetrica === 'pesos' ? '#10B981' : '#3B82F6'}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: lineMetrica === 'pesos' ? '#10B981' : '#3B82F6' }}
                  activeDot={{ r: 6 }}
                  label={{ position: 'top', fontSize: 10, fill: '#374151', formatter: (v: unknown) => Number(v) > 0 ? formatLabel(Number(v)) : '' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
