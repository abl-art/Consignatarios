'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { setComprasDias } from '@/lib/actions/finanzas'

interface CompraRecomendacion {
  modelo: string
  forecast: number
  stock_actual: number
  comprar: number
}

interface Props {
  apiUrl: string // e.g. "https://gocelular-forecast-production.up.railway.app"
  events: Record<string, number>
  dias: number
}

const formatoNumero = new Intl.NumberFormat('es-AR')
const DIAS_OPTIONS = [15, 30, 45, 60, 90]

export default function ComprasTab({ apiUrl, events, dias: initialDias }: Props) {
  const router = useRouter()
  const [data, setData] = useState<CompraRecomendacion[]>([])
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(initialDias)
  const [customDias, setCustomDias] = useState('')
  const isCustom = !DIAS_OPTIONS.includes(dias)

  useEffect(() => {
    setLoading(true)
    fetch(`${apiUrl}/forecast/compras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, days: dias }),
    })
      .then((res) => res.json())
      .then((json: CompraRecomendacion[]) => {
        setData(json)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [apiUrl, events, dias])

  async function handleDiasChange(newDias: number) {
    setDias(newDias)
    await setComprasDias(newDias)
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        Calculando recomendaciones...
      </div>
    )
  }

  const chartHeight = Math.max(300, data.length * 40)

  return (
    <div className="space-y-6">
      {/* Dias selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">Horizonte de compras</p>
        <div className="flex flex-wrap items-center gap-2">
          {DIAS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => handleDiasChange(d)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                dias === d
                  ? 'bg-magenta-600 text-white border-magenta-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-magenta-300'
              }`}
            >
              {d}d
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="1"
              placeholder="Otro"
              className="w-16 text-sm text-center border border-gray-300 rounded-full px-2 py-1"
              value={isCustom ? dias : customDias}
              onChange={(e) => setCustomDias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = parseInt(customDias, 10)
                  if (v > 0) handleDiasChange(v)
                }
              }}
            />
            {customDias && (
              <button
                onClick={() => {
                  const v = parseInt(customDias, 10)
                  if (v > 0) handleDiasChange(v)
                }}
                className="text-xs text-magenta-600 hover:underline"
              >
                OK
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Recomendaci&oacute;n de compras &mdash; pr&oacute;ximos {dias} d&iacute;as
        </h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Basado en forecast de ventas vs stock actual
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4 font-medium">Modelo</th>
                <th className="py-2 pr-4 font-medium text-right">Forecast {dias}d</th>
                <th className="py-2 pr-4 font-medium text-right">Stock actual</th>
                <th className="py-2 font-medium text-right">Comprar</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.modelo} className="border-b border-gray-100">
                  <td className="py-2 pr-4 text-gray-900">{row.modelo}</td>
                  <td className="py-2 pr-4 text-right text-gray-700">
                    {formatoNumero.format(row.forecast)}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-700">
                    {formatoNumero.format(row.stock_actual)}
                  </td>
                  <td
                    className={`py-2 text-right font-bold ${
                      row.comprar > 0 ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {row.comprar > 0 ? formatoNumero.format(row.comprar) : 'OK'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart layout="vertical" data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="modelo" type="category" width={150} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatoNumero.format(Number(value))} />
            <Legend />
            <Bar dataKey="stock_actual" name="Stock actual" fill="#10B981" />
            <Bar dataKey="comprar" name="Comprar" fill="#EF4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
