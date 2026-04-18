'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ForecastRow {
  ds: string
  y: number | null
  yhat: number | null
  yhat_lower: number | null
  yhat_upper: number | null
}

interface Props {
  apiUrl: string // e.g. "https://gocelular-forecast-production.up.railway.app"
  events: Record<string, number>
}

function formatDsMm(ds: string): string {
  const [, month, day] = ds.split('-')
  return `${day}/${month}`
}

const fmtNumber = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

export default function ForecastChart({ apiUrl, events }: Props) {
  const [data, setData] = useState<ForecastRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${apiUrl}/forecast/total`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, days: 90 }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`)
        return res.json()
      })
      .then((rows: ForecastRow[]) => setData(rows))
      .catch((err) => setError(err.message))
  }, [apiUrl, events])

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Forecast de ventas (90 días)</h3>
        <p className="text-sm text-red-500">Error: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Forecast de ventas (90 días)</h3>
        <p className="text-sm text-gray-500">Cargando forecast...</p>
      </div>
    )
  }

  const chartData = data.map((row) => ({
    label: formatDsMm(row.ds),
    y: row.y != null ? Math.round(row.y) : null,
    yhat: row.yhat != null ? Math.round(row.yhat) : null,
  }))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Forecast de ventas (90 días)</h3>

      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(n: number) => fmtNumber.format(n)} />
            <Tooltip
              formatter={(value, name) => [
                fmtNumber.format(Number(value)),
                String(name) === 'y' ? 'Actual' : 'Forecast',
              ]}
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
              dataKey="y"
              name="Actual"
              stroke="#E91E7B"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="yhat"
              name="Forecast"
              stroke="#3B82F6"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
