'use client'

import { useEffect, useState } from 'react'
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

interface CompraRecomendacion {
  modelo: string
  forecast_15d: number
  stock_actual: number
  comprar: number
}

interface Props {
  apiUrl: string // e.g. "https://gocelular-forecast-production.up.railway.app"
}

const formatoNumero = new Intl.NumberFormat('es-AR')

export default function ComprasTab({ apiUrl }: Props) {
  const [data, setData] = useState<CompraRecomendacion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiUrl}/forecast/compras`)
      .then((res) => res.json())
      .then((json: CompraRecomendacion[]) => {
        setData(json)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [apiUrl])

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
      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Recomendaci&oacute;n de compras &mdash; pr&oacute;ximos 15 d&iacute;as
        </h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Basado en forecast de ventas vs stock actual
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4 font-medium">Modelo</th>
                <th className="py-2 pr-4 font-medium text-right">Forecast 15d</th>
                <th className="py-2 pr-4 font-medium text-right">Stock actual</th>
                <th className="py-2 font-medium text-right">Comprar</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.modelo} className="border-b border-gray-100">
                  <td className="py-2 pr-4 text-gray-900">{row.modelo}</td>
                  <td className="py-2 pr-4 text-right text-gray-700">
                    {formatoNumero.format(row.forecast_15d)}
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
