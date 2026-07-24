'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatearMoneda } from '@/lib/utils'
import Link from 'next/link'

interface TerceroAlta {
  clientId: string
  merchantName: string
  tiendas: number
  ventasCantidad: number
  ventasMonto: number
  ventasAyerCantidad: number
  ventasAyerMonto: number
}

interface VentaDiaria {
  clientId: string
  merchantName: string
  fecha: string
  cantidad: number
  monto: number
}

type Periodo = 'ayer' | '7d' | '30d' | 'mes' | 'custom'

const COLORES = ['#E91E7B', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444']
const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function getDateRange(periodo: Periodo): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = hoy.toISOString().slice(0, 10)

  if (periodo === 'ayer') {
    const ayer = new Date(hoy)
    ayer.setDate(ayer.getDate() - 1)
    const d = ayer.toISOString().slice(0, 10)
    return { desde: d, hasta: d }
  }
  if (periodo === '7d') {
    const d = new Date(hoy)
    d.setDate(d.getDate() - 7)
    return { desde: d.toISOString().slice(0, 10), hasta }
  }
  if (periodo === '30d') {
    const d = new Date(hoy)
    d.setDate(d.getDate() - 30)
    return { desde: d.toISOString().slice(0, 10), hasta }
  }
  if (periodo === 'mes') {
    return { desde: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`, hasta }
  }
  return { desde: '', hasta: '' }
}

interface Props {
  terceros: TerceroAlta[]
  ventasDiarias: VentaDiaria[]
}

export default function AltasClient({ terceros, ventasDiarias }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('30d')
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')
  const [merchantFiltro, setMerchantFiltro] = useState('')

  const merchants = useMemo(
    () => [...new Set(ventasDiarias.map(v => v.merchantName))].sort(),
    [ventasDiarias]
  )

  const { desde, hasta } = periodo === 'custom'
    ? { desde: customDesde, hasta: customHasta }
    : getDateRange(periodo)

  // Filter ventas by date range and merchant
  const ventasFiltradas = useMemo(() => {
    let filtered = ventasDiarias
    if (desde) filtered = filtered.filter(v => v.fecha >= desde)
    if (hasta) filtered = filtered.filter(v => v.fecha <= hasta)
    if (merchantFiltro) filtered = filtered.filter(v => v.merchantName === merchantFiltro)
    return filtered
  }, [ventasDiarias, desde, hasta, merchantFiltro])

  // Table summary per merchant for the selected period
  const resumenPorMerchant = useMemo(() => {
    const map = new Map<string, { clientId: string; merchantName: string; cantidad: number; monto: number }>()
    for (const v of ventasFiltradas) {
      const existing = map.get(v.clientId)
      if (existing) {
        existing.cantidad += v.cantidad
        existing.monto += v.monto
      } else {
        map.set(v.clientId, { clientId: v.clientId, merchantName: v.merchantName, cantidad: v.cantidad, monto: v.monto })
      }
    }
    return [...map.values()]
  }, [ventasFiltradas])

  // Line chart: one line per merchant, grouped by date
  const lineData = useMemo(() => {
    const activeMerchants = merchantFiltro
      ? [merchantFiltro]
      : merchants

    const dateMap = new Map<string, Record<string, number>>()
    for (const v of ventasFiltradas) {
      if (!activeMerchants.includes(v.merchantName)) continue
      const existing = dateMap.get(v.fecha) || {}
      existing[v.merchantName] = (existing[v.merchantName] || 0) + v.cantidad
      dateMap.set(v.fecha, existing)
    }

    return [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, merchants]) => ({ fecha, ...merchants }))
  }, [ventasFiltradas, merchants, merchantFiltro])

  const activeMerchants = merchantFiltro ? [merchantFiltro] : merchants

  const totalCantidad = resumenPorMerchant.reduce((s, m) => s + m.cantidad, 0)
  const totalMonto = resumenPorMerchant.reduce((s, m) => s + m.monto, 0)

  const periodos: { key: Periodo; label: string }[] = [
    { key: 'ayer', label: 'Ayer' },
    { key: '7d', label: 'Últimos 7 días' },
    { key: '30d', label: 'Últimos 30 días' },
    { key: 'mes', label: 'Mes actual' },
    { key: 'custom', label: 'Personalizado' },
  ]

  return (
    <div className="space-y-6">
      {/* Filter pills */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-gray-500">Periodo:</span>
          <div className="flex flex-wrap gap-2">
            {periodos.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  periodo === p.key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {periodo === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customDesde}
                onChange={e => setCustomDesde(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
              />
              <span className="text-xs text-gray-400">a</span>
              <input
                type="date"
                value={customHasta}
                onChange={e => setCustomHasta(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Merchant:</span>
            <select
              value={merchantFiltro}
              onChange={e => setMerchantFiltro(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
            >
              <option value="">Todos</option>
              {merchants.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Merchant</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Client ID</th>
              <th className="text-right px-5 py-3 font-medium text-gray-600">Tiendas</th>
              <th className="text-right px-5 py-3 font-medium text-gray-600">Ventas</th>
              <th className="text-right px-5 py-3 font-medium text-gray-600">Monto</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {terceros
              .filter(t => !merchantFiltro || t.merchantName === merchantFiltro)
              .map(t => {
                const resumen = resumenPorMerchant.find(r => r.clientId === t.clientId)
                return (
                  <tr key={t.clientId} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-semibold text-gray-900">{t.merchantName}</td>
                    <td className="px-5 py-3 text-gray-500">
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{t.clientId}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{t.tiendas}</td>
                    <td className="px-5 py-3 text-right font-semibold text-blue-600">{resumen?.cantidad ?? 0}</td>
                    <td className="px-5 py-3 text-right font-semibold text-green-700">{formatearMoneda(resumen?.monto ?? 0)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/dashboard/terceros?merchant=${t.merchantName}`}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        Ver dashboard →
                      </Link>
                    </td>
                  </tr>
                )
              })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold">
              <td className="px-5 py-3 text-gray-900">TOTAL</td>
              <td className="px-5 py-3"></td>
              <td className="px-5 py-3 text-right text-gray-900">
                {terceros.filter(t => !merchantFiltro || t.merchantName === merchantFiltro).reduce((s, t) => s + t.tiendas, 0)}
              </td>
              <td className="px-5 py-3 text-right text-blue-600">{totalCantidad}</td>
              <td className="px-5 py-3 text-right text-green-700">{formatearMoneda(totalMonto)}</td>
              <td className="px-5 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Line chart per merchant */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700">
            Ventas diarias por merchant {merchantFiltro ? `— ${merchantFiltro}` : ''}
          </h3>
          <p className="text-xs text-gray-400">
            {totalCantidad} ventas · {formatearMoneda(totalMonto)}
          </p>
        </div>

        {lineData.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">Sin datos para este periodo</p>
        ) : (
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="fecha"
                  stroke="#6b7280"
                  fontSize={10}
                  tickFormatter={v => v.slice(5)}
                />
                <YAxis stroke="#6b7280" fontSize={10} />
                <Tooltip
                  labelStyle={{ color: '#374151', fontWeight: 600 }}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}
                  formatter={(value) => [fmt.format(Number(value)), '']}
                />
                <Legend />
                {activeMerchants.map((m, i) => (
                  <Line
                    key={m}
                    type="monotone"
                    dataKey={m}
                    stroke={COLORES[i % COLORES.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
